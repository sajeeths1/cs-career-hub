import type { Job, Skill } from "./types";

export type JobSkillMatch = {
  matched: Skill[];
  missing: Skill[];
  total: number;
  percent: number | null;
};

/** Equal-weight coverage of recorded skills, not a hiring probability or role score. */
export function getJobSkillMatch(job: Pick<Job, "job_skills">, knownIds: readonly number[] | null): JobSkillMatch {
  const skills = new Map<number, Skill>();
  for (const row of job.job_skills ?? []) {
    if (row.skills && row.skills.id === row.skill_id && row.skills.name.trim()) {
      skills.set(row.skill_id, row.skills);
    }
  }
  const ordered = [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
  const known = new Set(knownIds ?? []);
  const matched = ordered.filter((skill) => known.has(skill.id));
  const missing = ordered.filter((skill) => !known.has(skill.id));
  // A missing/empty profile is an invitation to add skills, not evidence of no ability.
  const percent = ordered.length && knownIds?.length
    ? Math.round(matched.length / ordered.length * 100)
    : null;
  return { matched, missing, total: ordered.length, percent };
}

export function meetsSkillMinimum(match: JobSkillMatch, minimum: number): boolean {
  // Compare the raw ratio: a rounded 50% from 49.5% must not pass the 50% filter.
  return minimum === 0 || (match.percent !== null && match.matched.length * 100 >= minimum * match.total);
}
