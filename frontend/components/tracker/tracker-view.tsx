"use client";

import { Search } from "lucide-react";
import { TrackerCard } from "@/components/tracker/tracker-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyText } from "@/components/ui/empty-states";
import { Input } from "@/components/ui/input";
import { WORK_MODE_FILTERS, type WorkModeFilter } from "@/lib/filters";
import { formatPosted, normalizeStatus } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TRACKER_COLUMNS, WORK_MODE_LABELS, type Application, type ApplicationStatus } from "@/lib/types";

export type TrackerLayout = "board" | "list";

/** Colored dot for each status column. */
export const STATUS_DOT: Record<string, string> = {
  saved: "bg-slate-500",
  applied: "bg-primary",
  interviewing: "bg-orange-700",
  offer: "bg-foreground",
  rejected: "bg-slate-400",
};

/** The Tracker screen: every tracked job, as a board of status columns or as a list. */
export function TrackerView({
  applications, layout, onLayout, status, onStatus, search, onSearch, workMode, onWorkMode,
  sort, onSort, busyJobId, onChange, onOpen, onRemove,
}: {
  applications: Application[];
  layout: TrackerLayout;
  onLayout: (layout: TrackerLayout) => void;
  /** "all" or one ApplicationStatus */
  status: string;
  onStatus: (value: string) => void;
  search: string;
  onSearch: (value: string) => void;
  workMode: WorkModeFilter;
  onWorkMode: (value: WorkModeFilter) => void;
  sort: string;
  onSort: (value: string) => void;
  busyJobId: number | null;
  onChange: (jobId: number, status: ApplicationStatus) => void;
  onOpen: (jobId: number) => void;
  onRemove: (applicationId: number, jobId: number) => void;
}) {
  const term = search.trim().toLowerCase();
  const matches = applications
    .filter((app) => {
      if (workMode !== "all" && app.jobs?.work_mode !== workMode) return false;
      const job = app.jobs;
      return !term || `${job?.title ?? ""} ${job?.companies?.name ?? ""} ${job?.location ?? ""}`.toLowerCase().includes(term);
    })
    .sort((a, b) => sort === "title"
      ? (a.jobs?.title ?? "").localeCompare(b.jobs?.title ?? "")
      : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const countFor = (value: string) => value === "all"
    ? applications.length
    : applications.filter((app) => normalizeStatus(app.status) === value).length;
  const columns = TRACKER_COLUMNS.filter((column) => status === "all" || column.status === status);
  const rows = matches.filter((app) => status === "all" || normalizeStatus(app.status) === status);
  const confirmRemove = (app: Application) => {
    if (window.confirm("Remove this job from your tracker?")) onRemove(app.id, app.job_id);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tracker</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">Saved jobs and applications in one place. Change a card&apos;s status from its menu.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input aria-label="Search tracked jobs" className="w-56 pl-9" placeholder="Search company or role" value={search} onChange={(event) => onSearch(event.target.value)} />
          </div>
          <select aria-label="Filter by work mode" className="h-10 rounded-lg border border-input bg-card px-3 text-sm" value={workMode} onChange={(event) => onWorkMode(event.target.value as WorkModeFilter)}>
            {WORK_MODE_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.value === "all" ? "Any work mode" : filter.label}</option>)}
          </select>
          <div role="group" aria-label="Layout" className="flex gap-1.5">
            {(["board", "list"] as const).map((value) => (
              <Button
                aria-pressed={layout === value}
                className="rounded-full"
                key={value}
                size="sm"
                variant={layout === value ? "default" : "outline"}
                onClick={() => onLayout(value)}
              >
                {value === "board" ? "Board" : "List"}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1 border-b">
        {[{ status: "all", label: "All" }, ...TRACKER_COLUMNS].map((tab) => {
          const on = tab.status === status;
          return (
            <button
              aria-selected={on}
              className={cn(
                "-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3.5 text-sm transition-colors",
                on ? "border-primary font-semibold text-primary" : "border-transparent font-medium text-foreground/80 hover:text-foreground",
              )}
              key={tab.status}
              role="tab"
              type="button"
              onClick={() => onStatus(tab.status)}
            >
              {tab.label}
              <span className={cn("rounded-full px-2 py-px text-xs font-semibold", on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/80")}>
                {countFor(tab.status)}
              </span>
            </button>
          );
        })}
      </div>

      {applications.length === 0 ? (
        <Card className="p-8"><EmptyText text="Nothing tracked yet. Save a posting from Jobs to see it here." /></Card>
      ) : layout === "board" ? (
        <div className="overflow-x-auto pb-2">
          <div
            className="grid gap-3.5"
            style={status === "all"
              ? { gridTemplateColumns: "repeat(5, minmax(220px, 1fr))", minWidth: 1100 }
              : { gridTemplateColumns: "minmax(0, 520px)" }}
          >
            {columns.map((column) => {
              const items = matches.filter((app) => normalizeStatus(app.status) === column.status);
              return (
                <section aria-label={column.label} className="flex min-h-[420px] flex-col gap-2.5 rounded-xl bg-muted p-3" key={column.status}>
                  <div className="flex items-center justify-between px-1">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[column.status])} aria-hidden="true" />
                      {column.label}
                    </h2>
                    <span className="text-[13px] font-semibold text-muted-foreground">{items.length}</span>
                  </div>
                  {items.map((app) => (
                    <TrackerCard
                      app={app}
                      busy={busyJobId === app.job_id}
                      key={app.id}
                      onChange={(next) => onChange(app.job_id, next)}
                      onOpen={() => onOpen(app.job_id)}
                      onRemove={() => confirmRemove(app)}
                    />
                  ))}
                  {items.length === 0 ? <p className="px-1 py-4 text-center text-xs text-muted-foreground">{term || workMode !== "all" ? "No matches" : "Empty"}</p> : null}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-end gap-2 border-b px-4 py-2 text-sm">
            <span className="text-muted-foreground">Sort</span>
            <select aria-label="Sort tracked jobs" className="h-8 rounded-md border border-input bg-card px-2" value={sort} onChange={(event) => onSort(event.target.value)}>
              <option value="recent">Recently updated</option>
              <option value="title">Job title</option>
            </select>
          </div>
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60 text-left text-xs font-semibold text-muted-foreground">
                <th scope="col" className="px-4 py-3">Company</th>
                <th scope="col" className="px-4 py-3">Role</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Last update</th>
                <th scope="col" className="px-4 py-3">Location</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((app) => {
                const busy = busyJobId === app.job_id;
                return (
                  <tr className="border-t" key={app.id}>
                    <td className="px-4 py-3 font-semibold">{app.jobs?.companies?.name ?? "Unknown company"}</td>
                    <td className="px-4 py-3">
                      <button className="text-left font-medium hover:underline" type="button" onClick={() => onOpen(app.job_id)}>
                        {app.jobs?.title ?? "Job no longer listed"}
                      </button>
                      <div className="mt-0.5 text-xs text-muted-foreground">{WORK_MODE_LABELS[app.jobs?.work_mode ?? "unknown"]} · {formatPosted(app.jobs?.posted_at ?? null)}</div>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        aria-label={`Status for ${app.jobs?.title ?? "tracked job"}`}
                        className="h-9 rounded-lg border border-input bg-card px-2 text-[13px] font-medium"
                        disabled={busy}
                        value={normalizeStatus(app.status)}
                        onChange={(event) => onChange(app.job_id, event.target.value as ApplicationStatus)}
                      >
                        {TRACKER_COLUMNS.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(app.updated_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-muted-foreground">{app.jobs?.location ?? "Location not listed"}</td>
                    <td className="px-4 py-3 text-right">
                      <Button disabled={busy} size="sm" variant="ghost" onClick={() => confirmRemove(app)}>Remove</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? <EmptyText text="No tracked jobs match these filters." /> : null}
        </Card>
      )}
    </div>
  );
}
