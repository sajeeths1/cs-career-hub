"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  fetchOpenJobs,
  removeApplication,
  setApplicationStatus,
} from "@/lib/data";
import { navItems } from "@/lib/mock-data";
import { supabase } from "@/lib/supabase";
import {
  TRACKER_COLUMNS,
  WORK_MODE_LABELS,
  type Application,
  type ApplicationStatus,
  type Job,
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
    return jobs.filter((job) => {
      if (workMode !== "all" && job.work_mode !== workMode) return false;
      if (!term) return true;
      const haystack = `${job.title} ${job.companies?.name ?? ""} ${job.location ?? ""}`;
      return haystack.toLowerCase().includes(term);
    });
  }, [jobs, search, workMode]);

  const selectedJob =
    filteredJobs.find((job) => job.id === selectedJobId) ?? filteredJobs[0] ?? null;

  const countByStatus = (status: ApplicationStatus) =>
    applications.filter((app) => normalizeStatus(app.status) === status).length;

  const metrics = [
    { label: "Open CS jobs", value: jobs.length, note: "From company job boards" },
    { label: "Saved", value: countByStatus("saved"), note: "In your tracker" },
    { label: "Applied", value: countByStatus("applied"), note: "Waiting to hear back" },
    { label: "Interviewing", value: countByStatus("interviewing"), note: "Keep preparing" },
  ];

  function openJob(jobId: number) {
    setSelectedJobId(jobId);
    setTab("jobs");
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
                setSearch(event.target.value);
                setTab("jobs");
              }}
            />
          </div>
          <Button aria-label="Refresh" size="icon" variant="outline" onClick={loadAll}>
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
                  <div>
                    <CardTitle>Newest jobs</CardTitle>
                    <CardDescription>The latest open CS roles from company job boards.</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setTab("jobs")}>
                    View all
                  </Button>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {loading ? <EmptyText text="Loading jobs…" /> : null}
                  {!loading && jobs.length === 0 ? (
                    <EmptyText text="No jobs yet. Run the pipeline (backend/worker/pipeline.py) to collect some." />
                  ) : null}
                  {jobs.slice(0, 6).map((job) => (
                    <JobRow
                      job={job}
                      key={job.id}
                      status={statusByJob.get(job.id)}
                      onOpen={() => openJob(job.id)}
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
            <TabsContent value="jobs" className="grid gap-6 xl:grid-cols-[420px_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>All jobs</CardTitle>
                  <CardDescription>
                    {loading ? "Loading…" : `${filteredJobs.length} of ${jobs.length} open jobs`}
                  </CardDescription>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {WORK_MODE_FILTERS.map((filter) => (
                      <Button
                        key={filter.value}
                        size="sm"
                        variant={workMode === filter.value ? "default" : "outline"}
                        onClick={() => setWorkMode(filter.value)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="grid max-h-[70vh] gap-3 overflow-y-auto">
                  {!loading && filteredJobs.length === 0 ? (
                    <EmptyText text="No jobs match your search and filters." />
                  ) : null}
                  {filteredJobs.map((job) => (
                    <JobRow
                      compact
                      job={job}
                      key={job.id}
                      selected={selectedJob?.id === job.id}
                      status={statusByJob.get(job.id)}
                      onOpen={() => setSelectedJobId(job.id)}
                      onSave={() => track(job.id, "saved")}
                    />
                  ))}
                </CardContent>
              </Card>

              {selectedJob ? (
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
                  <ProfileForm userId={userId} />
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
