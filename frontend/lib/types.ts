// Shapes of the rows we read from Supabase. Names match the SQL columns exactly.

export type WorkMode = "remote" | "hybrid" | "in_person" | "unknown";

export type ApplicationStatus =
  | "saved"
  | "not_applied"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected";

export type Job = {
  id: number;
  title: string;
  location: string | null;
  url: string;
  posted_at: string | null;
  description: string | null;
  work_mode: WorkMode;
  companies: { name: string } | null;
};

export type Application = {
  id: number;
  job_id: number;
  status: ApplicationStatus;
  updated_at: string;
  jobs: Pick<Job, "id" | "title" | "url" | "location" | "companies"> | null;
};

export type Profile = {
  id: string;
  full_name: string | null;
  major: string | null;
  preferred_location: string | null;
  target_roles: string | null;
  school?: string | null;
  grad_year?: number | null;
};

/** Tracker columns, in order. not_applied is treated like "saved" in the UI. */
export const TRACKER_COLUMNS: { status: ApplicationStatus; label: string }[] = [
  { status: "saved", label: "Saved" },
  { status: "applied", label: "Applied" },
  { status: "interviewing", label: "Interviewing" },
  { status: "offer", label: "Offer" },
  { status: "rejected", label: "Rejected" },
];

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  in_person: "In person",
  unknown: "Not listed",
};

// Skill-development tables and the read-only reporting RPC.
export type Skill = { id: number; name: string };
export type LearningGoal = { skill_id: number; status: "planned" | "in_progress" | "completed" };
export type LearningResource = {
  skill_id: number; title: string; url: string; suggested_goal: string;
};
export type SkillDemand = {
  skill_id: number; count: number; recent_count: number; previous_count: number;
  examples: { id: number; title: string; url: string; company_name: string }[];
};
export type SkillOverview = {
  total_open_jobs: number; matching_jobs: number; analyzed_jobs: number; skills: SkillDemand[];
};
export type RankedSkill = SkillDemand & { skill: Skill; known: boolean };
