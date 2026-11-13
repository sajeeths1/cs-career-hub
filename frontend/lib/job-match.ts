/** Skill coverage: how many of the skills a posting mentions are in the student's skills.
 * Not the planned 70/15/15 score, which needs required/optional skill labels. */
export type JobMatch = { matched: number; total: number; percent: number };
export type MatchFilter = "any" | "50" | "75";

export const MATCH_FILTERS: { value: MatchFilter; label: string }[] = [
  { value: "any", label: "Any match" },
  { value: "50", label: "50% or higher" },
  { value: "75", label: "75% or higher" },
];

/** Null means no score is possible: the posting has no tags or the student has no skills. */
export function matchScore(jobSkillIds: readonly number[], userSkillIds: readonly number[]): JobMatch | null {
  const required = new Set(jobSkillIds);
  const known = new Set(userSkillIds);
  if (!required.size || !known.size) return null;
  const matched = [...required].filter((id) => known.has(id)).length;
  return { matched, total: required.size, percent: Math.round((matched / required.size) * 100) };
}

export function matchesScoreFilter(match: JobMatch | null, filter: MatchFilter): boolean {
  if (filter === "any") return true;
  return match !== null && match.percent >= Number(filter);
}

export function formatMatch(match: JobMatch | null): string {
  return match ? `${match.percent}% (${match.matched}/${match.total})` : "Pending";
}

/** Mean percent across the postings that can be scored; null when none can. */
export function averagePercent(matches: readonly (JobMatch | null)[]): number | null {
  const scored = matches.filter((match): match is JobMatch => match !== null);
  if (!scored.length) return null;
  return Math.round(scored.reduce((sum, match) => sum + match.percent, 0) / scored.length);
}

/** Colour band for a score: strong 70+, fair 50-69, low below 50. */
export function matchTone(percent: number): "strong" | "fair" | "low" {
  if (percent >= 70) return "strong";
  if (percent >= 50) return "fair";
  return "low";
}
