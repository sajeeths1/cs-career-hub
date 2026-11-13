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
import { ResumeLibrary, JobResumeSelect, useResumeLibrary, type ResumeLibraryModel } from "@/components/resume-library";
import { SkillDevelopment } from "@/components/skill-development";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationSettingsTab } from "@/components/notification-settings";
import { CompaniesTab } from "@/components/companies";
import { DeleteAccount } from "@/components/delete-account";
import { PriorityCompanyButton } from "@/components/priority-company-button";
import { JobsFilters } from "@/components/jobs-filters";
import { summarizeJobLocation } from "@/lib/job-presentation";
import { averagePercent, MATCH_FILTERS, formatMatch, matchScore, matchesScoreFilter, matchTone, type JobMatch, type MatchFilter } from "@/lib/job-match";
import { JobSkillBreakdown, SkillMatchBadge, type SkillMatchState } from "@/components/job-skill-match";
import { getJobSkillMatch, type JobSkillMatch } from "@/lib/job-skill-match";
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
  fetchCompanies,
  fetchNotifications,
  fetchPriorityCompanyIds,
  fetchJob,
  fetchJobSkillIds,
  fetchJobsForYou,
  fetchJobsPage,
  fetchKnownSkillIds,
  fetchOpenJobs,
  fetchProfile,
  fetchUserSkillIds,
  removeApplication,
  setApplicationStatus,
} from "@/lib/data";
import { navItems } from "@/lib/mock-data";
import { JOB_PAGE_SIZE, type JobFeedFilters } from "@/lib/job-feed";
import { matchesPostedDate, matchesLocation, POSTED_DATE_FILTERS, type LocationFilter, type PostedDateFilter } from "@/lib/job-filters";
import { supabase } from "@/lib/supabase";
import {
  TRACKER_COLUMNS,
  WORK_MODE_LABELS,
  type Application,
  type ApplicationStatus,
  type Company,
  type Job,
  type NotificationRow,
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
  const resumeLibrary = useResumeLibrary(userId, resumeResult);
  const [resumeDraft, setResumeDraft] = useState<ResumeDraft | null>(null);
  const fillProfileFromResume = (draft: ResumeDraft) => { setResumeDraft(draft); setTab("profile"); };
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [closingSoon, setClosingSoon] = useState<NotificationRow[]>([]);
  const [jobSkillIds, setJobSkillIds] = useState<Map<number, number[]>>(() => new Map());
  const [trackerMatchFilter, setTrackerMatchFilter] = useState<MatchFilter>("any");
  const feedFilters = useMemo<JobFeedFilters>(() => ({
    search, workMode, postedDate: jobPostedDate,
    locations: jobLocations, minimumMatch: minimumSkillMatch,
    forYou: jobView === "for_you",
  }), [search, workMode, jobPostedDate, jobLocations, minimumSkillMatch, jobView]);
  const skillsKey = JSON.stringify(knownSkillIds);
  const feedKey = JSON.stringify([jobView, feedFilters, skillsKey]);
  const [pagination, setPagination] = useState({ key: "", page: 0 });
  const page = pagination.key === feedKey ? pagination.page : 0;
  useEffect(() => {
    setPagination({ key: feedKey, page: 0 });
  }, [feedKey]);
  const [feed, setFeed] = useState<{
    key: string; page: number; jobs: Job[]; total: number; loading: boolean; error: string | null;
  }>({ key: "", page: 0, jobs: [], total: 0, loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setFeed({ key: feedKey, page, jobs: [], total: 0, loading: true, error: null });
      fetchJobsPage(feedFilters, page, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          if (page > 0 && result.jobs.length === 0) {
            setPagination({ key: feedKey, page: Math.max(0, Math.ceil(result.total / JOB_PAGE_SIZE) - 1) });
          }
          setFeed({ ...result, key: feedKey, page, loading: false, error: null });
        })
        .catch((err: Error) => {
          if (!controller.signal.aborted) setFeed({ key: feedKey, page, jobs: [], total: 0, loading: false, error: err.message });
        });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [feedKey, feedFilters, page, recommendationRefresh]);

  // Re-read after visiting Skills so manual edits and approved resume skills appear immediately.
  // Cleanup prevents stale requests from overwriting a later load or another account's state.
  useEffect(() => {
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

  useEffect(() => {
    fetchCompanies().then(setCompanies).catch(() => undefined);
    fetchNotifications(30)
      .then((rows) => setClosingSoon(rows.filter((row) => row.kind === "closing_soon")))
      .catch(() => undefined);
  }, [userId]);

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
    const controller = new AbortController();
    setPersonalized({ key: skillsKey, jobs: [], loading: true, error: null });
    fetchJobsForYou(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setPersonalized({ key: skillsKey, jobs: rows, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted) setPersonalized({ key: skillsKey, jobs: [], loading: false, error: err.message });
      });
    return () => controller.abort();
  }, [skillsKey, recommendationRefresh]);

  const recommendedJobs = useMemo(() => personalized.key === skillsKey ? personalized.jobs : [], [personalized.key, personalized.jobs, skillsKey]);
  const recommendationsLoading = personalized.key !== skillsKey || personalized.loading;
  const recommendationError = personalized.key === skillsKey ? personalized.error : null;
  const feedCurrent = feed.key === feedKey && feed.page === page;
  const viewJobs = useMemo(() => feedCurrent ? feed.jobs : [], [feedCurrent, feed.jobs]);
  const viewLoading = !feedCurrent || feed.loading;
  const feedError = feedCurrent ? feed.error : null;
  const dashboardJobs = recommendedJobs;
  const dashboardLoading = loading || recommendationsLoading;

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
      await resumeLibrary.reload();
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

  // Every job the page can show, as a stable key so tags reload only when the set changes.
  const scoredJobIds = useMemo(() => [...new Set([
    ...jobs.map((job) => job.id),
    ...personalized.jobs.map((job) => job.id),
    ...viewJobs.map((job) => job.id),
    ...applications.map((app) => app.job_id),
    ...(directJob ? [directJob.id] : []),
  ])].sort((a, b) => a - b).join(","), [jobs, personalized.jobs, viewJobs, applications, directJob]);

  useEffect(() => {
    if (!scoredJobIds) return;
    const controller = new AbortController();
    fetchJobSkillIds(scoredJobIds.split(",").map(Number), controller.signal)
      .then((rows) => { if (!controller.signal.aborted) setJobSkillIds(rows); })
      .catch(() => { /* Non-critical: scores stay "Pending". */ });
    return () => controller.abort();
  }, [scoredJobIds]);

  const storedMatches = useMemo(() => new Map(
    [...recommendedJobs, ...viewJobs].filter((job) => job.match_score !== undefined)
      .map((job) => [job.id, job.match_score ?? null]),
  ), [recommendedJobs, viewJobs]);
  const matchFor = useCallback(
    (jobId: number) => {
      if (storedMatches.has(jobId)) return storedMatches.get(jobId) ?? null;
      if (knownSkillIds === null) return null;
      return matchScore(jobSkillIds.get(jobId) ?? [], knownSkillIds);
    },
    [storedMatches, jobSkillIds, knownSkillIds],
  );

  const filteredJobs = viewJobs;

  const selectedJob =
    (directJob?.id === selectedJobId ? directJob : null) ??
    filteredJobs.find((job) => job.id === selectedJobId) ?? filteredJobs[0] ?? null;

  const unseenDashboardJobs = dashboardJobs.filter((job) => !statusByJob.has(job.id));
  const priorityCompanies = companies
    .filter((company) => priorityCompanyIds.includes(company.id))
    .map((company) => ({
      ...company,
      newRoles: jobs.filter((job) => job.company_id === company.id && matchesPostedDate(job.posted_at, "week")).length,
    }))
    .slice(0, 5);

  function visibleTrackerRows() {
    const term = trackerSearch.trim().toLowerCase();
    return applications.filter((app) => {
      if (trackerStatus !== "all" && normalizeStatus(app.status) !== trackerStatus) return false;
      if (!matchesScoreFilter(matchFor(app.job_id), trackerMatchFilter)) return false;
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
    { label: "Saved", value: countByStatus("saved"), note: "In your tracker" },
    { label: "Applied", value: countByStatus("applied"), note: "Waiting to hear back" },
    { label: "Interviewing", value: countByStatus("interviewing"), note: "Keep preparing" },
    { label: "Offers", value: countByStatus("offer"), note: "Keep it up" },
  ];

  // Skill match across the student's saved roles (tracker status "saved").
  const savedApps = applications.filter((app) => normalizeStatus(app.status) === "saved");
  const savedMatch = { count: savedApps.length, percent: averagePercent(savedApps.map((app) => matchFor(app.job_id))) };

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
    const known = [...viewJobs, ...jobs, ...recommendedJobs].find((job) => job.id === jobId);
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
    else if (tabParam) setTab(tabParam === "personalization" || tabParam === "settings" ? "profile" : tabParam);
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
            void loadAll(); void loadProfile(); void loadPriorityCompanies(); setSkillRefresh((n) => n + 1); setRecommendationRefresh((n) => n + 1);
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
              <TabsTrigger value="profile">Profile</TabsTrigger>
            </TabsList>

            {/* ---------------- Dashboard ---------------- */}
            <TabsContent value="dashboard" className="grid gap-9">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
                <p className="mt-1 text-muted-foreground">Your next steps, at a glance</p>
              </div>

              <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Your progress">
                {metrics.map((metric, index) => (
                  <Card className={`border-t-4 ${PROGRESS_TONES[index]}`} key={metric.label}>
                    <CardContent className="p-5">
                      <p className="text-sm text-muted-foreground">{metric.label}</p>
                      <p className="mt-2 text-3xl font-semibold">{loading ? "–" : metric.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </section>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <CardTitle>New from your priority companies</CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => setTab("profile")}>Manage companies</Button>
                </CardHeader>
                <CardContent>
                  {priorityCompanies.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                      {priorityCompanies.map((company) => (
                        <button
                          className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-cyan-200 hover:bg-cyan-50/40"
                          key={company.id}
                          type="button"
                          onClick={() => { resetJobSelection(); setSearch(company.name); setTab("jobs"); }}
                        >
                          <CompanyLogo name={company.name} logoUrl={company.logo_url} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{company.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {company.newRoles ? `${company.newRoles} new ${company.newRoles === 1 ? "role" : "roles"}` : "No new roles"}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No priority companies yet. <button className="text-primary underline" onClick={() => setTab("profile")}>Choose companies</button>.</p>
                  )}
                </CardContent>
              </Card>

              <div className="grid items-stretch gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                <Card className="flex min-h-0 flex-col">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle>Jobs For You</CardTitle>
                      <CardDescription>Based on your skill-match scores.</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { changeJobView("for_you"); setTab("jobs"); }}>See matching jobs</Button>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col">
                    {dashboardLoading && <EmptyText text="Loading jobs…" />}
                    {!dashboardLoading && recommendationError && <p role="alert" className="text-sm text-red-600">Could not load personalized jobs. Open Jobs to retry.</p>}
                    {!dashboardLoading && !recommendationError && unseenDashboardJobs.length === 0 && <EmptyText text="No new skill-matched jobs to show. Browse All jobs or add skills in your profile." />}
                    {!dashboardLoading && unseenDashboardJobs.length > 0 && (
                      <div className="flex h-[400px] flex-col gap-2.5 overflow-y-auto pr-1.5">
                        {unseenDashboardJobs.slice(0, 10).map((job) => (
                          <DashboardJobCard key={job.id} job={job} match={matchFor(job.id)} onOpen={() => void openJob(job.id, "for_you")} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex flex-col gap-8">
                  <Card>
                    <CardHeader>
                      <CardTitle>Your skill match</CardTitle>
                      <CardDescription>{savedMatch.count ? `Average across your ${savedMatch.count} saved ${savedMatch.count === 1 ? "job" : "jobs"}.` : "Save jobs to see how your skills compare."}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-5">
                      <div className="flex items-center gap-4">
                        <span className="text-[32px] font-semibold leading-none text-cyan-600">{savedMatch.percent === null ? "–" : `${savedMatch.percent}%`}</span>
                        <div
                          aria-label="Average skill match across saved jobs"
                          aria-valuemax={100}
                          aria-valuemin={0}
                          aria-valuenow={savedMatch.percent ?? 0}
                          className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200"
                          role="progressbar"
                        >
                          <div className="h-full rounded-full bg-cyan-600" style={{ width: `${savedMatch.percent ?? 0}%` }} />
                        </div>
                      </div>
                      <Button variant="outline" onClick={() => setTab("skills")}>See how to improve your match</Button>
                    </CardContent>
                  </Card>

                  <Card className="flex flex-1 flex-col border-t-[3px] border-t-cyan-600">
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div>
                        <CardTitle>Closing Soon</CardTitle>
                        <CardDescription>Saved roles with deadlines this month.</CardDescription>
                      </div>
                      <Badge className="shrink-0 border-amber-200 bg-amber-50 text-amber-800">{closingSoon.length} closing soon</Badge>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-3">
                      <div className="h-0.5 rounded-full bg-border" />
                      {closingSoon.length ? closingSoon.slice(0, 3).map((row) => (
                        <button className="border-b pb-3 text-left last:border-0 last:pb-0" key={row.id} type="button" onClick={() => void openJob(row.job_id)}>
                          <span className="block text-sm font-semibold hover:underline">{row.jobs?.title ?? "Untitled role"}</span>
                          <span className="text-xs text-muted-foreground">{row.companies?.name ?? "Unknown company"}</span>
                        </button>
                      )) : <p className="text-sm text-muted-foreground">No closing-soon alerts right now.</p>}
                    </CardContent>
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
                    {viewLoading ? "Loading…" : feedError ? "Jobs could not be loaded" : `${feed.total} matching jobs · page ${page + 1} of ${Math.max(1, Math.ceil(feed.total / JOB_PAGE_SIZE))}`}
                  </CardDescription>
                  <div role="group" aria-label="Job view" className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" aria-pressed={jobView === "for_you"} variant={jobView === "for_you" ? "default" : "outline"} onClick={() => changeJobView("for_you")}>For you</Button>
                    <Button size="sm" aria-pressed={jobView === "all"} variant={jobView === "all" ? "default" : "outline"} onClick={() => changeJobView("all")}>All jobs</Button>
                  </div>
                  {jobView === "for_you" && <p className="text-sm text-muted-foreground">Jobs with a skill-match score above 0%, highest first. Scores measure coverage of the job&apos;s tagged skills, not an AI fit score.</p>}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {WORK_MODE_FILTERS.map((filter) => (
                      <Button key={filter.value} size="sm" variant={workMode === filter.value ? "default" : "outline"}
                        aria-pressed={workMode === filter.value} onClick={() => { resetJobSelection(); setWorkMode(filter.value); }}>
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                  <JobsFilters search={search} onClearSearch={() => { resetJobSelection(); setSearch(""); }}
                    workMode={workMode} onClearWorkMode={() => { resetJobSelection(); setWorkMode("all"); }}
                    postedDate={jobPostedDate} onPostedDate={(value) => { resetJobSelection(); setJobPostedDate(value); }}
                    minimumMatch={minimumSkillMatch} onMinimumMatch={(value) => { resetJobSelection(); setMinimumSkillMatch(value); }}
                    locations={jobLocations} onLocations={(value) => { resetJobSelection(); setJobLocations(value); }}
                    onClear={() => { resetJobSelection(); setSearch(""); setWorkMode("all"); setJobPostedDate("any"); setJobLocations([]); setMinimumSkillMatch(0); }} />
                </CardHeader>
                <CardContent key={`${feedKey}:${page}`} className="grid max-h-[70vh] gap-3 overflow-y-auto">
                  {viewLoading && <p role="status" className="text-sm text-muted-foreground">Loading jobs…</p>}
                  {!viewLoading && feedError && <div role="alert" className="grid gap-3 text-sm">
                    <p>Could not load jobs: {feedError}</p><Button variant="outline" onClick={() => setRecommendationRefresh((n) => n + 1)}>Retry jobs</Button>
                  </div>}
                  {!viewLoading && !feedError && filteredJobs.length === 0 ? (
                    <EmptyText text={jobView === "for_you" ? "No jobs have a positive skill-match score with these filters. Add skills in your profile, clear filters, or browse All jobs. Untagged jobs cannot be scored." : "No jobs match your search and filters."} />
                  ) : null}
                  {!viewLoading && filteredJobs.map((job) => (
                    <JobRow
                      compact
                      busy={busyJobId === job.id}
                      job={job}
                      skillMatch={getJobSkillMatch(job, knownSkillIds)}
                      skillState={skillMatchState}
                      key={job.id}
                      match={matchFor(job.id)}
                      selected={selectedJob?.id === job.id}
                      status={statusByJob.get(job.id)}
                      onOpen={() => { resetJobSelection(); setSelectedJobId(job.id); }}
                      onSave={() => track(job.id, "saved")}
                    />
                  ))}
                  <div className="flex items-center justify-between gap-3 border-t pt-3">
                    <Button variant="outline" disabled={viewLoading || page === 0} onClick={() => { resetJobSelection(); setPagination({ key: feedKey, page: page - 1 }); }}>Previous</Button>
                    <Button variant="outline" disabled={viewLoading || !!feedError || (page + 1) * JOB_PAGE_SIZE >= feed.total} onClick={() => { resetJobSelection(); setPagination({ key: feedKey, page: page + 1 }); }}>Next</Button>
                  </div>
                </CardContent>
              </Card>

              {openingJob || jobOpenError ? <Card><CardContent className="p-5"><p role={jobOpenError ? "alert" : "status"} className="text-sm">{jobOpenError ?? "Loading job details…"}</p></CardContent></Card> : selectedJob && !viewLoading ? (
                <JobDetail
                  key={selectedJob.id}
                  busy={busyJobId === selectedJob.id}
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
                  resumeSelection={statusByJob.has(selectedJob.id) ? <JobResumeSelect jobId={selectedJob.id} jobTitle={selectedJob.title} library={resumeLibrary} onProfile={() => setTab("profile")} /> : undefined}
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
                matchFor={matchFor} matchFilter={trackerMatchFilter} onMatchFilter={setTrackerMatchFilter}
                busyJobId={busyJobId} onChange={track} onOpen={openJob} onRemove={untrack}
                resumeLibrary={resumeLibrary} onProfile={() => setTab("profile")} />
            </TabsContent>

            <TabsContent value="skills">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-4 text-sm">
                <p>Keep different resume versions and choose one for each tracked job.</p>
                <Button variant="outline" onClick={() => setTab("profile")}>Open resume library</Button>
              </div>
              <SkillDevelopment userId={userId} jobs={jobs} jobsLoading={loading}
                resumeResult={resumeResult} onResumeResult={setResumeResult} onProfileDraft={fillProfileFromResume} onSkillsChanged={() => setSkillRefresh((n) => n + 1)} />
            </TabsContent>

            {/* ---------------- Personalization ---------------- */}
            <TabsContent value="profile" className="grid gap-6">
              <div><h2 className="text-2xl font-semibold">Profile</h2><p className="text-sm text-muted-foreground">Your details, resume versions, job preferences and alerts.</p></div>
              <ResumeLibrary userId={userId} library={resumeLibrary} />
              <Card><CardHeader><CardTitle>Your profile and job preferences</CardTitle><CardDescription>Add skills for For you recommendations. Save target roles for role alerts and a preferred location for the location filter.</CardDescription></CardHeader>
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
                <p className="text-sm text-muted-foreground">Resume versions stay private in your library until you delete them or your account. Use Skills to scan a resume for skills. Each job’s resume choice records the version you plan to submit.</p>
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

const MATCH_EXPLANATION = "Share of the skills mentioned in this posting that are in My skills. Postings can mention optional skills, so treat this as a guide.";
const MATCH_PENDING_EXPLANATION = "No score yet: this posting has no stored skills, or you have not added any skills.";

const PROGRESS_TONES = ["border-t-sky-300", "border-t-sky-400", "border-t-sky-600", "border-t-sky-900"];

function CompanyLogo({ name, logoUrl, size = 36 }: { name: string; logoUrl: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  const box = { width: size, height: size, flex: `0 0 ${size}px` };
  if (logoUrl && !failed) {
    return <img alt="" className="rounded-md border bg-white object-contain p-1" src={logoUrl} style={box} onError={() => setFailed(true)} />;
  }
  return <div aria-hidden="true" className="grid place-items-center rounded-md bg-slate-100 text-xs font-bold text-slate-700" style={box}>{initials}</div>;
}

function DashboardJobCard({ job, match, onOpen }: { job: Job; match: JobMatch | null; onOpen: () => void }) {
  const tone = match ? matchTone(match.percent) : null;
  const toneClass = tone === "strong"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : tone === "fair"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-slate-100 text-slate-600";
  return (
    <button className="flex h-[72px] shrink-0 items-center gap-3.5 rounded-lg border bg-card px-3.5 text-left transition-colors hover:border-cyan-200 hover:bg-cyan-50/40" type="button" onClick={onOpen}>
      <CompanyLogo logoUrl={job.companies?.logo_url ?? null} name={job.companies?.name ?? "Unknown company"} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{job.title}</span>
        <span className="block truncate text-sm text-muted-foreground">{job.companies?.name ?? "Unknown company"} · {job.location ?? "Location not listed"}</span>
      </span>
      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{match ? `Skill match ${match.percent}%` : "Skill match pending"}</span>
    </button>
  );
}

function MatchScoreBadge({ match }: { match: JobMatch | null }) {
  return (
    <span
      className="inline-flex w-fit items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800"
      title={match ? MATCH_EXPLANATION : MATCH_PENDING_EXPLANATION}
    >
      Skill match: {formatMatch(match)}
    </span>
  );
}

function JobRow({ job, match = null, skillMatch, skillState = "loading", status, compact = false,
  selected = false, busy = false, onOpen, onSave,
}: {
  job: Job; match?: JobMatch | null; skillMatch?: JobSkillMatch; skillState?: SkillMatchState;
  status?: ApplicationStatus; compact?: boolean; selected?: boolean; busy?: boolean;
  onOpen: () => void; onSave: () => void;
}) {
  return <article className={`min-w-0 rounded-xl border p-4 transition-colors ${
    selected ? "border-blue-400 bg-blue-50/70 shadow-sm" : "bg-card hover:border-blue-200 hover:bg-blue-50/30"
  }`}>
    <button className="block w-full min-w-0 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      type="button" aria-pressed={compact ? selected : undefined} onClick={onOpen}>
      {skillMatch ? <SkillMatchBadge match={skillMatch} state={skillState} /> : <MatchScoreBadge match={match} />}
      <h3 title={job.title} className="mt-2 line-clamp-2 break-words text-sm font-semibold leading-5 hover:underline">{job.title}</h3>
      <p className="mt-1 truncate text-sm text-muted-foreground">{job.companies?.name ?? "Unknown company"}</p>
      <p title={job.location ?? undefined} className="mt-1 truncate text-xs text-muted-foreground">{summarizeJobLocation(job.location)}</p>
    </button>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge className="text-xs">{WORK_MODE_LABELS[job.work_mode] ?? "Not listed"}</Badge>
        <span>{formatPosted(job.posted_at)}</span>
      </div>
      {status ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
        <Check className="mr-1 h-3 w-3" aria-hidden="true" />{statusLabel(status)}
      </Badge> : <Button size="sm" variant="outline" disabled={busy} aria-label={`Save ${job.title}`} onClick={onSave}>
        <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />{busy ? "Saving…" : "Save"}
      </Button>}
    </div>
  </article>;
}

function JobDetail({
  job,
  busy,
  skillMatch,
  skillState,
  onEditSkills,
  onRetrySkills,
  status,
  onTrack,
  userId,
  isPriorityCompany,
  onPriorityCompanyToggled,
  resumeSelection,
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
  resumeSelection?: React.ReactNode;
  busy: boolean;
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
          <Button variant="outline" disabled={busy || !!status} onClick={() => onTrack("saved")}>
            {status ? <Check className="h-4 w-4" aria-hidden="true" /> : <Bookmark className="h-4 w-4" aria-hidden="true" />}
            {busy ? "Saving…" : status ? "In tracker" : "Save job"}
          </Button>
          <PriorityCompanyButton key={job.company_id} companyId={job.company_id} companyName={job.companies?.name ?? "this company"}
            isActive={isPriorityCompany} onToggled={onPriorityCompanyToggled} userId={userId} showCompanyLabel />
        </div>
        <JobSkillBreakdown match={skillMatch} state={skillState} onEditSkills={onEditSkills} onRetry={onRetrySkills} />
        <section aria-label="Application status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <div><label htmlFor={`job-status-${job.id}`} className="text-sm font-semibold">Application status</label>
            <p className="mt-1 text-xs text-muted-foreground">{status ? "Updates are saved to your tracker." : "Choose a status to start tracking."}</p></div>
          <select id={`job-status-${job.id}`} value={status ? normalizeStatus(status) : ""} disabled={busy}
            className="h-10 rounded-md border bg-card px-3 text-sm" onChange={(event) => onTrack(event.target.value as ApplicationStatus)}>
            <option value="" disabled>Not tracked</option>
            {TRACKER_COLUMNS.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
          </select>
        </section>
        {resumeSelection && <section className="rounded-md border p-3">{resumeSelection}</section>}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Job description</h2>
          <p className="whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
            {job.description || "No description was provided. Open the posting to read more."}
          </p>
        </section>
      </CardContent>
    </Card>
  );
}

function MatchScoreFilter({ label, value, onChange }: { label: string; value: MatchFilter; onChange: (value: MatchFilter) => void }) {
  return (
    <label className="grid gap-1 text-xs font-medium">
      Skill match
      <select aria-label={label} className="h-10 rounded-md border bg-card px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value as MatchFilter)}>
        {MATCH_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
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
  sort, onSort, matchFor, matchFilter, onMatchFilter, busyJobId, onChange, onOpen, onRemove,
  resumeLibrary, onProfile,
}: {
  rows: Application[]; allRows: Application[]; search: string; onSearch: (value: string) => void;
  workMode: WorkModeFilter; onWorkMode: (value: WorkModeFilter) => void;
  postedDate: PostedDateFilter; onPostedDate: (value: PostedDateFilter) => void;
  location: LocationFilter; onLocation: (value: LocationFilter) => void;
  locationQuery: string; onLocationQuery: (value: string) => void; preferredLocation: string | null;
  status: string; onStatus: (value: string) => void; sort: string; onSort: (value: string) => void;
  matchFor: (jobId: number) => JobMatch | null; matchFilter: MatchFilter; onMatchFilter: (value: MatchFilter) => void;
  busyJobId: number | null; onChange: (jobId: number, status: ApplicationStatus) => void;
  onOpen: (jobId: number) => void; onRemove: (applicationId: number, jobId: number) => void;
  resumeLibrary: ResumeLibraryModel; onProfile: () => void;
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
      <MatchScoreFilter label="Filter tracked jobs by match score" value={matchFilter} onChange={onMatchFilter} />
      <Button variant="ghost" size="sm" onClick={() => { onSearch(""); onStatus("all"); onWorkMode("all"); onPostedDate("any"); onLocation("any"); onLocationQuery(""); onMatchFilter("any"); }}>Clear filters</Button>
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
          <th className="px-4 py-3 font-medium">Resume</th>
          <th className="px-4 py-3 font-medium">Last update</th><th className="px-4 py-3 font-medium">Location</th>
          <th className="px-4 py-3 font-medium">Actions</th>
        </tr></thead><tbody>
          {rows.map((app) => <tr className="border-t hover:bg-blue-50/40" key={app.id}>
            <td className="px-4 py-3 font-semibold">{app.jobs?.companies?.name ?? "Unknown company"}</td>
            <td className="min-w-[180px] px-4 py-3"><button className="text-left font-medium text-primary hover:underline" onClick={() => onOpen(app.job_id)}>{app.jobs?.title ?? "Job no longer listed"}</button></td>
            <td className="px-4 py-3"><select aria-label={`Status for ${app.jobs?.title ?? "tracked job"}`} className="h-9 rounded-md border bg-card px-2" disabled={busyJobId === app.job_id} value={normalizeStatus(app.status)} onChange={(event) => onChange(app.job_id, event.target.value as ApplicationStatus)}>
              {TRACKER_COLUMNS.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
            </select></td>
            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground" title={matchFor(app.job_id) ? MATCH_EXPLANATION : MATCH_PENDING_EXPLANATION}>{formatMatch(matchFor(app.job_id))}</td>
            <td className="px-4 py-3"><JobResumeSelect jobId={app.job_id} jobTitle={app.jobs?.title ?? "tracked job"} library={resumeLibrary} onProfile={onProfile} /></td>
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
