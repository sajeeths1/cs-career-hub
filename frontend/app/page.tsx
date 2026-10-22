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
  Trash2,
} from "lucide-react";
import { AuthScreen } from "@/components/auth-screen";
import { ProfileForm } from "@/components/profile-form";
import { SkillDevelopment } from "@/components/skill-development";
import { ResumeUpload } from "@/components/resume-upload";
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
  fetchJob,
  fetchJobsForTargetRoles,
  fetchOpenJobs,
  fetchProfile,
  removeApplication,
  setApplicationStatus,
} from "@/lib/data";
import { navItems } from "@/lib/mock-data";
import { parseTargetRoles } from "@/lib/job-personalization";
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
  const [search, setSearch] = useState("");
  const [workMode, setWorkMode] = useState<WorkModeFilter>("all");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
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
  const viewJobs = jobView === "for_you" ? recommendedJobs : jobs;
  const viewLoading = jobView === "for_you" ? recommendationsLoading : loading;
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
    try {
      await setApplicationStatus(userId, jobId, status);
      await reloadApplications();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function untrack(applicationId: number) {
    try {
      await removeApplication(applicationId);
      await reloadApplications();
    } catch (err) {
      setError((err as Error).message);
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
      if (!term) return true;
      const haystack = `${job.title} ${job.companies?.name ?? ""} ${job.location ?? ""}`;
      return haystack.toLowerCase().includes(term);
    });
  }, [viewJobs, search, workMode]);

  const selectedJob =
    (directJob?.id === selectedJobId ? directJob : null) ??
    filteredJobs.find((job) => job.id === selectedJobId) ?? filteredJobs[0] ?? null;

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
            void loadAll(); void loadProfile(); setRecommendationRefresh((n) => n + 1);
          }}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
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
              <TabsTrigger value="applications">Applications</TabsTrigger>
              <TabsTrigger value="skills">Skills</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
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
                <ResumeUpload compact />
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
                </CardHeader>
                <CardContent className="grid max-h-[70vh] gap-3 overflow-y-auto">
                  {viewLoading && <p role="status" className="text-sm text-muted-foreground">Loading jobs…</p>}
                  {jobView === "for_you" && !profileLoading && profileError && <div role="alert" className="grid gap-3 text-sm">
                    <p>Could not load your target roles: {profileError}</p><Button variant="outline" onClick={() => void loadProfile()}>Retry profile</Button>
                  </div>}
                  {jobView === "for_you" && !viewLoading && !profileError && !targetRoles.length && <div className="grid gap-3 text-sm">
                    <p>Add target roles in your profile to see jobs for you.</p><Button variant="outline" onClick={() => setTab("profile")}>Set target roles</Button>
                  </div>}
                  {jobView === "for_you" && !viewLoading && !profileError && recommendationError && <div role="alert" className="grid gap-3 text-sm">
                    <p>Could not load personalized jobs: {recommendationError}</p><Button variant="outline" onClick={() => setRecommendationRefresh((n) => n + 1)}>Retry recommendations</Button>
                  </div>}
                  {!viewLoading && filteredJobs.length === 0 && (jobView === "all" || (!profileError && targetRoles.length > 0 && !recommendationError)) ? (
                    <EmptyText text={jobView === "for_you" ? "No jobs match your target roles and current filters. Try All jobs or update your profile." : "No jobs match your search and filters."} />
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
                  job={selectedJob}
                  status={statusByJob.get(selectedJob.id)}
                  onTrack={(status) => track(selectedJob.id, status)}
                />
              ) : (
                <Card>
                  <CardContent className="p-5">
                    <EmptyText text="Pick a job to see its details." />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ---------------- Applications ---------------- */}
            <TabsContent value="applications">
              <Card>
                <CardHeader>
                  <CardTitle>Application tracker</CardTitle>
                  <CardDescription>
                    Change a job&apos;s status with the menu on its card. Saved to your account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  {TRACKER_COLUMNS.map((column) => {
                    const cards = applications.filter(
                      (app) => normalizeStatus(app.status) === column.status,
                    );
                    return (
                      <section className="rounded-lg border bg-muted/35 p-3" key={column.status}>
                        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
                          {column.label}
                          <span className="text-xs font-normal text-muted-foreground">{cards.length}</span>
                        </h2>
                        <div className="grid gap-3">
                          {cards.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Nothing here yet.</p>
                          ) : null}
                          {cards.map((app) => (
                            <TrackerCard
                              app={app}
                              key={app.id}
                              onChange={(status) => track(app.job_id, status)}
                              onOpen={() => openJob(app.job_id)}
                              onRemove={() => untrack(app.id)}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="skills">
              <SkillDevelopment userId={userId} jobs={jobs} jobsLoading={loading} />
            </TabsContent>

            {/* ---------------- Profile ---------------- */}
            <TabsContent value="profile" className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <Card>
                <CardHeader>
                  <CardTitle>Your profile</CardTitle>
                  <CardDescription>Saved to your account in Supabase.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ProfileForm userId={userId} onSaved={(saved) => {
                    profileRequest.current++;
                    setProfile(saved); setProfileLoading(false); setProfileError(null);
                    resetJobSelection();
                  }} />
                </CardContent>
              </Card>
              <ResumeUpload compact />
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
}: {
  job: Job;
  status?: ApplicationStatus;
  onTrack: (status: ApplicationStatus) => void;
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
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Tracker:</span>
            <select
              className="h-10 rounded-md border bg-card px-3 text-sm"
              value={status ?? ""}
              onChange={(event) => onTrack(event.target.value as ApplicationStatus)}
            >
              <option disabled value="">
                Not tracked
              </option>
              {TRACKER_COLUMNS.map((column) => (
                <option key={column.status} value={column.status}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
        </div>
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

function TrackerCard({
  app,
  onChange,
  onOpen,
  onRemove,
}: {
  app: Application;
  onChange: (status: ApplicationStatus) => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="grid gap-2 rounded-md border bg-card p-3 text-sm">
      <button className="text-left" type="button" onClick={onOpen}>
        <p className="font-medium hover:underline">{app.jobs?.title ?? "Job no longer listed"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{app.jobs?.companies?.name ?? ""}</p>
      </button>
      <div className="flex items-center gap-2">
        <select
          aria-label="Change status"
          className="h-8 flex-1 rounded-md border bg-card px-2 text-xs"
          value={normalizeStatus(app.status)}
          onChange={(event) => onChange(event.target.value as ApplicationStatus)}
        >
          {TRACKER_COLUMNS.map((column) => (
            <option key={column.status} value={column.status}>
              {column.label}
            </option>
          ))}
        </select>
        <Button aria-label="Remove from tracker" size="icon" variant="ghost" className="h-8 w-8" onClick={onRemove}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
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
