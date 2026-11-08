"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Bookmark,
  Check,
  ExternalLink,
  LogOut,
  RefreshCw,
  Search,
} from "lucide-react";
import { AuthScreen } from "@/components/auth-screen";
import { ProfileForm } from "@/components/profile-form";
import { SkillDevelopment } from "@/components/skill-development";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationSettingsTab } from "@/components/notification-settings";
import { CompaniesTab } from "@/components/companies";
import { DeleteAccount } from "@/components/delete-account";
import { PriorityCompanyButton } from "@/components/priority-company-button";
import { JobLocationFilter } from "@/components/job-location-filter";
import { JobSkillBreakdown, SkillMatchBadge, type SkillMatchState } from "@/components/job-skill-match";
import { getJobSkillMatch, meetsSkillMinimum, type JobSkillMatch } from "@/lib/job-skill-match";
import type { ParsedResume, ResumeDraft } from "@/lib/resume";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchApplications,
  fetchPriorityCompanyIds,
  fetchJob,
  fetchJobsForTargetRoles,
  fetchOpenJobs,
  fetchProfile,
  fetchUserSkillIds,
  removeApplication,
  setApplicationStatus,
} from "@/lib/data";
import { navItems } from "@/lib/mock-data";
import { parseTargetRoles } from "@/lib/job-personalization";
import { matchesPostedDate, matchesLocation, matchesAnyLocation, POSTED_DATE_FILTERS, type LocationFilter, type PostedDateFilter } from "@/lib/job-filters";
import { supabase } from "@/lib/supabase";
import {
  TRACKER_COLUMNS,
  WORK_MODE_LABELS,
  type Application,
  type ApplicationStatus,
  type Job,
  type Profile,
  type WorkMode,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Page: decides whether to show setup help, the login screen, or the dashboard
// ---------------------------------------------------------------------------

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) return <SetupMessage />;
  if (checkingSession) return <CenteredText text="Loading…" />;
  if (!session) return <AuthScreen />;
  return <Dashboard key={session.user.id} userId={session.user.id} email={session.user.email ?? ""} />;
}

// ---------------------------------------------------------------------------
// Dashboard (signed in)
// ---------------------------------------------------------------------------

type WorkModeFilter = "all" | WorkMode;
type JobView = "for_you" | "all";
const WORK_MODE_FILTERS: { value: WorkModeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "in_person", label: "In person" },
];

