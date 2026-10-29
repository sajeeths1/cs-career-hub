"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchSkillDevelopment, saveLearningGoal, setKnownSkill } from "@/lib/data";
import { externalUrl, goalFor, rankSkills, resourcesFor, type LearningGoal, type LearningResource, type Skill } from "@/lib/skill-development";
import type { Job } from "@/lib/types";

type SkillData = Awaited<ReturnType<typeof fetchSkillDevelopment>>;

export function SkillDevelopment({ userId, jobs, jobsLoading }: {
  userId: string; jobs: Job[]; jobsLoading: boolean;
}) {
  const [data, setData] = useState<SkillData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("");
  const [appliedRole, setAppliedRole] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [goalFilter, setGoalFilter] = useState("all");
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
    void mutate(() => setKnownSkill(userId, skill.id, known), (current) => ({ ...current,
      knownIds: known ? [...new Set([...current.knownIds, skill.id])] : current.knownIds.filter((id) => id !== skill.id),
    }));
  }

  function goalStatus(skillId: number, status: LearningGoal["status"] | null) {
    void mutate(() => saveLearningGoal(userId, skillId, status), (current) => ({ ...current,
      goals: [...current.goals.filter((goal) => goal.skill_id !== skillId),
        ...(status ? [{ skill_id: skillId, status }] : [])],
    }));
  }

  return <div className="grid min-w-0 grid-cols-1 gap-6">
    <Card>
      <CardHeader>
        <CardTitle>Skill development</CardTitle>
        <CardDescription>Build a learning plan around the skills in real job postings.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && <div role="alert" className="grid gap-2 text-sm text-red-600">
          <p>Could not load or save skill development: {error}</p>
          <Button variant="outline" disabled={busy || loading} onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
        </div>}
        {(loading || jobsLoading) && <p role="status" className="text-sm text-muted-foreground">Loading skills and job postings…</p>}
        {busy && <p role="status" className="text-sm text-muted-foreground">Saving changes…</p>}
        {data && <fieldset disabled={busy || loading} className="grid min-w-0 gap-3">
          <legend className="mb-3 text-sm font-semibold">My skills · {data.knownIds.length} selected</legend>
          <Input aria-label="Find a skill" placeholder="Find a skill" value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
            {data.skills.filter((skill) => skill.name.toLowerCase().includes(skillSearch.trim().toLowerCase())).map((skill) =>
              <label key={skill.id} className="flex min-h-9 items-center gap-2.5 text-sm">
                <input className="h-4 w-4 accent-primary" type="checkbox" checked={data.knownIds.includes(skill.id)} onChange={(event) => toggleSkill(skill, event.target.checked)} />{skill.name}
              </label>)}
          </div>
          {!data.skills.some((skill) => skill.name.toLowerCase().includes(skillSearch.trim().toLowerCase())) &&
            <p className="text-sm text-muted-foreground">No skills match this search.</p>}
        </fieldset>}
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
          <CardTitle>Skill demand</CardTitle>
          <CardDescription>
            {data.overview.analyzed_jobs} of {data.overview.matching_jobs} matching jobs analyzed across {data.overview.total_open_jobs} open postings.
            {appliedRole && ` Focus: “${appliedRole}”.`} Counts use saved skill mentions; a mention may not be a requirement.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!data.overview.matching_jobs ? <p className="text-sm text-muted-foreground">No matching postings. Try another title or refresh the job list.</p>
            : !data.overview.analyzed_jobs ? <p className="text-sm text-muted-foreground">These postings have not been analyzed yet. Skill demand and recommendations will appear after the next skills update.</p>
              : !demand.length ? <p className="text-sm text-muted-foreground">No catalog skills were identified in the analyzed postings yet.</p>
                : <>
                  {data.overview.analyzed_jobs < data.overview.matching_jobs && <p className="text-sm text-muted-foreground">Analysis is still in progress. Counts reflect the postings analyzed so far.</p>}
                  {demand.map((row) => <div key={row.skill_id} className="grid gap-2">
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="font-medium">{row.skill.name}{row.known ? " · In your skills" : ""}</span>
                      <span>{row.count} jobs · {Math.round(row.count / Math.max(1, data.overview.analyzed_jobs) * 100)}% of analyzed jobs</span>
                    </div>
                    <div role="meter" aria-label={`${row.skill.name} demand`} aria-valuemin={0} aria-valuemax={data.overview.analyzed_jobs} aria-valuenow={row.count} className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${row.count / Math.max(1, data.overview.analyzed_jobs) * 100}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">Posted in the past 30 days: {row.recent_count} · Prior 30 days: {row.previous_count}</p>
                  </div>)}
                  <p className="text-xs text-muted-foreground">Date comparisons include currently open postings only, using their posted dates. They are not a historical measure of the whole job market.</p>
                </>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Suggested skills and goals</CardTitle>
          <CardDescription>Missing skills ranked by how many analyzed postings mention them. Choose a goal and follow the learning material at your own pace.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!data.overview.analyzed_jobs ? <p className="text-sm text-muted-foreground">Recommendations need analyzed postings.</p>
            : !gaps.length ? <p className="text-sm text-muted-foreground">No gaps found among the analyzed skills. Try another title or check back when more jobs are analyzed.</p>
              : gaps.map(({ skill, count, examples }) => <article key={skill.id} className="grid gap-3 rounded-lg border p-4">
                <h3 className="font-semibold">{skill.name}</h3>
                <p className="text-sm text-muted-foreground">Mentioned in {count} analyzed postings.</p>
                <p className="text-sm">{goalFor(skill, data.resources)}</p>
                <ResourceLinks skillId={skill.id} resources={data.resources} />
                {!!examples.length && <details className="text-sm">
                  <summary className="cursor-pointer font-medium">Example postings for {skill.name}</summary>
                  <ul className="mt-2 grid gap-2 pl-4">
                    {examples.filter((job) => externalUrl(job.url)).map((job) => <li key={job.id}>
                      <a href={externalUrl(job.url)!} target="_blank" rel="noopener noreferrer" className="text-primary underline">{job.title} · {job.company_name} ↗</a>
                    </li>)}
                  </ul>
                </details>}
                <div><Button variant="outline" disabled={busy || data.goals.some((goal) => goal.skill_id === skill.id)} onClick={() => goalStatus(skill.id, "planned")}>
                  {data.goals.some((goal) => goal.skill_id === skill.id) ? "Goal saved" : "Add learning goal"}
                </Button></div>
              </article>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>My learning goals</CardTitle>
          <CardDescription>{completed} of {data.goals.length} goals completed. Update My skills when you feel confident using a skill.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="flex flex-wrap items-center gap-2 text-sm">Filter goals
            <select className="h-9 rounded-lg border border-input bg-card px-2 text-sm" value={goalFilter} onChange={(event) => setGoalFilter(event.target.value)}>
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
                  <select aria-label={`Progress for ${skill.name}`} className="h-9 rounded-lg border border-input bg-card px-2 text-sm" value={goal.status} disabled={busy}
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
