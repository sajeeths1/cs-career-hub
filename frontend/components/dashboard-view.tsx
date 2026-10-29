"use client";

import { JobRow } from "@/components/jobs/job-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyText } from "@/components/ui/empty-states";
import { formatPosted } from "@/lib/format";
import type { ApplicationStatus, Job } from "@/lib/types";

export type DashboardMetric = { label: string; value: number; note: string; tab: string };

/** The Dashboard tab: greeting, stat cards, top matches and followed companies. */
export function DashboardView({
  firstName, followedJobs, followedCount, onGoTo, metrics, loading, dashboardPersonalized, targetRoles, dashboardLoading, recommendationError,
  dashboardJobs, statusByJob, onViewMore, onOpenJob, onSave,
}: {
  firstName: string;
  /** Newest open jobs from companies the user follows */
  followedJobs: Job[];
  followedCount: number;
  onGoTo: (tab: string) => void;
  metrics: DashboardMetric[];
  loading: boolean;
  dashboardPersonalized: boolean;
  targetRoles: string[];
  dashboardLoading: boolean;
  recommendationError: string | null;
  dashboardJobs: Job[];
  statusByJob: Map<number, ApplicationStatus>;
  onViewMore: () => void;
  onOpenJob: (jobId: number) => void;
  onSave: (jobId: number) => void;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  // Top matches only shows jobs the user hasn't tracked yet.
  const topMatches = dashboardJobs.filter((job) => !statusByJob.has(job.id)).slice(0, 5);
  return (
    <>
      <section>
        <h1 className="text-3xl font-bold tracking-tight">{greeting}{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          {dashboardPersonalized
            ? `Jobs that fit your roles: ${targetRoles.join(", ")}.`
            : "The newest CS roles from company job boards."}
        </p>
      </section>

      <section aria-label="Your numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <button
            className="rounded-xl border bg-card px-5 py-4 text-left shadow-soft transition-colors hover:border-input"
            key={metric.label}
            type="button"
            onClick={() => onGoTo(metric.tab)}
          >
            <p className="text-[13px] text-muted-foreground">{metric.label}</p>
            <p className="mt-1.5 text-3xl font-bold">{loading ? "–" : metric.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{metric.note}</p>
          </button>
        ))}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>{dashboardPersonalized ? "Top matches for you" : "Newest jobs"}</CardTitle>
              <CardDescription>Jobs you haven&apos;t saved or tracked yet</CardDescription>
            </div>
            <Button className="shrink-0" size="sm" variant="ghost" onClick={onViewMore}>See all jobs →</Button>
          </CardHeader>
          <CardContent className="grid gap-2.5">
            {dashboardLoading ? <EmptyText text="Loading jobs…" /> : null}
            {!dashboardLoading && dashboardPersonalized && recommendationError && <p role="alert" className="text-sm text-red-600">Could not load personalized jobs. Open Jobs to retry or browse all jobs.</p>}
            {!dashboardLoading && !recommendationError && topMatches.length === 0 ? (
              <EmptyText text={dashboardPersonalized ? "No new jobs match your roles right now. You can edit your preferences or browse all jobs." : "No new jobs right now."} />
            ) : null}
            {!dashboardLoading && topMatches.map((job) => (
              <JobRow
                job={job}
                key={job.id}
                status={statusByJob.get(job.id)}
                onOpen={() => onOpenJob(job.id)}
                onSave={() => onSave(job.id)}
              />
            ))}
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">New from companies you follow</CardTitle>
              <CardDescription>{followedCount === 0 ? "You aren't following any companies yet" : `Following ${followedCount} ${followedCount === 1 ? "company" : "companies"}`}</CardDescription>
            </CardHeader>
            <CardContent className="grid">
              {followedJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {followedCount === 0 ? "Follow companies from a job's details or " : "No open jobs from them right now. Manage them in "}
                  <button className="font-medium text-primary hover:underline" type="button" onClick={() => onGoTo("companies")}>
                    Personalization
                  </button>.
                </p>
              ) : followedJobs.slice(0, 4).map((job) => (
                <button className="border-t py-2.5 text-left first:border-t-0" key={job.id} type="button" onClick={() => onOpenJob(job.id)}>
                  <span className="block text-sm font-semibold hover:underline">{job.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{job.companies?.name ?? "Unknown company"} · {formatPosted(job.posted_at)}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
