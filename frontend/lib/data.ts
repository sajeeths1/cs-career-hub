// Every read/write the website does against Supabase lives here,
// so the page components stay simple and the backend team can review it in one place.
import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus, Job, Profile } from "@/lib/types";
import type { LearningGoal, LearningResource, Skill, SkillOverview } from "@/lib/skill-development";
import type { Company, NotificationRow, NotificationSettings } from "@/lib/notifications";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/notifications";
import { collectRoleMatches, targetRolesQuery } from "@/lib/job-personalization";

function db() {
  if (!supabase) throw new Error("Supabase is not configured. Check frontend/.env.local.");
  return supabase;
}

const JOB_COLUMNS =
  "id, company_id, title, location, url, posted_at, description, work_mode, companies(name)";

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

/** Match saved role preferences against titles across the database, then return
 * up to 300 newest matches. This does not depend on the general feed's limit. */
export async function fetchJobsForTargetRoles(roles: readonly string[], signal?: AbortSignal): Promise<Job[]> {
  const filter = targetRolesQuery(roles);
  if (!filter) return [];
  return collectRoleMatches(roles, async (offset, pageSize) => {
    let query = db().from("jobs").select(JOB_COLUMNS).eq("is_open", true)
      .or(filter).order("posted_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false }).range(offset, offset + pageSize - 1);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as Job[];
  });
}

/** Open a tracked job directly even when it is outside either feed or closed. */
export async function fetchJob(jobId: number): Promise<Job | null> {
  const { data, error } = await db().from("jobs").select(JOB_COLUMNS).eq("id", jobId).maybeSingle();
  if (error) throw error;
  return data as unknown as Job | null;
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
    .select("id, full_name, major, preferred_location, target_roles, school, grad_year")
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

export async function fetchSkillDevelopment(userId: string, titleFilter = "") {
  const results = await Promise.all([
    db().from("skills").select("id, name").order("name"),
    db().from("user_skills").select("skill_id").eq("user_id", userId),
    db().from("learning_goals").select("skill_id, status").eq("user_id", userId).order("skill_id"),
    db().from("learning_resources").select("skill_id, title, url, suggested_goal").order("id"),
    db().rpc("skill_development_overview", { p_title_filter: titleFilter }),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return {
    skills: (results[0].data ?? []) as unknown as Skill[],
    knownIds: ((results[1].data ?? []) as unknown as { skill_id: number }[]).map((row) => row.skill_id),
    goals: (results[2].data ?? []) as unknown as LearningGoal[],
    resources: (results[3].data ?? []) as unknown as LearningResource[],
    overview: results[4].data as unknown as SkillOverview,
  };
}

export async function setKnownSkill(userId: string, skillId: number, known: boolean) {
  const query = known
    ? db().from("user_skills").upsert({ user_id: userId, skill_id: skillId }, { onConflict: "user_id,skill_id", ignoreDuplicates: true })
    : db().from("user_skills").delete().eq("user_id", userId).eq("skill_id", skillId);
  const { error } = await query;
  if (error) throw error;
}

/** One atomic insert of explicitly approved resume skills; retain existing selections. */
export async function addResumeSkills(userId: string, skillIds: number[]) {
  if (!skillIds.length) return;
  const { error } = await db().from("user_skills").upsert(
    [...new Set(skillIds)].map(skill_id => ({ user_id: userId, skill_id })),
    { onConflict: "user_id,skill_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function parseResume(file: File, signal: AbortSignal) {
  const { data, error } = await db().auth.getSession();
  if (error || !data.session) throw new Error("Sign in before parsing a resume.");
  const response = await fetch("/api/resume", {
    method: "POST", body: file, signal,
    headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/octet-stream" },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error ?? "Could not parse your resume. Please retry.");
  return result as import("./resume").ParsedResume;
}

export async function saveLearningGoal(userId: string, skillId: number, status: LearningGoal["status"] | null) {
  const query = status === null
    ? db().from("learning_goals").delete().eq("user_id", userId).eq("skill_id", skillId)
    : db().from("learning_goals").upsert({ user_id: userId, skill_id: skillId, status });
  const { error } = await query;
  if (error) throw error;
}

/** Companies students can follow for priority job alerts (migration 003). */
export async function fetchCompanies(): Promise<Company[]> {
  const { data, error } = await db().from("companies").select("id, name").order("name");
  if (error) throw error;
  return (data ?? []) as Company[];
}

/** Default (unlimited) follow tier: digest-only notifications. */
export async function fetchFollowedCompanyIds(userId: string): Promise<number[]> {
  const { data, error } = await db().from("followed_companies").select("company_id").eq("user_id", userId);
  if (error) throw error;
  return ((data ?? []) as { company_id: number }[]).map((row) => row.company_id);
}

/** Unfollowing also drops priority status, since priority implies following. */
export async function setFollowedCompany(userId: string, companyId: number, follow: boolean): Promise<void> {
  if (follow) {
    const { error } = await db().from("followed_companies").upsert(
      { user_id: userId, company_id: companyId }, { onConflict: "user_id,company_id", ignoreDuplicates: true },
    );
    if (error) throw error;
    return;
  }
  const [followedResult, priorityResult] = await Promise.all([
    db().from("followed_companies").delete().eq("user_id", userId).eq("company_id", companyId),
    db().from("priority_companies").delete().eq("user_id", userId).eq("company_id", companyId),
  ]);
  if (followedResult.error) throw followedResult.error;
  if (priorityResult.error) throw priorityResult.error;
}

/** Priority (max 10) tier: eligible for instant email alerts. Marking a company
 * priority also follows it, since priority is an upgrade on top of following. */
export async function fetchPriorityCompanyIds(userId: string): Promise<number[]> {
  const { data, error } = await db().from("priority_companies").select("company_id").eq("user_id", userId);
  if (error) throw error;
  return ((data ?? []) as { company_id: number }[]).map((row) => row.company_id);
}

/** The database rejects a follow past the 10-company limit. */
export async function setPriorityCompany(userId: string, companyId: number, follow: boolean): Promise<void> {
  if (follow) {
    await setFollowedCompany(userId, companyId, true);
    const { error } = await db().from("priority_companies").upsert(
      { user_id: userId, company_id: companyId }, { onConflict: "user_id,company_id", ignoreDuplicates: true },
    );
    if (error) throw error;
    return;
  }
  const { error } = await db().from("priority_companies").delete().eq("user_id", userId).eq("company_id", companyId);
  if (error) throw error;
}

export async function fetchNotificationSettings(userId: string): Promise<NotificationSettings> {
  const { data, error } = await db()
    .from("notification_settings")
    .select("user_id, email_enabled, instant_priority_alerts, digest_frequency, followed_digest_frequency, target_role_digest_frequency")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as NotificationSettings | null) ?? { user_id: userId, ...DEFAULT_NOTIFICATION_SETTINGS };
}

export async function saveNotificationSettings(userId: string, values: Omit<NotificationSettings, "user_id">): Promise<void> {
  const { error } = await db().from("notification_settings").upsert({ user_id: userId, ...values });
  if (error) throw error;
}

/** The signed-in student's notification feed (new postings relevant to them). */
export async function fetchNotifications(limit = 30): Promise<NotificationRow[]> {
  const { data, error } = await db()
    .from("notifications")
    .select("id, job_id, created_at, read_at, source, jobs(title, url), companies(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as NotificationRow[];
}

export async function markNotificationsRead(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await db().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids).is("read_at", null);
  if (error) throw error;
}
