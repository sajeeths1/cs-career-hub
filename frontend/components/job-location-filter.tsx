"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeLocation } from "@/lib/job-filters";

export function JobLocationFilter({ locations, onChange }: {
  locations: string[]; onChange: (locations: string[]) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  function add() {
    const value = draft.trim();
    if (!normalizeLocation(value)) return;
    if (!locations.some((location) => normalizeLocation(location) === normalizeLocation(value))) {
      onChange([...locations, value]);
    }
    setDraft("");
  }
  return <div className="grid w-full gap-2">
    <label htmlFor={id} className="text-xs font-medium">Locations</label>
    <div className="flex gap-2">
      <Input id={id} value={draft} placeholder="e.g. Raleigh, NC" maxLength={100}
        aria-describedby={`${id}-help`} onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
      <Button type="button" variant="outline" disabled={!normalizeLocation(draft)} onClick={add}>Add</Button>
    </div>
    <p id={`${id}-help`} className="text-xs font-normal text-muted-foreground">
      {locations.length ? "Matches any added location by name." : "Anywhere. Add one or more cities, states, or countries."}
    </p>
    {locations.length > 0 && <ul aria-label="Selected locations" className="flex flex-wrap gap-2">
      {locations.map((location) => <li key={location} className="flex max-w-full items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-1 pl-3 pr-1 text-xs text-blue-800">
        <span className="break-words">{location}</span>
        <button type="button" className="shrink-0 rounded-full p-1.5 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2"
          aria-label={`Remove location ${location}`} onClick={() => onChange(locations.filter((value) => value !== location))}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </li>)}
    </ul>}
  </div>;
}
