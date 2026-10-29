"use client";

import { TrackerCard } from "@/components/tracker/tracker-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyText } from "@/components/ui/empty-states";
import { Input } from "@/components/ui/input";
import { WORK_MODE_FILTERS, type WorkModeFilter } from "@/lib/filters";
import { TRACKER_COLUMNS, type Application, type ApplicationStatus } from "@/lib/types";

export function TrackerView({
  title, description, rows, total, view, search, onSearch, workMode, onWorkMode,
  status, onStatus, sort, onSort, busyJobId, onChange, onOpen, onRemove,
}: {
  title: string;
  description: string;
  rows: Application[];
  total: number;
  view: "saved" | "applications";
  search: string;
  onSearch: (value: string) => void;
  workMode: WorkModeFilter;
  onWorkMode: (value: WorkModeFilter) => void;
  status: string;
  onStatus: (value: string) => void;
  sort: string;
  onSort: (value: string) => void;
  busyJobId: number | null;
  onChange: (jobId: number, status: ApplicationStatus) => void;
  onOpen: (jobId: number) => void;
  onRemove: (applicationId: number, jobId: number) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <label className="grid min-w-[180px] flex-1 gap-1 text-xs font-medium">
            Keyword or company
            <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search tracked jobs" />
          </label>
          {view === "applications" ? (
            <label className="grid gap-1 text-xs font-medium">
              Status
              <select aria-label="Filter by status" className="h-10 rounded-md border bg-card px-3 text-sm" value={status} onChange={(event) => onStatus(event.target.value)}>
                <option value="all">All statuses</option>
                {TRACKER_COLUMNS.filter((column) => column.status !== "saved").map((column) => (
                  <option key={column.status} value={column.status}>{column.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="grid gap-1 text-xs font-medium">
            Work mode
            <select aria-label="Filter by work mode" className="h-10 rounded-md border bg-card px-3 text-sm" value={workMode} onChange={(event) => onWorkMode(event.target.value as WorkModeFilter)}>
              {WORK_MODE_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
            </select>
          </label>
          <Button variant="ghost" size="sm" onClick={() => { onSearch(""); onStatus("all"); onWorkMode("all"); }}>Clear filters</Button>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="font-medium">{rows.length} of {total} {view === "saved" ? "saved jobs" : "applications"}</p>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Sort</span>
          <select aria-label="Sort tracked jobs" className="h-9 rounded-md border bg-card px-2" value={sort} onChange={(event) => onSort(event.target.value)}>
            <option value="recent">Recently updated</option>
            <option value="title">Job title</option>
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <Card><CardContent className="p-8"><EmptyText text={total === 0
          ? view === "saved" ? "No saved jobs yet. Save a posting from Jobs to see it here." : "No applications yet. Change a job's status to Applied to see it here."
          : "No tracked jobs match these filters."} /></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((app) => (
            <TrackerCard
              app={app}
              key={app.id}
              busy={busyJobId === app.job_id}
              onChange={(nextStatus) => onChange(app.job_id, nextStatus)}
              onOpen={() => onOpen(app.job_id)}
              onRemove={() => onRemove(app.id, app.job_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
