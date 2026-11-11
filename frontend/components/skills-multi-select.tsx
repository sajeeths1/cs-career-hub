"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Skill } from "@/lib/skill-development";

export function SkillsMultiSelect({ skills, knownIds, disabled, onToggle, onCreate }: {
  skills: Skill[];
  knownIds: number[];
  disabled: boolean;
  onToggle: (skill: Skill, known: boolean) => void;
  onCreate: (name: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const selected = skills.filter((skill) => knownIds.includes(skill.id));
  const filtered = skills.filter((skill) => skill.name.toLowerCase().includes(search.trim().toLowerCase()));
  const newName = search.replace(/\s+/g, " ").trim();
  const canCreate = !!newName && !skills.some((skill) => skill.name.toLowerCase() === newName.toLowerCase());
  const nameTooLong = Array.from(newName).length > 100;

  async function createSkill() {
    if (disabled || !canCreate || nameTooLong) return;
    if (await onCreate(newName)) setSearch("");
  }

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return <div className="grid min-w-0 gap-3">
    <div ref={containerRef} className="relative" onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }}>
      <Button ref={triggerRef} type="button" variant="outline" className="w-full justify-between"
        aria-expanded={open} aria-controls={panelId}
        onClick={() => { setOpen(!open); if (!open) setSearch(""); }}>
        <span>{selected.length ? `Manage skills · ${selected.length} selected` : "Select your skills"}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && <div id={panelId} className="absolute inset-x-0 top-full z-20 mt-2 rounded-md border bg-card p-2 shadow-lg">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input autoFocus aria-label="Find a skill" placeholder="Search skills…" className="pl-9" value={search}
            disabled={disabled} onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); void createSkill(); }
            }} />
        </div>
        <fieldset disabled={disabled} className="mt-2 max-h-60 overflow-y-auto overscroll-contain">
          <legend className="sr-only">Select skills you know</legend>
          {filtered.map((skill) => <label key={skill.id}
            className="flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm hover:bg-muted focus-within:bg-muted">
            <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={knownIds.includes(skill.id)}
              onChange={(event) => onToggle(skill, event.target.checked)} />
            {skill.name}
          </label>)}
          {!filtered.length && <p className="px-3 py-4 text-sm text-muted-foreground">No skills match this search.</p>}
        </fieldset>
        {canCreate && <div className="mt-2 grid gap-2 border-t pt-2">
          <Button type="button" variant="ghost" className="h-auto min-h-10 w-full justify-start whitespace-normal break-words text-left"
            disabled={disabled || nameTooLong} onClick={() => void createSkill()}>
            <Plus aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>Add “{newName}”</span>
          </Button>
          <p className="px-3 text-xs text-muted-foreground">{nameTooLong ? "Use 100 characters or fewer." : "Adds this skill to your list and makes it available to everyone."}</p>
        </div>}
      </div>}
    </div>
    <div className="grid gap-2">
      <p className="text-sm font-semibold">Selected skills · {selected.length}</p>
      {selected.length ? <ul aria-label="Selected skills" className="grid max-h-60 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2">
        {selected.map((skill) => <li key={skill.id} className="flex min-w-0 items-center justify-between gap-2 rounded-md border px-3 py-1">
          <span className="min-w-0 break-words text-sm">{skill.name}</span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={disabled}
            aria-label={`Remove ${skill.name}`} onClick={() => onToggle(skill, false)}>
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </li>)}
      </ul> : <p className="text-sm text-muted-foreground">No skills selected yet. Choose skills from the dropdown above.</p>}
    </div>
  </div>;
}
