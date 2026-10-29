"use client";

import { JobDetail } from "@/components/jobs/job-detail";
import { JobRow } from "@/components/jobs/job-row";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyText } from "@/components/ui/empty-states";
import { WORK_MODE_FILTERS, type JobView, type WorkModeFilter } from "@/lib/filters";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, Job } from "@/lib/types";

/** The Jobs tab: the job list with its filters on the left, the selected job on the right. */
export function JobsView({
  search, onSearch, onClearFilters, jobView, onChangeJobView, viewLoading, filteredJobs, viewJobsCount, targetRoles, workMode, onWorkMode,
  profileLoading, profileError, onRetryProfile, recommendationError, onRetryRecommendations, onSetTargetRoles,
  selectedJob, statusByJob, onSelectJob, onSave, onTrack, openingJob, jobOpenError,
  followedCompanyIds, onFollowCompanyToggled, userId,
}: {
  search: string;
  onSearch: (value: string) => void;
  onClearFilters: () => void;
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
  const filtersActive = search.trim() !== "" || workMode !== "all";
  return (
    <div className="space-y-5">
      {/* Banner with the search bar */}
      <section className="relative overflow-hidden rounded-2xl px-6 pb-9 pt-10">
        <div aria-hidden="true" className="absolute inset-0 bg-[#F5F8FB]">
          <div className="absolute -left-20 -top-36 h-80 w-[460px] rounded-full bg-[#DCE6F2] blur-[70px]" />
          <div className="absolute left-[30%] top-10 h-80 w-[520px] rounded-full bg-[#E3E8F3] blur-[80px]" />
          <div className="absolute -right-16 -top-36 h-80 w-[460px] rounded-full bg-[#D8EAEC] blur-[70px]" />
        </div>
        <div className="relative flex flex-col items-center gap-5">
          <h1 className="text-center font-display text-[38px] font-medium tracking-tight text-[#1B2436]">Find your next role</h1>
          <form
            role="search"
            className="flex h-[52px] w-full max-w-[620px] items-center gap-2.5 rounded-full bg-card pl-[18px] pr-2 shadow-[0_6px_24px_rgba(27,36,54,0.08),0_1px_2px_rgba(27,36,54,0.06)]"
            onSubmit={(event) => event.preventDefault()}
          >
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <label className="sr-only" htmlFor="job-search">Search jobs</label>
            <input
              id="job-search"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              placeholder="Search jobs, companies, or locations"
              type="search"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
            />
            <button className="h-[38px] rounded-full bg-[#1B2436] px-[18px] text-sm font-semibold text-white" type="submit">Search</button>
          </form>
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div role="group" aria-label="Work mode" className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-foreground/80">Work mode</span>
          <div className="flex flex-wrap gap-1.5">
            {WORK_MODE_FILTERS.map((filter) => (
              <Button
                aria-pressed={workMode === filter.value}
                className="rounded-full"
                key={filter.value}
                size="sm"
                variant={workMode === filter.value ? "default" : "outline"}
                onClick={() => onWorkMode(filter.value)}
              >
                {filter.value === "all" ? "Any" : filter.label}
              </Button>
            ))}
          </div>
        </div>
        {filtersActive ? <Button size="sm" variant="ghost" onClick={onClearFilters}>Clear filters</Button> : null}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        {/* Job list */}
        <Card className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div role="group" aria-label="Job view" className="inline-flex rounded-lg bg-muted p-1">
              {(["for_you", "all"] as const).map((view) => (
                <button
                  aria-pressed={jobView === view}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                    jobView === view ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                  key={view}
                  type="button"
                  onClick={() => onChangeJobView(view)}
                >
                  {view === "for_you" ? "For you" : "All jobs"}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {viewLoading ? "Loading…" : `${filteredJobs.length} of ${viewJobsCount} loaded · up to 300 newest`}
            </span>
          </div>
          {jobView === "for_you" && targetRoles.length > 0 ? (
            <p className="break-words border-b px-4 py-2 text-xs text-muted-foreground">Based on your roles: {targetRoles.join(", ")}</p>
          ) : null}
          <div className="grid max-h-[780px] gap-2 overflow-y-auto p-3">
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
          </div>
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
      </div>
    </div>
  );
}
