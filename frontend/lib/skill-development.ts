// A small, curated starting catalog. Matching is deliberately explainable;
// mentioning a skill in a posting does not prove that it is a requirement.
export const learningCatalog = [
  { name: "Python", aliases: ["python"], url: "https://docs.python.org/3/tutorial/", resource: "Python tutorial", goal: "Complete the Python tutorial and build a command-line tool." },
  { name: "React", aliases: ["react", "reactjs", "react.js"], url: "https://react.dev/learn", resource: "Learn React", goal: "Complete React Quick Start and build an interactive app with shared state." },
  { name: "SQL", aliases: ["sql", "postgresql", "postgres", "mysql"], url: "https://www.postgresql.org/docs/current/tutorial.html", resource: "PostgreSQL tutorial", goal: "Complete the SQL tutorial and write queries using joins and aggregates." },
  { name: "JavaScript", aliases: ["javascript", "js", "node.js", "nodejs"], url: "https://developer.mozilla.org/en-US/docs/Learn_web_development", resource: "MDN web development", goal: "Complete the JavaScript modules and build an app that fetches and displays data." },
  { name: "HTML", aliases: ["html", "html5"], url: "https://developer.mozilla.org/en-US/docs/Learn_web_development", resource: "MDN web development", goal: "Complete the HTML modules and build a semantic page with an accessible form." },
  { name: "CSS", aliases: ["css", "css3"], url: "https://developer.mozilla.org/en-US/docs/Learn_web_development", resource: "MDN web development", goal: "Complete the CSS modules and build a responsive layout with Grid and Flexbox." },
] as const;

export type Skill = { id: number; name: string };
export type LearningGoal = { skill_id: number; status: "planned" | "in_progress" | "completed" };
type Posting = { id: number; title: string; description: string | null };
export type Gap = { skill: Skill; count: number; learning: (typeof learningCatalog)[number] | undefined };

export function learningFor(name: string) {
  const normalized = name.trim().toLowerCase();
  return learningCatalog.find((entry) => entry.name.toLowerCase() === normalized ||
    (entry.aliases as readonly string[]).includes(normalized));
}

function mentions(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9_])${escaped}(?=$|[^a-z0-9_])`, "i").test(text);
}

/** One vote per job and skill; known skills never appear as gaps. */
export function findSkillGaps(
  jobs: Posting[], skills: Skill[], knownIds: readonly number[],
  extracted: { job_id: number; skill_id: number }[] = [],
): Gap[] {
  const knownNames = new Set(skills.filter((s) => knownIds.includes(s.id))
    .map((s) => learningFor(s.name)?.name.toLowerCase() ?? s.name.trim().toLowerCase()));
  const jobIdsBySkill = new Map<number, Set<number>>();
  for (const row of extracted) {
    const ids = jobIdsBySkill.get(row.skill_id) ?? new Set<number>();
    ids.add(row.job_id);
    jobIdsBySkill.set(row.skill_id, ids);
  }
  const groups = new Map<string, Skill[]>();
  for (const skill of skills) {
    const key = learningFor(skill.name)?.name.toLowerCase() ?? skill.name.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), skill]);
  }
  return [...groups.entries()].flatMap(([normalized, group]) => {
    const skill = group[0];
    const learning = learningFor(skill.name);
    if (knownNames.has(normalized)) return [];
    const aliases = learning?.aliases ?? [skill.name];
    const count = new Set(jobs.filter((job) => group.some((s) => jobIdsBySkill.get(s.id)?.has(job.id)) ||
      aliases.some((alias) => mentions(`${job.title} ${job.description ?? ""}`, alias)))
      .map((job) => job.id)).size;
    return count ? [{ skill, count, learning }] : [];
  }).sort((a, b) => b.count - a.count || a.skill.name.localeCompare(b.skill.name));
}
