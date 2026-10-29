"use client";

import { ExternalLink } from "lucide-react";
import { FollowCompanyButton } from "@/components/follow-company-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPosted, normalizeStatus } from "@/lib/format";
import { TRACKER_COLUMNS, WORK_MODE_LABELS, type ApplicationStatus, type Job } from "@/lib/types";

export function JobDetail({
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
