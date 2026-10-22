"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchJobSkills, fetchSkillDevelopment, saveLearningGoal, setKnownSkill } from "@/lib/data";
import { findSkillGaps, learningFor, type LearningGoal, type Skill } from "@/lib/skill-development";
import type { Job } from "@/lib/types";

type SkillData = Awaited<ReturnType<typeof fetchSkillDevelopment>>;

export function SkillDevelopment({ userId, jobs, jobsLoading }: {
  userId: string; jobs: Job[]; jobsLoading: boolean;
}) {
  const [data, setData] = useState<SkillData | null>(null);
  const [extracted, setExtracted] = useState<{ job_id: number; skill_id: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([fetchSkillDevelopment(userId), fetchJobSkills(jobs.map((job) => job.id))])
      .then(([next, links]) => {
        if (active) { setData(next); setExtracted(links); }
      })
      .catch((err: Error) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, jobs, attempt]);

  const relevantJobs = useMemo(() => jobs.filter((job) =>
    job.title.toLowerCase().includes(role.trim().toLowerCase())), [jobs, role]);
  const gaps = useMemo(() => data
    ? findSkillGaps(relevantJobs, data.skills, data.knownIds, extracted) : [],
  [relevantJobs, data, extracted]);

  const mutate = useCallback(async (write: () => Promise<void>, update: (current: SkillData) => SkillData) => {
    setBusy(true);
    setError(null);
    try {
      await write();
      setData((current) => current ? update(current) : current);
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
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

  return <div className="grid gap-6">
    <Card>
      <CardHeader>
        <CardTitle>Skill development</CardTitle>
        <CardDescription>Select skills you already have to discover gaps and plan what to learn next.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && <div role="alert" className="grid gap-2 text-sm text-red-600">
          <p>Could not load or save skill development: {error}</p>
          <Button variant="outline" disabled={busy || loading} onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
        </div>}
        {(loading || jobsLoading) && <p role="status" className="text-sm text-muted-foreground">Loading skills and job postings…</p>}
        {busy && <p role="status" className="text-sm text-muted-foreground">Saving changes…</p>}
        {data && <fieldset disabled={busy || loading} className="grid gap-3">
          <legend className="mb-3 text-sm font-semibold">My skills</legend>
          <div className="flex flex-wrap gap-4">
            {data.skills.map((skill) => <label key={skill.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={data.knownIds.includes(skill.id)}
                onChange={(event) => toggleSkill(skill, event.target.checked)} />{skill.name}
            </label>)}
          </div>
          {!data.skills.length && <p className="text-sm text-muted-foreground">No skills are available yet. Please ask the project administrator to finish skills setup.</p>}
        </fieldset>}
        <label className="grid gap-2 text-sm font-medium">Focus on a job title (optional)
          <Input value={role} onChange={(event) => setRole(event.target.value)} placeholder="For example, frontend or data" />
        </label>
      </CardContent>
    </Card>
    {data && !loading && !jobsLoading && <>
      <Card>
        <CardHeader>
          <CardTitle>Suggested skills and goals</CardTitle>
          <CardDescription>
            Based on {relevantJobs.length} of the {jobs.length} loaded open postings, ranked by how many mention each missing skill.
            Matches use skill tags and keywords in job titles and descriptions; a mention may not be a requirement.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!relevantJobs.length ? <p className="text-sm text-muted-foreground">No matching postings. Try another title or refresh the job list.</p>
            : !gaps.length ? <p className="text-sm text-muted-foreground">No gaps found among the available skills. Try another title or check back when new jobs arrive.</p>
              : gaps.map(({ skill, count, learning }) => <article key={skill.id} className="grid gap-3 rounded-lg border p-4">
                <h3 className="font-semibold">{skill.name}</h3>
                <p className="text-sm text-muted-foreground">Mentioned in {count} of {relevantJobs.length} matching postings ({Math.round(count / relevantJobs.length * 100)}%).</p>
                <p className="text-sm">{learning?.goal ?? `Learn the fundamentals of ${skill.name} and build a small project using it.`}</p>
                {learning ? <a href={learning.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary underline">{learning.resource} ↗</a>
                  : <p className="text-sm text-muted-foreground">A learning resource has not been curated for this skill yet.</p>}
                <div><Button variant="outline" disabled={busy || data.goals.some((goal) => goal.skill_id === skill.id)}
                  onClick={() => goalStatus(skill.id, "planned")}>
                  {data.goals.some((goal) => goal.skill_id === skill.id) ? "Goal saved" : "Add learning goal"}
                </Button></div>
              </article>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>My learning goals</CardTitle>
          <CardDescription>{data.goals.filter((goal) => goal.status === "completed").length} of {data.goals.length} goals completed. Update My skills when you feel confident using a skill.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!data.goals.length && <p className="text-sm text-muted-foreground">Save a suggested goal to start your learning plan.</p>}
          {data.goals.map((goal) => {
            const skill = data.skills.find((s) => s.id === goal.skill_id);
            if (!skill) return null;
            const learning = learningFor(skill.name);
            return <article key={goal.skill_id} className="grid gap-3 rounded-lg border p-4">
              <h3 className="font-semibold">{skill.name}</h3>
              <p className="text-sm">{learning?.goal ?? `Learn the fundamentals of ${skill.name} and build a small project using it.`}</p>
              {learning && <a href={learning.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">{learning.resource} ↗</a>}
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">Progress
                  <select className="rounded-md border bg-background p-2" value={goal.status} disabled={busy}
                    onChange={(event) => goalStatus(goal.skill_id, event.target.value as LearningGoal["status"])}>
                    <option value="planned">Planned</option><option value="in_progress">In progress</option><option value="completed">Completed</option>
                  </select>
                </label>
                <Button variant="ghost" disabled={busy} onClick={() => goalStatus(goal.skill_id, null)}>Remove goal</Button>
              </div>
            </article>;
          })}
        </CardContent>
      </Card>
    </>}
  </div>;
}
