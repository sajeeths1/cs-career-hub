// Every read/write the website does against Supabase lives here,
// so the page components stay simple and the backend team can review it in one place.
import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus, Job, Profile } from "@/lib/types";

function db() {
  if (!supabase) throw new Error("Supabase is not configured. Check frontend/.env.local.");
  return supabase;
}

const JOB_COLUMNS =
  "id, title, location, url, posted_at, description, work_mode, companies(name)";

/** Newest open jobs, with each company's name (follows jobs.company_id -> companies). */
export async function fetchOpenJobs(limit = 300): Promise<Job[]> {
  const { data, error } = await db()
    .from("jobs")
    .select(JOB_COLUMNS)
    .eq("is_open", true)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as Job[];
}

/** The signed-in student's tracked jobs. RLS only returns their own rows. */
export async function fetchApplications(): Promise<Application[]> {
  const { data, error } = await db()
    .from("applications")
    .select("id, job_id, status, updated_at, jobs(id, title, url, location, companies(name))")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Application[];
}

/** Add a job to the tracker, or change its status if it's already there. */
export async function setApplicationStatus(
  userId: string,
  jobId: number,
  status: ApplicationStatus,
): Promise<void> {
  const { error } = await db()
    .from("applications")
    .upsert(
      { user_id: userId, job_id: jobId, status, updated_at: new Date().toISOString() },
      { onConflict: "user_id,job_id" },
    );
  if (error) throw error;
}

export async function removeApplication(applicationId: number): Promise<void> {
  const { error } = await db().from("applications").delete().eq("id", applicationId);
  if (error) throw error;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await db()
    .from("profiles")
    .select("id, full_name, major, preferred_location, target_roles")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function saveProfile(
  userId: string,
  values: Omit<Profile, "id">,
): Promise<void> {
  const { error } = await db().from("profiles").update(values).eq("id", userId);
  if (error) throw error;
}
