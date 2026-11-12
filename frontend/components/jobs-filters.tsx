"use client";

import { useId, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { JobLocationFilter } from "@/components/job-location-filter";
import { Button } from "@/components/ui/button";
import { POSTED_DATE_FILTERS, type PostedDateFilter } from "@/lib/job-filters";
import { WORK_MODE_LABELS, type WorkMode } from "@/lib/types";

export function JobsFilters({ search, onClearSearch, workMode, onClearWorkMode, postedDate, onPostedDate,
  minimumMatch, onMinimumMatch, locations, onLocations, onClear,
}: {
  search: string; onClearSearch: () => void; workMode: "all" | WorkMode; onClearWorkMode: () => void;
  postedDate: PostedDateFilter; onPostedDate: (value: PostedDateFilter) => void;
  minimumMatch: number; onMinimumMatch: (value: number) => void;
  locations: string[]; onLocations: (value: string[]) => void; onClear: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draftKey, setDraftKey] = useState(0);
  const chips = [
    ...(search.trim() ? [{ key: "search", label: `Search: ${search.trim()}`, remove: onClearSearch }] : []),
    ...(workMode !== "all" ? [{ key: "mode", label: WORK_MODE_LABELS[workMode], remove: onClearWorkMode }] : []),
    ...(postedDate !== "any" ? [{ key: "date", label: POSTED_DATE_FILTERS.find((date) => date.value === postedDate)!.label, remove: () => onPostedDate("any") }] : []),
    ...(minimumMatch ? [{ key: "match", label: `${minimumMatch}%+ skill match`, remove: () => onMinimumMatch(0) }] : []),
    ...locations.map((location) => ({ key: `location-${location}`, label: location, remove: () => onLocations(locations.filter((value) => value !== location)) })),
  ];
  return <div className="grid gap-3 border-t pt-3">
    <div className="flex items-center justify-between gap-2">
      <Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />Filters{chips.length ? ` (${chips.length})` : ""}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </Button>
      {chips.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => { onClear(); setDraftKey((value) => value + 1); }}>Clear all</Button>}
    </div>
    <div id={id} hidden={!open}>
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3">
        <label className="grid min-w-0 gap-1 text-xs font-medium">Date posted
          <select className="h-10 min-w-0 rounded-md border bg-card px-2 text-sm" value={postedDate} onChange={(event) => onPostedDate(event.target.value as PostedDateFilter)}>
            {POSTED_DATE_FILTERS.map((date) => <option key={date.value} value={date.value}>{date.label}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium">Skill match
          <select className="h-10 min-w-0 rounded-md border bg-card px-2 text-sm" value={minimumMatch} onChange={(event) => onMinimumMatch(Number(event.target.value))}>
            <option value={0}>Any match</option><option value={50}>50% or more</option>
            <option value={75}>75% or more</option><option value={100}>All recorded skills</option>
          </select>
        </label>
        <div className="col-span-2"><JobLocationFilter key={draftKey} locations={locations} onChange={onLocations} showChips={false} /></div>
      </div>
    </div>
    {chips.length > 0 && <ul aria-label="Active job filters" className="flex flex-wrap gap-1.5">
      {chips.map((chip) => <li key={chip.key}>
        <button type="button" aria-label={`Remove filter ${chip.label}`} title={`Remove ${chip.label}`} onClick={chip.remove}
          className="flex max-w-full items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-1 pl-2.5 pr-1.5 text-xs text-blue-800 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2">
          <span className="max-w-52 truncate">{chip.label}</span><X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
      </li>)}
    </ul>}
  </div>;
}
