"use client";

import { JobDetail } from "@/components/jobs/job-detail";
import { JobRow } from "@/components/jobs/job-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyText } from "@/components/ui/empty-states";
import { WORK_MODE_FILTERS, type JobView, type WorkModeFilter } from "@/lib/filters";
import type { ApplicationStatus, Job } from "@/lib/types";

/** The Jobs tab: the job list with its filters on the left, the selected job on the right. */
export function JobsView({
  jobView, onChangeJobView, viewLoading, filteredJobs, viewJobsCount, targetRoles, workMode, onWorkMode,
  profileLoading, profileError, onRetryProfile, recommendationError, onRetryRecommendations, onSetTargetRoles,
  selectedJob, statusByJob, onSelectJob, onSave, onTrack, openingJob, jobOpenError,
  followedCompanyIds, onFollowCompanyToggled, userId,
}: {
  jobView: JobView;
  onChangeJobView: (view: JobView) => void;
  viewLoading: boolean;
  filteredJobs: Job[];
  viewJobsCount: number;
  targetRoles: string[];
  workMode: WorkModeFilter;
  onWorkMode: (mode: WorkModeFilter) => void;
  profileLoading: boolean;
  profileError: string | null;
  onRetryProfile: () => void;
  recommendationError: string | null;
  onRetryRecommendations: () => void;
  onSetTargetRoles: () => void;
  selectedJob: Job | null;
  statusByJob: Map<number, ApplicationStatus>;
  onSelectJob: (jobId: number) => void;
  onSave: (jobId: number) => void;
  onTrack: (jobId: number, status: ApplicationStatus) => void;
  openingJob: boolean;
  jobOpenError: string | null;
  followedCompanyIds: number[];
  onFollowCompanyToggled: (companyId: number, following: boolean) => void;
  userId: string;
}) {
  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>{jobView === "for_you" ? "For you" : "All jobs"}</CardTitle>
        <CardDescription>
          {viewLoading ? "Loading…" : `${filteredJobs.length} of ${viewJobsCount} loaded jobs · up to 300 newest results`}
        </CardDescription>
        <div role="group" aria-label="Job view" className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" aria-pressed={jobView === "for_you"} variant={jobView === "for_you" ? "default" : "outline"} onClick={() => onChangeJobView("for_you")}>For you</Button>
          <Button size="sm" aria-pressed={jobView === "all"} variant={jobView === "all" ? "default" : "outline"} onClick={() => onChangeJobView("all")}>All jobs</Button>
        </div>
        {jobView === "for_you" && targetRoles.length > 0 && <p className="break-words text-sm text-muted-foreground">Based on saved roles: {targetRoles.join(", ")}. Matches use job-title keywords from your saved roles.</p>}
        <div className="flex flex-wrap gap-2 pt-2">
          {WORK_MODE_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              size="sm"
              variant={workMode === filter.value ? "default" : "outline"}
              aria-pressed={workMode === filter.value}
              onClick={() => onWorkMode(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="grid max-h-[70vh] gap-3 overflow-y-auto">
        {viewLoading && <p role="status" className="text-sm text-muted-foreground">Loading jobs…</p>}
        {jobView === "for_you" && !profileLoading && profileError && <div role="alert" className="grid gap-3 text-sm">
          <p>Could not load your target roles: {profileError}</p><Button variant="outline" onClick={onRetryProfile}>Retry profile</Button>
        </div>}
        {jobView === "for_you" && !profileError && !targetRoles.length && <p className="text-sm text-muted-foreground">
          Showing all jobs. <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={onSetTargetRoles}>Set target roles</button> to personalize this view.
        </p>}
        {jobView === "for_you" && !viewLoading && !profileError && targetRoles.length > 0 && recommendationError && <div role="alert" className="grid gap-3 text-sm">
          <p>Could not load personalized jobs: {recommendationError}</p><Button variant="outline" onClick={onRetryRecommendations}>Retry recommendations</Button>
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
            onOpen={() => onSelectJob(job.id)}
            onSave={() => onSave(job.id)}
          />
        ))}
      </CardContent>
    </Card>

    {openingJob || jobOpenError ? <Card><CardContent className="p-5"><p role={jobOpenError ? "alert" : "status"} className="text-sm">{jobOpenError ?? "Loading job details…"}</p></CardContent></Card> : selectedJob && !viewLoading ? (
      <JobDetail
        isFollowingCompany={followedCompanyIds.includes(selectedJob.company_id)}
        job={selectedJob}
        onFollowCompanyToggled={onFollowCompanyToggled}
        status={statusByJob.get(selectedJob.id)}
        onTrack={(status) => onTrack(selectedJob.id, status)}
        userId={userId}
      />
    ) : (
      <Card>
        <CardContent className="p-5">
          <EmptyText text="Pick a job to see its details." />
        </CardContent>
      </Card>
    )}
    </>
  );
}
