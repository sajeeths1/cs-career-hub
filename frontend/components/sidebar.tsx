"use client";

import { Briefcase, LayoutGrid, LogOut, SlidersHorizontal, SquareKanban, Target, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type SubTab = { value: string; label: string };
type NavSection = {
  key: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  /** The first tab opens when you click the section. */
  tabs: SubTab[];
};

/**
 * The five sidebar sections from the redesign.
 */
export const NAV_SECTIONS: NavSection[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutGrid, tabs: [{ value: "dashboard", label: "Dashboard" }] },
  { key: "jobs", label: "Jobs", icon: Briefcase, tabs: [{ value: "jobs", label: "Jobs" }] },
  {
    key: "tracker", label: "Tracker", icon: SquareKanban,
    tabs: [{ value: "tracker", label: "Tracker" }],
  },
  { key: "skills", label: "Skills", icon: Target, tabs: [{ value: "skills", label: "Skills" }] },
  {
    key: "personalization", label: "Personalization", hint: "Preferences & notifications", icon: SlidersHorizontal,
    tabs: [{ value: "profile", label: "Personalization" }],
  },
];

export function sectionForTab(tab: string) {
  return NAV_SECTIONS.find((section) => section.tabs.some((t) => t.value === tab)) ?? NAV_SECTIONS[0];
}

/** Left sidebar on wide screens. */
export function Sidebar({ tab, onChange, email, onSignOut }: {
  tab: string;
  onChange: (tab: string) => void;
  email: string;
  onSignOut: () => void;
}) {
  const active = sectionForTab(tab).key;
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card px-3.5 py-5 lg:flex lg:flex-col">
      <div className="mb-5 flex items-center gap-2.5 px-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">CS</div>
        <p className="text-base font-bold">Career Hub</p>
      </div>
      <nav aria-label="Main" className="space-y-1">
        {NAV_SECTIONS.map((section) => {
          const on = section.key === active;
          return (
            <button
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                on ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground",
              )}
              key={section.key}
              type="button"
              onClick={() => onChange(section.tabs[0].value)}
            >
              <section.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="flex flex-col leading-tight">
                {section.label}
                {section.hint ? <span className="text-[11px] font-normal text-muted-foreground">{section.hint}</span> : null}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto space-y-2 px-2.5">
        <p className="truncate text-xs text-muted-foreground">{email}</p>
        <button
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          type="button"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

/** Small screens: the five sections as a row of buttons (the sidebar is hidden there). */
export function MobileNav({ tab, onChange }: { tab: string; onChange: (tab: string) => void }) {
  const active = sectionForTab(tab).key;
  return (
    <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:hidden">
      {NAV_SECTIONS.map((section) => (
        <button
          aria-current={section.key === active ? "page" : undefined}
          className={cn(
            "flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium",
            section.key === active ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted",
          )}
          key={section.key}
          type="button"
          onClick={() => onChange(section.tabs[0].value)}
        >
          <section.icon className="h-4 w-4" aria-hidden="true" />
          {section.label}
        </button>
      ))}
    </nav>
  );
}
