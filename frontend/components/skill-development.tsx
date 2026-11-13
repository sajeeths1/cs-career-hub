"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ResumeUpload } from "@/components/resume-upload";
import { SkillsMultiSelect } from "@/components/skills-multi-select";
import { addKnownSkill, fetchSkillDevelopment, saveLearningGoal, setKnownSkill } from "@/lib/data";
import type { ParsedResume, ResumeDraft } from "@/lib/resume";
import { externalUrl, goalFor, rankSkills, resourcesFor, type LearningGoal, type LearningResource, type Skill } from "@/lib/skill-development";
import type { Job } from "@/lib/types";

type SkillData = Awaited<ReturnType<typeof fetchSkillDevelopment>>;

const DEMAND_PREVIEW = 8;

export function SkillDevelopment({ userId, jobs, jobsLoading, resumeResult, onResumeResult, onProfileDraft, onSkillsChanged }: {
  userId: string; jobs: Job[]; jobsLoading: boolean;
  resumeResult: ParsedResume | null; onResumeResult: (result: ParsedResume | null) => void;
  onProfileDraft: (draft: ResumeDraft) => void;
  onSkillsChanged?: () => void;
}) {
  const [data, setData] = useState<SkillData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("");
  const [appliedRole, setAppliedRole] = useState("");
  const [goalFilter, setGoalFilter] = useState("all");
  const [showAllDemand, setShowAllDemand] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchSkillDevelopment(userId, appliedRole)
      .then((next) => { if (active) setData(next); })
      .catch((err: Error) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Reload the all-jobs report whenever the dashboard refreshes its jobs.
  }, [userId, jobs, appliedRole, attempt]);

  const demand = useMemo(() => data ? rankSkills(data.overview, data.skills, data.knownIds) : [], [data]);
  const gaps = demand.filter((row) => !row.known);
  const completed = data?.goals.filter((goal) => goal.status === "completed").length ?? 0;

  const mutate = useCallback(async (write: () => Promise<void>, update: (current: SkillData) => SkillData) => {
    setBusy(true);
    setError(null);
    try {
      await write();
      setData((current) => current ? update(current) : current);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }, []);

  function toggleSkill(skill: Skill, known: boolean) {
    void mutate(async () => { await setKnownSkill(userId, skill.id, known); onSkillsChanged?.(); }, (current) => ({ ...current,
      knownIds: known ? [...new Set([...current.knownIds, skill.id])] : current.knownIds.filter((id) => id !== skill.id),
    }));
  }

  async function createSkill(name: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const skill = await addKnownSkill(name);
      setData((current) => current ? {
        ...current,
        skills: [...current.skills.filter((row) => row.id !== skill.id), skill].sort((a, b) => a.name.localeCompare(b.name)),
        knownIds: [...new Set([...current.knownIds, skill.id])],
      } : current);
      onSkillsChanged?.();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally { setBusy(false); }
  }

  function goalStatus(skillId: number, status: LearningGoal["status"] | null) {
    void mutate(() => saveLearningGoal(userId, skillId, status), (current) => ({ ...current,
      goals: [...current.goals.filter((goal) => goal.skill_id !== skillId),
        ...(status ? [{ skill_id: skillId, status }] : [])],
    }));
  }

  return <div className="grid min-w-0 grid-cols-1 gap-6">
    <div><h2 className="text-2xl font-semibold">Skill development</h2>
      <p className="mt-1 text-sm text-muted-foreground">Build a learning plan around the skills in real job postings.</p>
    </div>
    <ResumeUpload compact result={resumeResult} onResult={onResumeResult}
      onProfileDraft={onProfileDraft} onSkillsSaved={() => { setAttempt((n) => n + 1); onSkillsChanged?.(); }} />
    <Card>
      <CardHeader>
        <CardTitle>My skills</CardTitle>
        <CardDescription>Select skills you know or review suggestions from your resume above.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && <div role="alert" className="grid gap-2 text-sm text-red-600">
          <p>Could not load or save skill development: {error}</p>
          <Button variant="outline" disabled={busy || loading} onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
        </div>}
        {(loading || jobsLoading) && <p role="status" className="text-sm text-muted-foreground">Loading skills and job postings…</p>}
        {busy && <p role="status" className="text-sm text-muted-foreground">Saving changes…</p>}
        {data && <SkillsMultiSelect skills={data.skills} knownIds={data.knownIds} disabled={busy || loading} onToggle={toggleSkill} onCreate={createSkill} />}
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); setAppliedRole(role.trim()); }}>
          <label className="grid gap-2 text-sm font-medium">Focus on a job title (optional)
            <Input value={role} onChange={(event) => setRole(event.target.value)} placeholder="For example, frontend or data" maxLength={150} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={loading || busy}>Apply focus</Button>
            {appliedRole && <Button type="button" variant="ghost" disabled={loading || busy} onClick={() => { setRole(""); setAppliedRole(""); }}>Show all jobs</Button>}
          </div>
        </form>
      </CardContent>
    </Card>
    {data && !loading && !jobsLoading && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Matching open jobs", data.overview.matching_jobs],
          ["Jobs analyzed", data.overview.analyzed_jobs],
          ["Goals completed", `${completed} / ${data.goals.length}`],
        ].map(([label, value]) => <Card key={label}><CardContent className="p-5">
          <p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p>
        </CardContent></Card>)}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Skill demand and suggestions</CardTitle>
          <CardDescription>
            {data.overview.analyzed_jobs} of {data.overview.matching_jobs} matching jobs analyzed across {data.overview.total_open_jobs} open postings.
            {appliedRole && ` Focus: “${appliedRole}”.`} Open a skill you don’t have yet to see learning material and add a goal.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!data.overview.matching_jobs ? <p className="text-sm text-muted-foreground">No matching postings. Try another title or refresh the job list.</p>
            : !data.overview.analyzed_jobs ? <p className="text-sm text-muted-foreground">These postings have not been analyzed yet. Skill demand and recommendations will appear after the next skills update.</p>
              : !demand.length ? <p className="text-sm text-muted-foreground">No catalog skills were identified in the analyzed postings yet.</p>
                : <>
                  {data.overview.analyzed_jobs < data.overview.matching_jobs && <p className="text-sm text-muted-foreground">Analysis is still in progress. Counts reflect the postings analyzed so far.</p>}
                  {!gaps.length && <p className="text-sm text-muted-foreground">You already have every skill found in these postings. Try another title or check back when more jobs are analyzed.</p>}
                  <ul className="grid gap-1">
                    {(showAllDemand ? demand : demand.slice(0, DEMAND_PREVIEW)).map((row) => {
                      const pct = row.count / Math.max(1, data.overview.analyzed_jobs) * 100;
                      const hasGoal = data.goals.some((goal) => goal.skill_id === row.skill_id);
                      const bar = <>
                        <span className="truncate font-medium">{row.skill.name}{row.known && <span className="text-muted-foreground"> ✓</span>}</span>
                        <div role="meter" aria-label={`${row.skill.name} demand`} aria-valuemin={0} aria-valuemax={data.overview.analyzed_jobs} aria-valuenow={row.count} className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">{row.count} · {Math.round(pct)}%</span>
                      </>;
                      const rowClass = "grid grid-cols-[minmax(0,9rem)_1fr_auto_1rem] items-center gap-3 rounded-md px-2 py-1.5 text-sm";
                      const trend = `Posted in the past 30 days: ${row.recent_count} · Prior 30 days: ${row.previous_count}`;
                      if (row.known) return <li key={row.skill_id} className={rowClass} title={trend}>{bar}<span /></li>;
                      return <li key={row.skill_id}>
                        <details className="group">
                          <summary className={`${rowClass} cursor-pointer list-none hover:bg-muted [&::-webkit-details-marker]:hidden`} title={trend}>
                            {bar}<span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
                          </summary>
                          <div className="mx-2 mb-2 mt-1 grid gap-3 rounded-lg border p-4">
                            <p className="text-sm">{goalFor(row.skill, data.resources)}</p>
                            <ResourceLinks skillId={row.skill_id} resources={data.resources} />
                            {!!row.examples.length && <details className="text-sm">
                              <summary className="cursor-pointer font-medium">Example postings for {row.skill.name}</summary>
                              <ul className="mt-2 grid gap-2 pl-4">
                                {row.examples.filter((job) => externalUrl(job.url)).map((job) => <li key={job.id}>
                                  <a href={externalUrl(job.url)!} target="_blank" rel="noopener noreferrer" className="text-primary underline">{job.title} · {job.company_name} ↗</a>
                                </li>)}
                              </ul>
                            </details>}
                            <p className="text-xs text-muted-foreground">{trend}</p>
                            <div><Button variant="outline" size="sm" disabled={busy || hasGoal} onClick={() => goalStatus(row.skill_id, "planned")}>
                              {hasGoal ? "Goal saved" : "Add learning goal"}
                            </Button></div>
                          </div>
                        </details>
                      </li>;
                    })}
                  </ul>
                  {demand.length > DEMAND_PREVIEW && <div>
                    <Button variant="ghost" size="sm" onClick={() => setShowAllDemand((v) => !v)}>
                      {showAllDemand ? "Show fewer" : `Show all ${demand.length} skills`}
                    </Button>
                  </div>}
                  <p className="text-xs text-muted-foreground">✓ = in your skills. Counts use saved skill mentions; a mention may not be a requirement. 30-day trends cover currently open postings only.</p>
                </>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>My learning goals</CardTitle>
          <CardDescription>{completed} of {data.goals.length} goals completed. Update My skills when you feel confident using a skill.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="flex flex-wrap items-center gap-2 text-sm">Filter goals
            <select className="rounded-md border bg-background p-2" value={goalFilter} onChange={(event) => setGoalFilter(event.target.value)}>
              <option value="all">All goals</option><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="completed">Completed</option>
            </select>
          </label>
          {!data.goals.length && <p className="text-sm text-muted-foreground">Save a suggested goal to start your learning plan.</p>}
          {!!data.goals.length && !data.goals.some((goal) => goalFilter === "all" || goal.status === goalFilter) && <p className="text-sm text-muted-foreground">No goals with this progress status.</p>}
          {data.goals.filter((goal) => goalFilter === "all" || goal.status === goalFilter).map((goal) => {
            const skill = data.skills.find((s) => s.id === goal.skill_id);
            if (!skill) return null;
            return <article key={goal.skill_id} className="grid gap-3 rounded-lg border p-4">
              <h3 className="font-semibold">{skill.name}</h3><p className="text-sm">{goalFor(skill, data.resources)}</p>
              <ResourceLinks skillId={skill.id} resources={data.resources} />
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">Progress
                  <select aria-label={`Progress for ${skill.name}`} className="rounded-md border bg-background p-2" value={goal.status} disabled={busy}
                    onChange={(event) => goalStatus(goal.skill_id, event.target.value as LearningGoal["status"])}>
                    <option value="planned">Planned</option><option value="in_progress">In progress</option><option value="completed">Completed</option>
                  </select>
                </label>
                <Button variant="ghost" disabled={busy} onClick={() => goalStatus(skill.id, null)}>Remove goal</Button>
              </div>
            </article>;
          })}
        </CardContent>
      </Card>
    </>}
  </div>;
}

function ResourceLinks({ skillId, resources }: { skillId: number; resources: LearningResource[] }) {
  const links = resourcesFor(skillId, resources);
  return links.length ? <ul className="grid gap-2 text-sm">
    {links.map((resource) => <li key={resource.url}><a href={externalUrl(resource.url)!} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">{resource.title} ↗</a></li>)}
  </ul> : <p className="text-sm text-muted-foreground">A learning resource has not been curated for this skill yet.</p>;
}
