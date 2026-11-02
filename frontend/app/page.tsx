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
import { ResumeUpload } from "@/components/resume-upload";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationSettingsTab } from "@/components/notification-settings";
import { CompaniesTab } from "@/components/companies";
import { FollowCompanyButton } from "@/components/follow-company-button";
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
  fetchFollowedCompanyIds,
  fetchJob,
  fetchJobsForTargetRoles,
  fetchOpenJobs,
  fetchProfile,
  removeApplication,
  setApplicationStatus,
} from "@/lib/data";
import { navItems } from "@/lib/mock-data";
import { parseTargetRoles } from "@/lib/job-personalization";
import { matchesPostedDate, POSTED_DATE_FILTERS, type PostedDateFilter } from "@/lib/job-filters";
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
  const fillProfileFromResume = (draft: ResumeDraft) => { setResumeDraft(draft); setTab("profile"); };
  const [search, setSearch] = useState("");
  const [workMode, setWorkMode] = useState<WorkModeFilter>("all");
  const [jobPostedDate, setJobPostedDate] = useState<PostedDateFilter>("any");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [trackerSearch, setTrackerSearch] = useState("");
  const [trackerWorkMode, setTrackerWorkMode] = useState<WorkModeFilter>("all");
  const [trackerPostedDate, setTrackerPostedDate] = useState<PostedDateFilter>("any");
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
  const [followedCompanyIds, setFollowedCompanyIds] = useState<number[]>([]);

  const loadFollowedCompanies = useCallback(async () => {
    try {
      setFollowedCompanyIds(await fetchFollowedCompanyIds(userId));
    } catch {
      // Non-critical for the jobs view; the Settings tab surfaces load errors for this.
    }
  }, [userId]);

  useEffect(() => {
    void loadFollowedCompanies();
  }, [loadFollowedCompanies]);
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
  // With no saved target roles, "For you" falls back to all jobs instead of showing nothing.
  const viewJobs = jobView === "for_you" && targetRoles.length ? recommendedJobs : jobs;
  const viewLoading = jobView === "for_you" && targetRoles.length ? recommendationsLoading : loading;
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
      if (!term) return true;
      const haystack = `${job.title} ${job.companies?.name ?? ""} ${job.location ?? ""}`;
      return haystack.toLowerCase().includes(term);
    });
  }, [viewJobs, search, workMode, jobPostedDate]);

  const selectedJob =
    (directJob?.id === selectedJobId ? directJob : null) ??
    filteredJobs.find((job) => job.id === selectedJobId) ?? filteredJobs[0] ?? null;

  const savedJobs = applications.filter((app) => normalizeStatus(app.status) === "saved");
  const activeApplications = applications.filter((app) => normalizeStatus(app.status) !== "saved");

  function visibleTrackerRows(rows: Application[], view: "saved" | "applications") {
    const term = trackerSearch.trim().toLowerCase();
    return rows.filter((app) => {
      if (view === "applications" && trackerStatus !== "all" && normalizeStatus(app.status) !== trackerStatus) return false;
      if (trackerWorkMode !== "all" && app.jobs?.work_mode !== trackerWorkMode) return false;
      if (!matchesPostedDate(app.jobs?.posted_at ?? null, trackerPostedDate)) return false;
      const job = app.jobs;
      return !term || `${job?.title ?? ""} ${job?.companies?.name ?? ""} ${job?.location ?? ""}`.toLowerCase().includes(term);
    }).sort((a, b) => trackerSort === "title"
      ? (a.jobs?.title ?? "").localeCompare(b.jobs?.title ?? "")
      : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  const countByStatus = (status: ApplicationStatus) =>
    applications.filter((app) => normalizeStatus(app.status) === status).length;

  const metrics = [
    { label: "Open CS jobs", value: jobs.length, note: "From company job boards" },
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

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r bg-card px-4 py-5 lg:flex lg:flex-col">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            CH
          </div>
          <div className="min-w-0">
            <p className="font-semibold">CS Career Hub</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const value = item.label.toLowerCase();
            return (
              <button
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  tab === value
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
          className="mt-auto justify-start"
          variant="outline"
          onClick={() => supabase?.auth.signOut()}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
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
                if (!targetRoles.length || profileError) setJobView("all");
                setSearch(event.target.value);
                setTab("jobs");
              }}
            />
          </div>
          <Button aria-label="Refresh" size="icon" variant="outline" onClick={() => {
            void loadAll(); void loadProfile(); void loadFollowedCompanies(); setRecommendationRefresh((n) => n + 1);
          }}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          <NotificationBell />
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
          <section>
            <p className="text-sm font-medium text-muted-foreground">Student dashboard</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Find the next role worth applying to
            </h1>
          </section>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Something went wrong talking to the database: {error}
            </div>
          ) : null}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <Card key={metric.label}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="mt-2 text-3xl font-semibold">{loading ? "–" : metric.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <Tabs className="space-y-5" defaultValue="dashboard" value={tab} onValueChange={setTab}>
            <TabsList className="max-w-full overflow-x-auto lg:hidden">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="jobs">Jobs</TabsTrigger>
              <TabsTrigger value="saved">Saved Jobs</TabsTrigger>
              <TabsTrigger value="applications">Applications</TabsTrigger>
              <TabsTrigger value="skills">Skills</TabsTrigger>
              <TabsTrigger value="companies">Companies</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            {/* ---------------- Dashboard ---------------- */}
            <TabsContent value="dashboard" className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle>{dashboardPersonalized ? "Jobs for you" : "Newest jobs"}</CardTitle>
                    <CardDescription>{dashboardPersonalized
                      ? `Based on your target roles: ${targetRoles.join(", ")}.`
                      : "The latest open CS roles from company job boards. Add target roles in your profile to personalize this view."}</CardDescription>
                  </div>
                  <Button className="shrink-0" size="sm" variant="outline" onClick={() => { changeJobView(dashboardPersonalized ? "for_you" : "all"); setTab("jobs"); }}>
                    View more
                  </Button>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {dashboardLoading ? <EmptyText text="Loading jobs…" /> : null}
                  {!dashboardLoading && dashboardPersonalized && recommendationError && <p role="alert" className="text-sm text-red-600">Could not load personalized jobs. Open Jobs to retry or browse all jobs.</p>}
                  {!dashboardLoading && !recommendationError && dashboardJobs.length === 0 ? (
                    <EmptyText text={dashboardPersonalized ? "No open titles match your target roles yet. You can edit your profile or browse All jobs." : "No open jobs are available yet."} />
                  ) : null}
                  {!dashboardLoading && dashboardJobs.slice(0, 6).map((job) => (
                    <JobRow
                      job={job}
                      key={job.id}
                      status={statusByJob.get(job.id)}
                      onOpen={() => void openJob(job.id, dashboardPersonalized ? "for_you" : "all")}
                      onSave={() => track(job.id, "saved")}
                    />
                  ))}
                </CardContent>
              </Card>
              <div className="grid content-start gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Your tracker</CardTitle>
                    <CardDescription>Jobs you&apos;re keeping an eye on.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {TRACKER_COLUMNS.map((column) => (
                      <div className="flex items-center justify-between text-sm" key={column.status}>
                        <span>{column.label}</span>
                        <Badge>{countByStatus(column.status)}</Badge>
                      </div>
                    ))}
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      onClick={() => setTab("applications")}
                    >
                      Open tracker
                    </Button>
                  </CardContent>
                </Card>
                <ResumeUpload compact userId={userId} result={resumeResult} onResult={setResumeResult} onProfileDraft={fillProfileFromResume} />
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
                  {jobView === "for_you" && targetRoles.length > 0 && <p className="break-words text-sm text-muted-foreground">Based on saved roles: {targetRoles.join(", ")}. Matches use job-title keywords from your saved roles.</p>}
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
                    <UnavailableMatchFilter id="jobs" />
                    <Button size="sm" variant="ghost" onClick={() => { resetJobSelection(); setSearch(""); setWorkMode("all"); setJobPostedDate("any"); }}>Clear filters</Button>
                  </div>
                </CardHeader>
                <CardContent className="grid max-h-[70vh] gap-3 overflow-y-auto">
                  {viewLoading && <p role="status" className="text-sm text-muted-foreground">Loading jobs…</p>}
                  {jobView === "for_you" && !profileLoading && profileError && <div role="alert" className="grid gap-3 text-sm">
                    <p>Could not load your target roles: {profileError}</p><Button variant="outline" onClick={() => void loadProfile()}>Retry profile</Button>
                  </div>}
                  {jobView === "for_you" && !profileError && !targetRoles.length && <p className="text-sm text-muted-foreground">
                    Showing all jobs. <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => setTab("profile")}>Set target roles</button> to personalize this view.
                  </p>}
                  {jobView === "for_you" && !viewLoading && !profileError && targetRoles.length > 0 && recommendationError && <div role="alert" className="grid gap-3 text-sm">
                    <p>Could not load personalized jobs: {recommendationError}</p><Button variant="outline" onClick={() => setRecommendationRefresh((n) => n + 1)}>Retry recommendations</Button>
                  </div>}
                  {!viewLoading && filteredJobs.length === 0 && (jobView === "all" || !targetRoles.length || (!profileError && !recommendationError)) ? (
                    <EmptyText text={jobView === "for_you" && targetRoles.length > 0 ? "No jobs match your target roles and current filters. Try All jobs or update your profile." : "No jobs match your search and filters."} />
                  ) : null}
                  {!viewLoading && filteredJobs.map((job) => (
                    <JobRow
                      compact
                      job={job}
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
                  isFollowingCompany={followedCompanyIds.includes(selectedJob.company_id)}
                  job={selectedJob}
                  onFollowCompanyToggled={(companyId, following) => setFollowedCompanyIds((ids) =>
                    following ? [...ids, companyId] : ids.filter((id) => id !== companyId))}
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

            {/* ---------------- Saved Jobs and Applications ---------------- */}
            {(["saved", "applications"] as const).map((view) => (
              <TabsContent value={view} key={view}>
                <TrackerView
                  title={view === "saved" ? "Saved Jobs" : "My Applications"}
                  description={view === "saved"
                    ? "Opportunities you bookmarked but haven't applied to yet."
                    : "Track applications from submission through the final outcome."}
                  rows={visibleTrackerRows(view === "saved" ? savedJobs : activeApplications, view)}
                  total={view === "saved" ? savedJobs.length : activeApplications.length}
                  view={view}
                  search={trackerSearch}
                  onSearch={setTrackerSearch}
                  workMode={trackerWorkMode}
                  onWorkMode={setTrackerWorkMode}
                  postedDate={trackerPostedDate}
                  onPostedDate={setTrackerPostedDate}
                  status={trackerStatus}
                  onStatus={setTrackerStatus}
                  sort={trackerSort}
                  onSort={setTrackerSort}
                  busyJobId={busyJobId}
                  onChange={track}
                  onOpen={openJob}
                  onRemove={untrack}
                />
              </TabsContent>
            ))}

            <TabsContent value="skills">
              <SkillDevelopment userId={userId} jobs={jobs} jobsLoading={loading} />
            </TabsContent>

            {/* ---------------- Companies ---------------- */}
            <TabsContent value="companies">
              <CompaniesTab userId={userId} />
            </TabsContent>

            {/* ---------------- Profile ---------------- */}
            <TabsContent value="profile" className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <Card>
                <CardHeader>
                  <CardTitle>Your profile</CardTitle>
                  <CardDescription>Saved to your account in Supabase.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ProfileForm userId={userId} resumeDraft={resumeDraft} onSaved={(saved) => {
                    setResumeDraft(null);
                    profileRequest.current++;
                    setProfile(saved); setProfileLoading(false); setProfileError(null);
                    resetJobSelection();
                  }} />
                </CardContent>
              </Card>
              <ResumeUpload compact userId={userId} result={resumeResult} onResult={setResumeResult} onProfileDraft={fillProfileFromResume} />
            </TabsContent>

            {/* ---------------- Settings ---------------- */}
            <TabsContent value="settings">
              <NotificationSettingsTab userId={userId} />
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

function JobRow({
  job,
  status,
  compact = false,
  selected = false,
  onOpen,
  onSave,
}: {
  job: Job;
  status?: ApplicationStatus;
  compact?: boolean;
  selected?: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  return (
    <article
      className={`grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_auto] sm:items-center ${
        selected ? "border-primary bg-muted/50" : ""
      }`}
    >
      <button className="min-w-0 text-left" type="button" onClick={onOpen}>
        <h3 className="truncate text-sm font-semibold hover:underline">{job.title}</h3>
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
  status,
  onTrack,
  userId,
  isFollowingCompany,
  onFollowCompanyToggled,
}: {
  job: Job;
  status?: ApplicationStatus;
  onTrack: (status: ApplicationStatus) => void;
  userId: string;
  isFollowingCompany: boolean;
  onFollowCompanyToggled: (companyId: number, following: boolean) => void;
}) {
  return (
    <Card className="content-start">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-xl">{job.title}</CardTitle>
            <CardDescription className="mt-1">
              {job.companies?.name ?? "Unknown company"} · {job.location ?? "Location not listed"} ·{" "}
              {formatPosted(job.posted_at)}
            </CardDescription>
            <div className="mt-2">
              <FollowCompanyButton
                companyId={job.company_id}
                companyName={job.companies?.name ?? "this company"}
                isActive={isFollowingCompany}
                onToggled={onFollowCompanyToggled}
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

function TrackerView({
  title, description, rows, total, view, search, onSearch, workMode, onWorkMode,
  postedDate, onPostedDate, status, onStatus, sort, onSort, busyJobId, onChange, onOpen, onRemove,
}: {
  title: string;
  description: string;
  rows: Application[];
  total: number;
  view: "saved" | "applications";
  search: string;
  onSearch: (value: string) => void;
  workMode: WorkModeFilter;
  onWorkMode: (value: WorkModeFilter) => void;
  postedDate: PostedDateFilter;
  onPostedDate: (value: PostedDateFilter) => void;
  status: string;
  onStatus: (value: string) => void;
  sort: string;
  onSort: (value: string) => void;
  busyJobId: number | null;
  onChange: (jobId: number, status: ApplicationStatus) => void;
  onOpen: (jobId: number) => void;
  onRemove: (applicationId: number, jobId: number) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <label className="grid min-w-[180px] flex-1 gap-1 text-xs font-medium">
            Keyword or company
            <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search tracked jobs" />
          </label>
          {view === "applications" ? (
            <label className="grid gap-1 text-xs font-medium">
              Status
              <select aria-label="Filter by status" className="h-10 rounded-md border bg-card px-3 text-sm" value={status} onChange={(event) => onStatus(event.target.value)}>
                <option value="all">All statuses</option>
                {TRACKER_COLUMNS.filter((column) => column.status !== "saved").map((column) => (
                  <option key={column.status} value={column.status}>{column.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="grid gap-1 text-xs font-medium">
            Work mode
            <select aria-label="Filter by work mode" className="h-10 rounded-md border bg-card px-3 text-sm" value={workMode} onChange={(event) => onWorkMode(event.target.value as WorkModeFilter)}>
              {WORK_MODE_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Date posted
            <select aria-label="Filter tracked jobs by date posted" className="h-10 rounded-md border bg-card px-3 text-sm" value={postedDate} onChange={(event) => onPostedDate(event.target.value as PostedDateFilter)}>
              {POSTED_DATE_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <UnavailableMatchFilter id={view} />
          <Button variant="ghost" size="sm" onClick={() => { onSearch(""); onStatus("all"); onWorkMode("all"); onPostedDate("any"); }}>Clear filters</Button>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="font-medium">{rows.length} of {total} {view === "saved" ? "saved jobs" : "applications"}</p>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Sort</span>
          <select aria-label="Sort tracked jobs" className="h-9 rounded-md border bg-card px-2" value={sort} onChange={(event) => onSort(event.target.value)}>
            <option value="recent">Recently updated</option>
            <option value="title">Job title</option>
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <Card><CardContent className="p-8"><EmptyText text={total === 0
          ? view === "saved" ? "No saved jobs yet. Save a posting from Jobs to see it here." : "No applications yet. Change a job's status to Applied to see it here."
          : "No tracked jobs match these filters."} /></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((app) => (
            <TrackerCard
              app={app}
              key={app.id}
              busy={busyJobId === app.job_id}
              onChange={(nextStatus) => onChange(app.job_id, nextStatus)}
              onOpen={() => onOpen(app.job_id)}
              onRemove={() => onRemove(app.id, app.job_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TrackerCard({
  app,
  busy,
  onChange,
  onOpen,
  onRemove,
}: {
  app: Application;
  busy: boolean;
  onChange: (status: ApplicationStatus) => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-md border bg-card p-4 text-sm">
      <div>
        <h3 className="font-semibold">{app.jobs?.title ?? "Job no longer listed"}</h3>
        <p className="mt-1 text-muted-foreground">{app.jobs?.companies?.name ?? "Unknown company"} · {app.jobs?.location ?? "Location not listed"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{WORK_MODE_LABELS[app.jobs?.work_mode ?? "unknown"]} · {formatPosted(app.jobs?.posted_at ?? null)}</p>
      </div>
      <label className="grid gap-1 text-xs font-medium">
        Application status
        <select
          aria-label={`Status for ${app.jobs?.title ?? "tracked job"}`}
          className="h-9 rounded-md border bg-card px-2 text-sm"
          disabled={busy}
          value={normalizeStatus(app.status)}
          onChange={(event) => onChange(event.target.value as ApplicationStatus)}
        >
          {TRACKER_COLUMNS.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
        </select>
      </label>
      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">Updated {new Date(app.updated_at).toLocaleDateString()}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => {
            if (window.confirm("Remove this job from your tracker?")) onRemove();
          }}>Remove</Button>
          <Button size="sm" disabled={busy} onClick={onOpen}>View job</Button>
        </div>
      </div>
    </article>
  );
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
