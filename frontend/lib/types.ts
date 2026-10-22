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
  jobs: Pick<Job, "id" | "title" | "url" | "location" | "posted_at" | "work_mode" | "companies"> | null;
};

export type Profile = {
  id: string;
  full_name: string | null;
  major: string | null;
  preferred_location: string | null;
  target_roles: string | null;
};

/** Visible tracker statuses, in order. Legacy not_applied rows appear as Saved. */
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
