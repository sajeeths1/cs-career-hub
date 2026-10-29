"use client";

import { JobRow } from "@/components/jobs/job-row";
import { ResumeUpload } from "@/components/resume-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyText } from "@/components/ui/empty-states";
import type { ParsedResume, ResumeDraft } from "@/lib/resume";
import type { ApplicationStatus, Job } from "@/lib/types";

export type DashboardMetric = { label: string; value: number; note: string };

/** The Dashboard tab: headline, stat cards, jobs for you and the resume upload. */
export function DashboardView({
  metrics, loading, dashboardPersonalized, targetRoles, dashboardLoading, recommendationError,
  dashboardJobs, statusByJob, onViewMore, onOpenJob, onSave, userId, resumeResult, onResumeResult, onProfileDraft,
}: {
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
  userId: string;
  resumeResult: ParsedResume | null;
  onResumeResult: (result: ParsedResume | null) => void;
  onProfileDraft: (draft: ResumeDraft) => void;
}) {
  return (
    <>
    <section>
      <p className="text-sm font-medium text-muted-foreground">Student dashboard</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        Find the next role worth applying to
      </h1>
    </section>

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

    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>{dashboardPersonalized ? "Jobs for you" : "Newest jobs"}</CardTitle>
            <CardDescription>{dashboardPersonalized
              ? `Based on your target roles: ${targetRoles.join(", ")}.`
              : "The latest open CS roles from company job boards. Add target roles in your profile to personalize this view."}</CardDescription>
          </div>
          <Button className="shrink-0" size="sm" variant="outline" onClick={onViewMore}>
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
              onOpen={() => onOpenJob(job.id)}
              onSave={() => onSave(job.id)}
            />
          ))}
        </CardContent>
      </Card>
      <div className="grid content-start gap-6">
        <ResumeUpload compact userId={userId} result={resumeResult} onResult={onResumeResult} onProfileDraft={onProfileDraft} />
      </div>
    </div>
    </>
  );
}
