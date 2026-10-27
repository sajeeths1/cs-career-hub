import type { Skill } from "./types";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export type ResumeDraft = { full_name: string; major: string; school: string };
export type ParsedResume = {
  text: string;
  details: ResumeDraft & { email: string; phone: string; links: string[]; sections: Record<string, string> };
  metadata: { pages: number | null; ocr_pages: number };
  skills: Skill[];
  warnings: string[];
};

/** Match the live canonical catalog, with the same word boundaries as the job worker. */
export function resumeSkills(text: string, skills: Skill[], aliases: { skill_id: number; alias: string }[]): Skill[] {
  const names = new Map(skills.map(skill => [skill.id, [skill.name]]));
  for (const row of aliases) names.get(row.skill_id)?.push(row.alias);
  return skills.filter(skill => names.get(skill.id)!.some(name => {
    if (!name.trim()) return false;
    const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}_+#])${escaped}(?![\\p{L}\\p{N}_+#])`, "iu").test(text);
  }));
}
