"use client";

import { formatPosted, normalizeStatus } from "@/lib/format";
import { TRACKER_COLUMNS, WORK_MODE_LABELS, type Application, type ApplicationStatus } from "@/lib/types";

/** One job card on the Tracker board. */
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
  const title = app.jobs?.title ?? "Job no longer listed";
  return (
    <article className="flex flex-col gap-1.5 rounded-xl border bg-card px-3.5 py-3">
      <span className="text-xs font-semibold text-muted-foreground">{app.jobs?.companies?.name ?? "Unknown company"}</span>
      <button className="text-left text-sm font-semibold leading-snug hover:underline" type="button" onClick={onOpen}>
        {title}
      </button>
      <span className="text-xs text-muted-foreground">
        {WORK_MODE_LABELS[app.jobs?.work_mode ?? "unknown"]} · {formatPosted(app.jobs?.posted_at ?? null)}
      </span>
      <div className="mt-1 flex items-center justify-between gap-2">
        <select
          aria-label={`Status for ${title}`}
          className="h-8 rounded-md border border-input bg-card px-1.5 text-xs font-medium"
          disabled={busy}
          value={normalizeStatus(app.status)}
          onChange={(event) => onChange(event.target.value as ApplicationStatus)}
        >
          {TRACKER_COLUMNS.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
        </select>
        <button className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={busy} type="button" onClick={onRemove}>
          Remove
        </button>
      </div>
      <span className="text-[11px] text-muted-foreground">Updated {new Date(app.updated_at).toLocaleDateString()}</span>
    </article>
  );
}
