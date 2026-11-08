import { Button } from "@/components/ui/button";
import type { JobSkillMatch } from "@/lib/job-skill-match";

export type SkillMatchState = "loading" | "error" | "empty" | "ready";

export function SkillMatchBadge({ match, state }: { match: JobSkillMatch; state: SkillMatchState }) {
  const label = state === "loading" ? "Loading skill match…"
    : state === "error" ? "Skill match unavailable"
    : !match.total ? "Job skills not available"
    : state === "empty" ? "Add your skills to see a match"
    : `${match.percent}% skill match · ${match.matched.length}/${match.total}`;
  return <span className="inline-flex w-fit rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">{label}</span>;
}

export function JobSkillBreakdown({ match, state, onEditSkills, onRetry }: {
  match: JobSkillMatch; state: SkillMatchState; onEditSkills: () => void; onRetry: () => void;
}) {
  return <section aria-label="Your skill match" className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold">Your skill match</h2>
      <Button size="sm" variant="outline" onClick={onEditSkills}>Manage my skills</Button>
    </div>
    {state === "loading" ? <p role="status" className="text-sm">Loading your saved skills…</p>
      : state === "error" ? <div role="alert" className="space-y-2 text-sm"><p>Could not load your skills. Your match is unavailable.</p><Button size="sm" variant="outline" onClick={onRetry}>Retry skills</Button></div>
      : !match.total ? <p className="text-sm text-muted-foreground">No skills have been recorded for this posting yet. Read the full posting for requirements.</p>
      : <>
        {state === "empty" ? <p className="text-sm">Add skills manually or review skills from your resume in the Skills tab to see your match.</p>
          : <div className="space-y-2">
            <p className="text-sm"><strong>{match.matched.length} of {match.total}</strong> recorded job skills match your saved skills ({match.percent}%).</p>
            <div role="progressbar" aria-label="Recorded skills matched" aria-valuemin={0} aria-valuemax={match.total} aria-valuenow={match.matched.length}
              className="h-2 overflow-hidden rounded-full bg-blue-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${match.percent}%` }} />
            </div>
          </div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div><h3 className="mb-2 text-xs font-semibold text-emerald-800">Matched skills · {match.matched.length}</h3>
            <ul className="flex flex-wrap gap-2">{match.matched.map((skill) => <li key={skill.id} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">{skill.name}</li>)}</ul>
            {!match.matched.length && <p className="text-xs text-muted-foreground">No saved skill matches yet.</p>}
          </div>
          <div><h3 className="mb-2 text-xs font-semibold text-amber-900">Not in your saved skills · {match.missing.length}</h3>
            <ul className="flex flex-wrap gap-2">{match.missing.map((skill) => <li key={skill.id} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">{skill.name}</li>)}</ul>
            {!match.missing.length && <p className="text-xs text-muted-foreground">You have saved all the recorded skills.</p>}
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Skill match = matched skills ÷ recorded job skills. Each skill counts equally. Recorded skills can include optional mentions; this is not a hiring probability or a complete assessment of your qualifications.</p>
      </>}
  </section>;
}
