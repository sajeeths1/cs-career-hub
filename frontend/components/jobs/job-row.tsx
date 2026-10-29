"use client";

import { Bookmark, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPosted, statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
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
      className={cn(
        "grid gap-3 rounded-xl border bg-card px-4 py-3 transition-colors sm:grid-cols-[1fr_auto] sm:items-center",
        selected ? "border-primary bg-primary/5" : "hover:border-input",
      )}
    >
      <button className="min-w-0 text-left" type="button" onClick={onOpen}>
        <h3 className="truncate text-[15px] font-semibold hover:underline">{job.title}</h3>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {job.companies?.name ?? "Unknown company"} · {job.location ?? "Location not listed"}
        </p>
        {compact ? (
          <p className="mt-1 text-xs text-muted-foreground">{formatPosted(job.posted_at)}</p>
        ) : (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Badge>{WORK_MODE_LABELS[job.work_mode] ?? "Not listed"}</Badge>
            <Badge>{formatPosted(job.posted_at)}</Badge>
          </div>
        )}
      </button>
      <div className="flex items-center gap-2">
        {status ? (
          <Badge className="bg-emerald-50 text-emerald-700">
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
