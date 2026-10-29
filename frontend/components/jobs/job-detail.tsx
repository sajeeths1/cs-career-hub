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
  const current = status ? normalizeStatus(status) : null;
  return (
    <Card className="content-start">
      <CardHeader className="space-y-3 border-b pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-[22px] font-bold leading-tight">{job.title}</CardTitle>
            <CardDescription className="mt-1.5 text-[15px]">
              {job.companies?.name ?? "Unknown company"} · {job.location ?? "Location not listed"}
            </CardDescription>
          </div>
          <Badge className="shrink-0">{WORK_MODE_LABELS[job.work_mode] ?? "Not listed"}</Badge>
        </div>
        <p className="text-[13px] text-muted-foreground">{formatPosted(job.posted_at)}</p>
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <a
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#14171F] px-4 text-sm font-semibold text-white hover:bg-[#14171F]/90"
            href={job.url}
            rel="noreferrer"
            target="_blank"
          >
            Open posting
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <FollowCompanyButton
            companyId={job.company_id}
            companyName={job.companies?.name ?? "this company"}
            isActive={isFollowingCompany}
            onToggled={onFollowCompanyToggled}
            userId={userId}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-5">
        <section aria-labelledby="track-heading" className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="track-heading" className="text-sm font-semibold">Track this job</h2>
            {!current ? <span className="text-xs text-muted-foreground">Pick a status to add it to your tracker</span> : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TRACKER_COLUMNS.map((column) => {
              const on = current === column.status;
              return (
                <Button
                  aria-pressed={on}
                  className="rounded-full"
                  key={column.status}
                  size="sm"
                  variant={on ? "default" : "outline"}
                  onClick={() => onTrack(column.status)}
                >
                  {column.label}
                </Button>
              );
            })}
          </div>
        </section>
        <section aria-labelledby="desc-heading" className="space-y-2">
          <h2 id="desc-heading" className="text-sm font-semibold">About the role</h2>
          <p className="max-h-[55vh] overflow-y-auto whitespace-pre-line text-sm leading-6 text-foreground/80">
            {job.description || "No description was provided. Open the posting to read more."}
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
