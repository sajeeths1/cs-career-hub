"use client";

import { Button } from "@/components/ui/button";
import { formatPosted, normalizeStatus } from "@/lib/format";
import { TRACKER_COLUMNS, WORK_MODE_LABELS, type Application, type ApplicationStatus } from "@/lib/types";

export function TrackerCard({
  app,
  busy,
  onChange,
  onOpen,
  onRemove,
}: {
  app: Application;
  busy: boolean;
  onChange: (status: ApplicationStatus) => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-md border bg-card p-4 text-sm">
      <div>
        <h3 className="font-semibold">{app.jobs?.title ?? "Job no longer listed"}</h3>
        <p className="mt-1 text-muted-foreground">{app.jobs?.companies?.name ?? "Unknown company"} · {app.jobs?.location ?? "Location not listed"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{WORK_MODE_LABELS[app.jobs?.work_mode ?? "unknown"]} · {formatPosted(app.jobs?.posted_at ?? null)}</p>
      </div>
      <label className="grid gap-1 text-xs font-medium">
        Application status
        <select
          aria-label={`Status for ${app.jobs?.title ?? "tracked job"}`}
          className="h-9 rounded-md border bg-card px-2 text-sm"
          disabled={busy}
          value={normalizeStatus(app.status)}
          onChange={(event) => onChange(event.target.value as ApplicationStatus)}
        >
          {TRACKER_COLUMNS.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
        </select>
      </label>
      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">Updated {new Date(app.updated_at).toLocaleDateString()}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => {
            if (window.confirm("Remove this job from your tracker?")) onRemove();
          }}>Remove</Button>
          <Button size="sm" disabled={busy} onClick={onOpen}>View job</Button>
        </div>
      </div>
    </article>
  );
}
