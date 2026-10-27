/** Title matching is an explainable preference filter, not an AI match score. */
export const ROLE_JOB_PAGE_SIZE = 200;

export function normalizeRoleText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\bc\+\+/g, "cplusplus")
    .replace(/\bc#/g, "csharp")
    .replace(/\bfront[\s-]*end\b/g, "frontend")
    .replace(/\bback[\s-]*end\b/g, "backend")
    .replace(/\bfull[\s-]*stack\b/g, "fullstack")
    .replace(/\b(machine[\s-]*learning|ml)\b/g, "machinelearning")
    .replace(/\b(artificial[\s-]*intelligence|ai)\b/g, "artificialintelligence")
    .replace(/\b(swe|sde)\b/g, "software engineer")
    .replace(/\b(engineers|engineering|developers?|development)\b/g, "engineer")
    .replace(/\b(scientists|science)\b/g, "scientist")
    .replace(/\banalysts\b/g, "analyst")
    .replace(/\b(interns|internships?)\b/g, "intern")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return [...new Set(normalizeRoleText(value).split(" ").filter((word) => word && !["role", "roles", "position", "positions"].includes(word)))];
}

export function parseTargetRoles(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  return (value ?? "").split(/[,;\n]+/).map((role) => role.trim()).filter((role) => {
    const key = tokens(role).sort().join(" ");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function matchesTargetRoles(title: string, roles: readonly string[]): boolean {
  const words = new Set(normalizeRoleText(title).split(" "));
  return roles.some((role) => {
    const required = tokens(role);
    return required.length > 0 && required.every((word) => words.has(word));
  });
}

const TITLE_PATTERNS: Record<string, string[]> = {
  frontend: ["front%end"], backend: ["back%end"], fullstack: ["full%stack"],
  machinelearning: ["machine%learning", "ml"],
  artificialintelligence: ["artificial%intelligence", "ai"],
  software: ["software", "swe", "sde"], engineer: ["engineer", "develop", "swe", "sde"],
  scientist: ["scien"], intern: ["intern"], analyst: ["analyst"],
  cplusplus: ["c++", "cpp"], csharp: ["c#"],
};

/** Build a broad database candidate filter. Only normalized alphanumeric tokens
 * and our own wildcard patterns enter PostgREST grammar; final matching below
 * rejects substring false positives such as Java in JavaScript. */
export function targetRolesQuery(roles: readonly string[]): string | null {
  const filters = roles.flatMap((role) => {
    const groups = tokens(role).map((token) => {
      const alternatives = (TITLE_PATTERNS[token] ?? [token]).map((pattern) => `title.ilike.%${pattern}%`);
      return alternatives.length === 1 ? alternatives[0] : `or(${alternatives.join(",")})`;
    });
    return groups.length ? [groups.length === 1 ? groups[0] : `and(${groups.join(",")})`] : [];
  });
  return filters.length ? filters.join(",") : null;
}

/** Scan candidates beyond the general feed's 300-row cap, preserving newest-first
 * order and deduplicating IDs when postings change between page requests. */
export async function collectRoleMatches<T extends { id: number; title: string }>(
  roles: readonly string[], loadPage: (offset: number, pageSize: number) => Promise<T[]>, limit = 300,
): Promise<T[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 300) throw new Error("Job limit must be between 1 and 300.");
  if (!targetRolesQuery(roles)) return [];
  const result: T[] = [], seen = new Set<number>();
  for (let offset = 0; ; offset += ROLE_JOB_PAGE_SIZE) {
    const page = await loadPage(offset, ROLE_JOB_PAGE_SIZE);
    for (const job of page) {
      if (!seen.has(job.id) && matchesTargetRoles(job.title, roles)) {
        seen.add(job.id); result.push(job);
        if (result.length === limit) return result;
      }
    }
    if (page.length < ROLE_JOB_PAGE_SIZE) return result;
  }
}