function Dashboard({ userId, email }: { userId: string; email: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("dashboard");
  const [resumeResult, setResumeResult] = useState<ParsedResume | null>(null);
  const [resumeDraft, setResumeDraft] = useState<ResumeDraft | null>(null);
  const fillProfileFromResume = (draft: ResumeDraft) => { setResumeDraft(draft); setTab("personalization"); };
  const [search, setSearch] = useState("");
  const [workMode, setWorkMode] = useState<WorkModeFilter>("all");
  const [jobPostedDate, setJobPostedDate] = useState<PostedDateFilter>("any");
  const [jobLocations, setJobLocations] = useState<string[]>([]);
  const [minimumSkillMatch, setMinimumSkillMatch] = useState(0);
  const [knownSkillIds, setKnownSkillIds] = useState<number[] | null>(null);
  const [skillMatchState, setSkillMatchState] = useState<SkillMatchState>("loading");
  const [skillRefresh, setSkillRefresh] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [trackerSearch, setTrackerSearch] = useState("");
  const [trackerWorkMode, setTrackerWorkMode] = useState<WorkModeFilter>("all");
  const [trackerPostedDate, setTrackerPostedDate] = useState<PostedDateFilter>("any");
  const [trackerLocation, setTrackerLocation] = useState<LocationFilter>("any");
  const [trackerLocationQuery, setTrackerLocationQuery] = useState("");
  const [trackerStatus, setTrackerStatus] = useState("all");
  const [trackerSort, setTrackerSort] = useState("recent");
  const [busyJobId, setBusyJobId] = useState<number | null>(null);
  const [jobView, setJobView] = useState<JobView>("for_you");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileRequest = useRef(0);
  const [recommendationRefresh, setRecommendationRefresh] = useState(0);
  const [personalized, setPersonalized] = useState<{
    key: string; jobs: Job[]; loading: boolean; error: string | null;
  }>({ key: "", jobs: [], loading: false, error: null });
  const [directJob, setDirectJob] = useState<Job | null>(null);
  const [openingJob, setOpeningJob] = useState(false);
  const [jobOpenError, setJobOpenError] = useState<string | null>(null);
  const jobOpenRequest = useRef(0);
  const [priorityCompanyIds, setPriorityCompanyIds] = useState<number[]>([]);

  // Re-read after visiting Skills so manual edits and approved resume skills appear immediately.
  // Cleanup prevents stale requests from overwriting a later load or another account's state.
  useEffect(() => {
    if (tab !== "jobs") return;
    const controller = new AbortController();
    setSkillMatchState("loading");
    setKnownSkillIds(null);
    fetchUserSkillIds(userId, controller.signal).then((ids) => {
      if (controller.signal.aborted) return;
      setKnownSkillIds(ids);
      setSkillMatchState(ids.length ? "ready" : "empty");
    }).catch(() => {
      if (!controller.signal.aborted) setSkillMatchState("error");
    });
    return () => controller.abort();
  }, [userId, tab, skillRefresh]);

  const loadPriorityCompanies = useCallback(async () => {
    try {
      setPriorityCompanyIds(await fetchPriorityCompanyIds(userId));
    } catch {
      // Non-critical for the jobs view; Personalization surfaces load errors.
    }
  }, [userId]);

  useEffect(() => {
    void loadPriorityCompanies();
  }, [loadPriorityCompanies]);
  const rolesKey = profile?.target_roles ?? "";
  const targetRoles = useMemo(() => parseTargetRoles(rolesKey), [rolesKey]);

  const loadProfile = useCallback(async () => {
    const request = ++profileRequest.current;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const row = await fetchProfile(userId);
      if (request === profileRequest.current) setProfile(row);
    } catch (err) {
      if (request === profileRequest.current) setProfileError((err as Error).message);
    } finally {
      if (request === profileRequest.current) setProfileLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const requestState = profileRequest;
    void loadProfile();
    return () => { requestState.current++; };
  }, [loadProfile]);

  useEffect(() => {
    if (profileLoading || profileError || !targetRoles.length) return;
    const controller = new AbortController();
    setPersonalized({ key: rolesKey, jobs: [], loading: true, error: null });
    fetchJobsForTargetRoles(targetRoles, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setPersonalized({ key: rolesKey, jobs: rows, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted) setPersonalized({ key: rolesKey, jobs: [], loading: false, error: err.message });
      });
    return () => controller.abort();
  }, [rolesKey, targetRoles, profileLoading, profileError, recommendationRefresh]);

  const recommendedJobs = personalized.key === rolesKey && targetRoles.length && !profileError ? personalized.jobs : [];
  const recommendationsLoading = profileLoading || (!profileError && !!targetRoles.length && (personalized.key !== rolesKey || personalized.loading));
  const recommendationError = personalized.key === rolesKey ? personalized.error : null;
  // Jobs uses saved skills; Dashboard retains its separate recommendation behavior.
  const viewJobs = jobs;
  const viewLoading = loading;
  const dashboardPersonalized = !profileLoading && !profileError && targetRoles.length > 0;
  const dashboardJobs = dashboardPersonalized ? recommendedJobs : jobs;
  const dashboardLoading = loading || profileLoading || (dashboardPersonalized && recommendationsLoading);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobRows, appRows] = await Promise.all([fetchOpenJobs(), fetchApplications()]);
      setJobs(jobRows);
      setApplications(appRows);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const reloadApplications = useCallback(async () => {
    try {
      setApplications(await fetchApplications());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  async function track(jobId: number, status: ApplicationStatus) {
    setBusyJobId(jobId);
    setError(null);
    try {
      await setApplicationStatus(userId, jobId, status);
      await reloadApplications();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyJobId(null);
    }
  }

  async function untrack(applicationId: number, jobId: number) {
    setBusyJobId(jobId);
    setError(null);
    try {
      await removeApplication(applicationId);
      await reloadApplications();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyJobId(null);
    }
  }

  // Which status each tracked job has, for quick lookups in the job lists
  const statusByJob = useMemo(() => {
    const map = new Map<number, ApplicationStatus>();
    for (const app of applications) map.set(app.job_id, normalizeStatus(app.status));
    return map;
  }, [applications]);

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return viewJobs.filter((job) => {
      if (workMode !== "all" && job.work_mode !== workMode) return false;
      if (!matchesPostedDate(job.posted_at, jobPostedDate)) return false;
      if (!matchesAnyLocation(job.location, jobLocations)) return false;
      if (!meetsSkillMinimum(getJobSkillMatch(job, knownSkillIds), minimumSkillMatch)) return false;
      if (!term) return true;
      const haystack = `${job.title} ${job.companies?.name ?? ""} ${job.location ?? ""}`;
      return haystack.toLowerCase().includes(term);
    }).sort((a, b) => {
      if (jobView !== "for_you" || skillMatchState !== "ready") return 0;
      const left = getJobSkillMatch(a, knownSkillIds);
      const right = getJobSkillMatch(b, knownSkillIds);
      const ratio = (match: JobSkillMatch) => match.percent === null ? -1 : match.matched.length / match.total;
      return ratio(right) - ratio(left);
    });
  }, [viewJobs, search, workMode, jobPostedDate, jobLocations, minimumSkillMatch, knownSkillIds, jobView, skillMatchState]);

  const selectedJob =
    (directJob?.id === selectedJobId ? directJob : null) ??
    filteredJobs.find((job) => job.id === selectedJobId) ?? filteredJobs[0] ?? null;

  const unseenDashboardJobs = dashboardJobs.filter((job) => !statusByJob.has(job.id));
  const priorityJobs = jobs.filter((job) => priorityCompanyIds.includes(job.company_id)).slice(0, 3);

  function visibleTrackerRows() {
    const term = trackerSearch.trim().toLowerCase();
    return applications.filter((app) => {
      if (trackerStatus !== "all" && normalizeStatus(app.status) !== trackerStatus) return false;
      if (trackerWorkMode !== "all" && app.jobs?.work_mode !== trackerWorkMode) return false;
      if (!matchesPostedDate(app.jobs?.posted_at ?? null, trackerPostedDate)) return false;
      if (!matchesLocation(app.jobs?.location ?? null, trackerLocation, profile?.preferred_location ?? null, trackerLocationQuery)) return false;
      const job = app.jobs;
      return !term || `${job?.title ?? ""} ${job?.companies?.name ?? ""} ${job?.location ?? ""}`.toLowerCase().includes(term);
    }).sort((a, b) => trackerSort === "title"
      ? (a.jobs?.title ?? "").localeCompare(b.jobs?.title ?? "")
      : trackerSort === "company"
        ? (a.jobs?.companies?.name ?? "").localeCompare(b.jobs?.companies?.name ?? "")
      : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  const countByStatus = (status: ApplicationStatus) =>
    applications.filter((app) => normalizeStatus(app.status) === status).length;

  const metrics = [
    { label: "Loaded CS jobs", value: jobs.length, note: "Up to 300 newest postings" },
    { label: "Saved", value: countByStatus("saved"), note: "In your tracker" },
    { label: "Applied", value: countByStatus("applied"), note: "Waiting to hear back" },
    { label: "Interviewing", value: countByStatus("interviewing"), note: "Keep preparing" },
  ];

  function resetJobSelection() {
    jobOpenRequest.current++;
    setSelectedJobId(null);
    setDirectJob(null);
    setOpeningJob(false);
    setJobOpenError(null);
  }

  function changeJobView(view: JobView) {
    resetJobSelection();
    setJobView(view);
  }

  async function openJob(jobId: number, view: JobView = "all") {
    const request = ++jobOpenRequest.current;
    setJobView(view);
    setSearch("");
    setWorkMode("all");
    setJobPostedDate("any");
    setJobLocations([]);
    setMinimumSkillMatch(0);
    setSelectedJobId(jobId);
    setJobOpenError(null);
    setTab("jobs");
    const known = [...jobs, ...recommendedJobs].find((job) => job.id === jobId);
    setDirectJob(known ?? null);
    if (known) { setOpeningJob(false); return; }
    setOpeningJob(true);
    try {
      const job = await fetchJob(jobId);
      if (request !== jobOpenRequest.current) return;
      setDirectJob(job);
      if (!job) setJobOpenError("This job is no longer available.");
    } catch (err) {
      if (request === jobOpenRequest.current) setJobOpenError((err as Error).message);
    } finally {
      if (request === jobOpenRequest.current) setOpeningJob(false);
    }
  }

  // Opens a deep link from an email (?job=123 or ?tab=settings) once, on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobParam = params.get("job");
    const tabParam = params.get("tab");
    if (jobParam && Number.isInteger(Number(jobParam))) void openJob(Number(jobParam));
    else if (tabParam) setTab(tabParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-[#112a46] px-4 py-5 text-white lg:flex lg:flex-col">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-cyan-300 text-sm font-bold text-slate-950">
            CH
          </div>
          <div className="min-w-0">
            <p className="font-semibold">CS Career Hub</p>
            <p className="truncate text-xs text-slate-300">{email}</p>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const value = item.label.toLowerCase();
            return (
              <button
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  tab === value
                    ? "bg-white/15 text-white ring-1 ring-white/15"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
                key={item.label}
                type="button"
                onClick={() => setTab(value)}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <Button
          className="mt-auto justify-start border-white/25 text-white hover:bg-white/10"
          variant="outline"
          onClick={() => supabase?.auth.signOut()}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur sm:px-6">
          <div className="relative max-w-xl flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search jobs"
              className="pl-9"
              placeholder="Search jobs, companies, or locations"
              value={search}
              onChange={(event) => {
                resetJobSelection();
                setSearch(event.target.value);
                setTab("jobs");
              }}
            />
          </div>
          <Button aria-label="Refresh" size="icon" variant="outline" onClick={() => {
            void loadAll(); void loadProfile(); void loadPriorityCompanies(); setRecommendationRefresh((n) => n + 1); setSkillRefresh((n) => n + 1);
          }}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          <NotificationBell onOpenJob={(jobId) => void openJob(jobId)} />
          <Button
            aria-label="Sign out"
            className="lg:hidden"
            size="icon"
            variant="outline"
            onClick={() => supabase?.auth.signOut()}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>

        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Something went wrong talking to the database: {error}
            </div>
          ) : null}

          <Tabs className="space-y-5" defaultValue="dashboard" value={tab} onValueChange={setTab}>
            <TabsList className="max-w-full overflow-x-auto lg:hidden">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="jobs">Jobs</TabsTrigger>
              <TabsTrigger value="tracker">Tracker</TabsTrigger>
              <TabsTrigger value="skills">Skills</TabsTrigger>
              <TabsTrigger value="personalization">Personalization</TabsTrigger>
            </TabsList>

            {/* ---------------- Dashboard ---------------- */}
            <TabsContent value="dashboard" className="grid gap-6">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
                <p className="mt-1 text-muted-foreground">Your jobs, applications, and next steps in one place.</p>
              </div>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Overview">
                {metrics.map((metric, index) => (
                  <Card className={`border-t-4 ${["border-t-sky-500", "border-t-teal-500", "border-t-indigo-500", "border-t-amber-500"][index]}`} key={metric.label}>
                    <CardContent className="p-5">
                      <p className="text-sm text-muted-foreground">{metric.label}</p>
                      <p className="mt-2 text-3xl font-semibold">{loading ? "–" : metric.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
                    </CardContent>
                  </Card>
                ))}
              </section>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div><CardTitle>{dashboardPersonalized ? "Jobs for you" : "Newest jobs"}</CardTitle>
                      <CardDescription>{dashboardPersonalized ? "Based on your saved target roles. Match scores are pending." : "Add target roles in your profile to personalize this list."}</CardDescription></div>
                    <Button size="sm" variant="outline" onClick={() => { changeJobView(dashboardPersonalized ? "for_you" : "all"); setTab("jobs"); }}>See all jobs</Button>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {dashboardLoading && <EmptyText text="Loading jobs…" />}
                    {!dashboardLoading && recommendationError && <p role="alert" className="text-sm text-red-600">Could not load personalized jobs. Open Jobs to retry.</p>}
                    {!dashboardLoading && !recommendationError && unseenDashboardJobs.length === 0 && <EmptyText text="No new jobs to show yet. Browse all jobs or update your target roles." />}
                    {!dashboardLoading && unseenDashboardJobs.slice(0, 4).map((job) => (
                      <JobRow key={job.id} job={job} onOpen={() => void openJob(job.id, dashboardPersonalized ? "for_you" : "all")} onSave={() => void track(job.id, "saved")} />
                    ))}
                  </CardContent>
                </Card>
                <div className="grid content-start gap-6">
                  <Card><CardHeader><CardTitle>From priority companies</CardTitle><CardDescription>Recent loaded postings from companies you prioritize.</CardDescription></CardHeader>
                    <CardContent className="grid gap-3">
                      {priorityJobs.length ? priorityJobs.map((job) => <button className="border-b pb-3 text-left last:border-0" key={job.id} onClick={() => void openJob(job.id)}>
                        <span className="block text-sm font-semibold hover:underline">{job.title}</span>
                        <span className="text-xs text-muted-foreground">{job.companies?.name} · {formatPosted(job.posted_at)}</span>
                      </button>) : <p className="text-sm text-muted-foreground">No new postings from your priority companies. <button className="text-primary underline" onClick={() => setTab("personalization")}>Choose companies</button>.</p>}
                    </CardContent>
                  </Card>
                  <Card><CardHeader><CardTitle>Skills to develop</CardTitle><CardDescription>See which skills appear in current job postings.</CardDescription></CardHeader>
                    <CardContent><Button variant="outline" onClick={() => setTab("skills")}>Explore skill gaps</Button></CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* ---------------- Jobs ---------------- */}
            <TabsContent value="jobs" className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>{jobView === "for_you" ? "For you" : "All jobs"}</CardTitle>
                  <CardDescription>
                    {viewLoading ? "Loading…" : `${filteredJobs.length} of ${viewJobs.length} loaded jobs · up to 300 newest results`}
                  </CardDescription>
                  <div role="group" aria-label="Job view" className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" aria-pressed={jobView === "for_you"} variant={jobView === "for_you" ? "default" : "outline"} onClick={() => changeJobView("for_you")}>For you</Button>
                    <Button size="sm" aria-pressed={jobView === "all"} variant={jobView === "all" ? "default" : "outline"} onClick={() => changeJobView("all")}>All jobs</Button>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{jobView === "for_you" ? "Loaded jobs ordered by your saved skill overlap. Jobs without recorded skills appear last." : "Newest loaded postings first."}</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {WORK_MODE_FILTERS.map((filter) => (
                      <Button
                        key={filter.value}
                        size="sm"
                        variant={workMode === filter.value ? "default" : "outline"}
                        aria-pressed={workMode === filter.value}
                        onClick={() => { resetJobSelection(); setWorkMode(filter.value); }}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-end gap-3 pt-2">
                    <label className="grid gap-1 text-xs font-medium">
                      Date posted
                      <select aria-label="Filter jobs by date posted" className="h-10 rounded-md border bg-card px-3 text-sm" value={jobPostedDate} onChange={(event) => { resetJobSelection(); setJobPostedDate(event.target.value as PostedDateFilter); }}>
                        {POSTED_DATE_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-medium">Skill match
                      <select aria-label="Minimum skill match" className="h-10 rounded-md border bg-card px-3 text-sm" value={minimumSkillMatch}
                        onChange={(event) => { resetJobSelection(); setMinimumSkillMatch(Number(event.target.value)); }}>
                        <option value={0}>Any match</option>
                        <option value={50}>50% or more</option>
                        <option value={75}>75% or more</option>
                        <option value={100}>All recorded skills</option>
                      </select>
                    </label>
                    <JobLocationFilter locations={jobLocations} onChange={(locations) => { resetJobSelection(); setJobLocations(locations); }} />
                    <Button size="sm" variant="ghost" onClick={() => { resetJobSelection(); setSearch(""); setWorkMode("all"); setJobPostedDate("any"); setJobLocations([]); setMinimumSkillMatch(0); }}>Clear filters</Button>
                  </div>
                </CardHeader>
                <CardContent className="grid max-h-[70vh] gap-3 overflow-y-auto">
                  {viewLoading && <p role="status" className="text-sm text-muted-foreground">Loading jobs…</p>}
                  {skillMatchState === "loading" && <p role="status" className="text-sm text-muted-foreground">Loading skill matches…</p>}
                  {skillMatchState === "error" && <div role="alert" className="grid gap-2 text-sm">
                    <p>Could not load your skills. Use Any match to browse without a skill filter.</p><Button variant="outline" onClick={() => setSkillRefresh((n) => n + 1)}>Retry skills</Button>
                  </div>}
                  {skillMatchState === "empty" && <p className="text-sm text-muted-foreground">
                    <button type="button" className="font-medium text-primary underline" onClick={() => setTab("skills")}>Add your skills</button> to see matches. Use Any match to browse all jobs.
                  </p>}
                  {!viewLoading && skillMatchState !== "loading" && filteredJobs.length === 0 && <EmptyText text="No loaded jobs match these filters. Try another location or lower the skill minimum." />}
                  {!viewLoading && filteredJobs.map((job) => (
                    <JobRow
                      compact
                      job={job}
                      skillMatch={getJobSkillMatch(job, knownSkillIds)}
                      skillState={skillMatchState}
                      key={job.id}
                      selected={selectedJob?.id === job.id}
                      status={statusByJob.get(job.id)}
                      onOpen={() => { resetJobSelection(); setSelectedJobId(job.id); }}
                      onSave={() => track(job.id, "saved")}
                    />
                  ))}
                </CardContent>
              </Card>

              {openingJob || jobOpenError ? <Card><CardContent className="p-5"><p role={jobOpenError ? "alert" : "status"} className="text-sm">{jobOpenError ?? "Loading job details…"}</p></CardContent></Card> : selectedJob && !viewLoading ? (
                <JobDetail
                  isPriorityCompany={priorityCompanyIds.includes(selectedJob.company_id)}
                  job={selectedJob}
                  skillMatch={getJobSkillMatch(selectedJob, knownSkillIds)}
                  skillState={skillMatchState}
                  onEditSkills={() => setTab("skills")}
                  onRetrySkills={() => setSkillRefresh((n) => n + 1)}
                  onPriorityCompanyToggled={(companyId, priority) => setPriorityCompanyIds((ids) =>
                    priority ? [...new Set([...ids, companyId])] : ids.filter((id) => id !== companyId))}
                  status={statusByJob.get(selectedJob.id)}
                  onTrack={(status) => track(selectedJob.id, status)}
                  userId={userId}
                />
              ) : (
                <Card>
                  <CardContent className="p-5">
                    <EmptyText text="Pick a job to see its details." />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ---------------- Combined tracker ---------------- */}
            <TabsContent value="tracker">
              <TrackerView rows={visibleTrackerRows()} allRows={applications}
                search={trackerSearch} onSearch={setTrackerSearch}
                workMode={trackerWorkMode} onWorkMode={setTrackerWorkMode}
                postedDate={trackerPostedDate} onPostedDate={setTrackerPostedDate}
                location={trackerLocation} onLocation={setTrackerLocation}
                locationQuery={trackerLocationQuery} onLocationQuery={setTrackerLocationQuery}
                preferredLocation={profile?.preferred_location ?? null}
                status={trackerStatus} onStatus={setTrackerStatus}
                sort={trackerSort} onSort={setTrackerSort}
                busyJobId={busyJobId} onChange={track} onOpen={openJob} onRemove={untrack} />
            </TabsContent>

            <TabsContent value="skills">
              <SkillDevelopment userId={userId} jobs={jobs} jobsLoading={loading}
                resumeResult={resumeResult} onResumeResult={setResumeResult} onProfileDraft={fillProfileFromResume} />
            </TabsContent>

            {/* ---------------- Personalization ---------------- */}
            <TabsContent value="personalization" className="grid gap-6">
              <div><h2 className="text-2xl font-semibold">Personalization</h2><p className="text-sm text-muted-foreground">Your profile and preferences shape your job list and alerts.</p></div>
              <Card><CardHeader><CardTitle>Your profile and job preferences</CardTitle><CardDescription>Save target roles and a preferred location to personalize jobs and the location filter.</CardDescription></CardHeader>
                <CardContent><ProfileForm userId={userId} resumeDraft={resumeDraft} onSaved={(saved) => {
                  setResumeDraft(null);
                  profileRequest.current++;
                  setProfile(saved); setProfileLoading(false); setProfileError(null);
                  resetJobSelection();
                }} /></CardContent>
              </Card>
              <div className="grid gap-6 xl:grid-cols-2">
                <CompaniesTab userId={userId} onPriorityToggled={(companyId, priority) => setPriorityCompanyIds((ids) =>
                  priority ? [...new Set([...ids, companyId])] : ids.filter((id) => id !== companyId))} />
                <NotificationSettingsTab userId={userId} />
              </div>
              <section className="grid gap-3" aria-label="Your data">
                <h3 className="font-semibold">Your data</h3>
                <p className="text-sm text-muted-foreground">Add skills from a resume in Skills. Your resume file is not saved by the site.</p>
                <DeleteAccount />
              </section>
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function MatchScoreBadge() {
  return (
    <span
      className="inline-flex w-fit items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800"
      title="A match score has not been calculated for this job yet."
    >
      Match score: Pending
    </span>
  );
}

function JobRow({
  job,
  skillMatch,
  skillState = "loading",
  status,
  compact = false,
  selected = false,
  onOpen,
  onSave,
}: {
  job: Job;
  skillMatch?: JobSkillMatch;
  skillState?: SkillMatchState;
  status?: ApplicationStatus;
  compact?: boolean;
  selected?: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  return (
    <article
      className={`grid gap-3 rounded-lg border bg-card p-4 transition-colors sm:grid-cols-[1fr_auto] sm:items-center ${
        selected ? "border-blue-400 bg-blue-50/70 shadow-soft" : "hover:border-blue-200 hover:bg-blue-50/30"
      }`}
    >
      <button className="min-w-0 text-left" type="button" onClick={onOpen}>
        {skillMatch ? <SkillMatchBadge match={skillMatch} state={skillState} /> : <MatchScoreBadge />}
        <h3 className="mt-2 truncate text-sm font-semibold hover:underline">{job.title}</h3>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {job.companies?.name ?? "Unknown company"} · {job.location ?? "Location not listed"}
        </p>
        {!compact ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{WORK_MODE_LABELS[job.work_mode] ?? "Not listed"}</Badge>
            <Badge>{formatPosted(job.posted_at)}</Badge>
          </div>
        ) : null}
      </button>
      <div className="flex items-center gap-2">
        {status ? (
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
            <Check className="mr-1 h-3 w-3" aria-hidden="true" />
            {statusLabel(status)}
          </Badge>
        ) : (
          <Button size="sm" variant="outline" onClick={onSave}>
            <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
            Save
          </Button>
        )}
      </div>
    </article>
  );
}

function JobDetail({
  job,
  skillMatch,
  skillState,
  onEditSkills,
  onRetrySkills,
  status,
  onTrack,
  userId,
  isPriorityCompany,
  onPriorityCompanyToggled,
}: {
  job: Job;
  skillMatch: JobSkillMatch;
  skillState: SkillMatchState;
  onEditSkills: () => void;
  onRetrySkills: () => void;
  status?: ApplicationStatus;
  onTrack: (status: ApplicationStatus) => void;
  userId: string;
  isPriorityCompany: boolean;
  onPriorityCompanyToggled: (companyId: number, priority: boolean) => void;
}) {
  return (
    <Card className="content-start">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <SkillMatchBadge match={skillMatch} state={skillState} />
            <CardTitle className="mt-2 text-xl">{job.title}</CardTitle>
            <CardDescription className="mt-1">
              {job.companies?.name ?? "Unknown company"} · {job.location ?? "Location not listed"} ·{" "}
              {formatPosted(job.posted_at)}
            </CardDescription>
            <div className="mt-2">
              <PriorityCompanyButton
                companyId={job.company_id}
                companyName={job.companies?.name ?? "this company"}
                isActive={isPriorityCompany}
                onToggled={onPriorityCompanyToggled}
                userId={userId}
              />
            </div>
          </div>
          <Badge>{WORK_MODE_LABELS[job.work_mode] ?? "Not listed"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <a
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            href={job.url}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open posting
          </a>
        </div>
        <JobSkillBreakdown match={skillMatch} state={skillState} onEditSkills={onEditSkills} onRetry={onRetrySkills} />
        <section aria-label="Application status" className="rounded-md border p-3">
          <h2 className="mb-2 text-sm font-semibold">Application status</h2>
          <div className="flex flex-wrap gap-2">
            {TRACKER_COLUMNS.map((column) => (
              <Button
                aria-pressed={status ? normalizeStatus(status) === column.status : false}
                key={column.status}
                size="sm"
                variant={status && normalizeStatus(status) === column.status ? "default" : "outline"}
                onClick={() => onTrack(column.status)}
              >
                {column.label}
              </Button>
            ))}
          </div>
          {!status ? <p className="mt-2 text-xs text-muted-foreground">Choose a status to start tracking this job.</p> : null}
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Job description</h2>
          <p className="max-h-[55vh] overflow-y-auto whitespace-pre-line text-sm leading-6 text-muted-foreground">
            {job.description || "No description was provided. Open the posting to read more."}
          </p>
        </section>
      </CardContent>
    </Card>
  );
}

function UnavailableMatchFilter({ id }: { id: string }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      Match score
      <select aria-label="Filter by match score (not available yet)" aria-describedby={`${id}-match-score-help`} className="h-10 rounded-md border bg-muted px-3 text-sm" disabled value="unavailable">
        <option value="unavailable">Scores not available yet</option>
      </select>
      <span id={`${id}-match-score-help`} className="sr-only">Match scoring has not been implemented for this project yet.</span>
    </label>
  );
}

function LocationControls({ filter, onFilter, query, onQuery, preferred }: {
  filter: LocationFilter; onFilter: (value: LocationFilter) => void;
  query: string; onQuery: (value: string) => void; preferred: string | null;
}) {
  return <div className="grid gap-1 text-xs font-medium">
    <label className="grid gap-1">Location
      <select aria-label="Filter by location" className="h-10 rounded-md border bg-card px-3 text-sm" value={filter} onChange={(event) => onFilter(event.target.value as LocationFilter)}>
        <option value="any">Anywhere</option>
        <option value="near_me" disabled={!preferred?.trim()}>Near my preferred location</option>
        <option value="custom">Enter a location</option>
      </select>
    </label>
    {filter === "custom" && <Input aria-label="City or location" placeholder="City, state, or Remote" value={query} onChange={(event) => onQuery(event.target.value)} />}
    {filter === "near_me" && <span className="max-w-56 font-normal text-muted-foreground">Matches “{preferred}” by city name, not distance.</span>}
  </div>;
}

function TrackerView({ rows, allRows, search, onSearch, workMode, onWorkMode, postedDate, onPostedDate,
  location, onLocation, locationQuery, onLocationQuery, preferredLocation, status, onStatus,
  sort, onSort, busyJobId, onChange, onOpen, onRemove,
}: {
  rows: Application[]; allRows: Application[]; search: string; onSearch: (value: string) => void;
  workMode: WorkModeFilter; onWorkMode: (value: WorkModeFilter) => void;
  postedDate: PostedDateFilter; onPostedDate: (value: PostedDateFilter) => void;
  location: LocationFilter; onLocation: (value: LocationFilter) => void;
  locationQuery: string; onLocationQuery: (value: string) => void; preferredLocation: string | null;
  status: string; onStatus: (value: string) => void; sort: string; onSort: (value: string) => void;
  busyJobId: number | null; onChange: (jobId: number, status: ApplicationStatus) => void;
  onOpen: (jobId: number) => void; onRemove: (applicationId: number, jobId: number) => void;
}) {
  return <div className="space-y-5">
    <div><h2 className="text-2xl font-semibold">Tracker</h2>
      <p className="mt-1 text-sm text-muted-foreground">Saved jobs and applications in one place. Use a row’s status menu to move it.</p>
    </div>
    <div className="flex flex-wrap gap-2 border-b" role="group" aria-label="Filter tracker by status">
      {[{ status: "all", label: "All" }, ...TRACKER_COLUMNS].map((column) => {
        const count = column.status === "all" ? allRows.length : allRows.filter((app) => normalizeStatus(app.status) === column.status).length;
        return <button key={column.status} type="button" aria-pressed={status === column.status}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${status === column.status ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => onStatus(column.status)}>{column.label} <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">{count}</span></button>;
      })}
    </div>
    <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
      <label className="grid min-w-[180px] flex-1 gap-1 text-xs font-medium">Keyword or company
        <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search company, role, or location" />
      </label>
      <label className="grid gap-1 text-xs font-medium">Work mode
        <select className="h-10 rounded-md border bg-card px-3 text-sm" value={workMode} onChange={(event) => onWorkMode(event.target.value as WorkModeFilter)}>
          {WORK_MODE_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">Date posted
        <select className="h-10 rounded-md border bg-card px-3 text-sm" value={postedDate} onChange={(event) => onPostedDate(event.target.value as PostedDateFilter)}>
          {POSTED_DATE_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <LocationControls filter={location} onFilter={onLocation} query={locationQuery} onQuery={onLocationQuery} preferred={preferredLocation} />
      <UnavailableMatchFilter id="tracker" />
      <Button variant="ghost" size="sm" onClick={() => { onSearch(""); onStatus("all"); onWorkMode("all"); onPostedDate("any"); onLocation("any"); onLocationQuery(""); }}>Clear filters</Button>
    </CardContent></Card>
    <div className="flex items-center justify-between gap-3 text-sm">
      <p className="font-medium">{rows.length} of {allRows.length} tracked jobs</p>
      <label className="flex items-center gap-2">Sort
        <select aria-label="Sort tracked jobs" className="h-9 rounded-md border bg-card px-2" value={sort} onChange={(event) => onSort(event.target.value)}>
          <option value="recent">Recently updated</option><option value="title">Job title</option><option value="company">Company</option>
        </select>
      </label>
    </div>
    <Card><CardContent className="p-0">
      {!rows.length ? <div className="p-8"><EmptyText text={allRows.length ? "No tracked jobs match these filters." : "Save a posting from Jobs to start tracking it."} /></div> :
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
        <thead className="bg-muted/70 text-muted-foreground"><tr>
          <th className="px-4 py-3 font-medium">Company</th><th className="px-4 py-3 font-medium">Role</th>
          <th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Match</th>
          <th className="px-4 py-3 font-medium">Last update</th><th className="px-4 py-3 font-medium">Location</th>
          <th className="px-4 py-3 font-medium">Actions</th>
        </tr></thead><tbody>
          {rows.map((app) => <tr className="border-t hover:bg-blue-50/40" key={app.id}>
            <td className="px-4 py-3 font-semibold">{app.jobs?.companies?.name ?? "Unknown company"}</td>
            <td className="min-w-[180px] px-4 py-3"><button className="text-left font-medium text-primary hover:underline" onClick={() => onOpen(app.job_id)}>{app.jobs?.title ?? "Job no longer listed"}</button></td>
            <td className="px-4 py-3"><select aria-label={`Status for ${app.jobs?.title ?? "tracked job"}`} className="h-9 rounded-md border bg-card px-2" disabled={busyJobId === app.job_id} value={normalizeStatus(app.status)} onChange={(event) => onChange(app.job_id, event.target.value as ApplicationStatus)}>
              {TRACKER_COLUMNS.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
            </select></td>
            <td className="px-4 py-3 text-muted-foreground" title="Match scoring is not available yet">Pending</td>
            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{new Date(app.updated_at).toLocaleDateString()}</td>
            <td className="max-w-[180px] px-4 py-3 text-muted-foreground">{app.jobs?.location ?? "Not listed"}</td>
            <td className="whitespace-nowrap px-4 py-3"><Button size="sm" variant="ghost" disabled={busyJobId === app.job_id} onClick={() => { if (window.confirm("Remove this job from your tracker?")) onRemove(app.id, app.job_id); }}>Remove</Button></td>
          </tr>)}
        </tbody></table></div>}
    </CardContent></Card>
  </div>;
}

function SetupMessage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Connect the website to Supabase</CardTitle>
          <CardDescription>
            Create <code>frontend/.env.local</code> with your Project URL and anon key (see
            <code> .env.local.example</code>), then restart <code>npm run dev</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

function CenteredText({ text }: { text: string }) {
  return (
    <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">{text}</main>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The database also allows "not_applied"; the tracker shows it in the Saved column. */
function normalizeStatus(status: ApplicationStatus): ApplicationStatus {
  return status === "not_applied" ? "saved" : status;
}

function statusLabel(status: ApplicationStatus) {
  return TRACKER_COLUMNS.find((column) => column.status === normalizeStatus(status))?.label ?? status;
}

function formatPosted(postedAt: string | null) {
  if (!postedAt) return "Date not listed";
  const days = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  return `Posted ${new Date(postedAt).toLocaleDateString()}`;
}
