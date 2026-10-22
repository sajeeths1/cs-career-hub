import type { LearningResource, RankedSkill, Skill, SkillOverview } from "@/lib/types";
export type { LearningGoal, LearningResource, RankedSkill, Skill, SkillDemand, SkillOverview } from "@/lib/types";

/** Present persisted demand; extraction and aggregation belong to the worker/database. */
export function rankSkills(overview: SkillOverview, skills: Skill[], knownIds: readonly number[]): RankedSkill[] {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const known = new Set(knownIds);
  return overview.skills.flatMap((row) => {
    const skill = byId.get(row.skill_id);
    return skill && row.count > 0 ? [{ ...row, skill, known: known.has(skill.id) }] : [];
  }).sort((a, b) => b.count - a.count || a.skill.name.localeCompare(b.skill.name));
}

export function resourcesFor(skillId: number, resources: LearningResource[]) {
  return resources.filter((resource) => resource.skill_id === skillId && externalUrl(resource.url));
}

export function goalFor(skill: Skill, resources: LearningResource[]) {
  return resourcesFor(skill.id, resources)[0]?.suggested_goal ??
    `Learn the fundamentals of ${skill.name} and build a small project using it.`;
}

export function externalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
