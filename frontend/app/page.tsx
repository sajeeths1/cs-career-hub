"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
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
import type { ParsedResume, ResumeDraft } from "@/lib/resume";
import { DashboardView } from "@/components/dashboard-view";
import { JobsView } from "@/components/jobs/jobs-view";
import { TrackerView } from "@/components/tracker/tracker-view";
import { CenteredText, SetupMessage } from "@/components/ui/empty-states";
import { type JobView, type WorkModeFilter } from "@/lib/filters";
import { normalizeStatus } from "@/lib/format";
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
import { supabase } from "@/lib/supabase";
import {
  type Application,
  type ApplicationStatus,
  type Job,
  type Profile,
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
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [trackerSearch, setTrackerSearch] = useState("");
  const [trackerWorkMode, setTrackerWorkMode] = useState<WorkModeFilter>("all");
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
      if (!term) return true;
      const haystack = `${job.title} ${job.companies?.name ?? ""} ${job.location ?? ""}`;
      return haystack.toLowerCase().includes(term);
    });
  }, [viewJobs, search, workMode]);

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
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Something went wrong talking to the database: {error}
            </div>
          ) : null}

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
            <TabsContent value="dashboard" className="space-y-6">
              <DashboardView
                metrics={metrics}
                loading={loading}
                dashboardPersonalized={dashboardPersonalized}
                targetRoles={targetRoles}
                dashboardLoading={dashboardLoading}
                recommendationError={recommendationError}
                dashboardJobs={dashboardJobs}
                statusByJob={statusByJob}
                onViewMore={() => { changeJobView(dashboardPersonalized ? "for_you" : "all"); setTab("jobs"); }}
                onOpenJob={(jobId) => void openJob(jobId, dashboardPersonalized ? "for_you" : "all")}
                onSave={(jobId) => track(jobId, "saved")}
                userId={userId}
                resumeResult={resumeResult}
                onResumeResult={setResumeResult}
                onProfileDraft={fillProfileFromResume}
              />
            </TabsContent>

            {/* ---------------- Jobs ---------------- */}
            <TabsContent value="jobs" className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
              <JobsView
                jobView={jobView}
                onChangeJobView={changeJobView}
                viewLoading={viewLoading}
                filteredJobs={filteredJobs}
                viewJobsCount={viewJobs.length}
                targetRoles={targetRoles}
                workMode={workMode}
                onWorkMode={(mode) => { resetJobSelection(); setWorkMode(mode); }}
                profileLoading={profileLoading}
                profileError={profileError}
                onRetryProfile={() => void loadProfile()}
                recommendationError={recommendationError}
                onRetryRecommendations={() => setRecommendationRefresh((n) => n + 1)}
                onSetTargetRoles={() => setTab("profile")}
                selectedJob={selectedJob}
                statusByJob={statusByJob}
                onSelectJob={(jobId) => { resetJobSelection(); setSelectedJobId(jobId); }}
                onSave={(jobId) => track(jobId, "saved")}
                onTrack={(jobId, status) => track(jobId, status)}
                openingJob={openingJob}
                jobOpenError={jobOpenError}
                followedCompanyIds={followedCompanyIds}
                onFollowCompanyToggled={(companyId, following) => setFollowedCompanyIds((ids) =>
                  following ? [...ids, companyId] : ids.filter((id) => id !== companyId))}
                userId={userId}
              />
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
