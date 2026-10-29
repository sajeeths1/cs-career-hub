"use client";

import { Bookmark, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPosted, statusLabel } from "@/lib/format";
import { WORK_MODE_LABELS, type ApplicationStatus, type Job } from "@/lib/types";

export function JobRow({
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
