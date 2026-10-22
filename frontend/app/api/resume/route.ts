import { createClient } from "@supabase/supabase-js";
import { MAX_RESUME_BYTES, resumeSkills } from "@/lib/resume";
import { ResumeWorkerError, runResumeWorker } from "@/lib/server/resume-worker";

export const runtime = "nodejs";
export const maxDuration = 120;
const activeUsers = new Set<string>();

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return reply({ error: "Supabase is not configured." }, 503);
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return reply({ error: "Sign in before parsing a resume." }, 401);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  let userId: string;
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return reply({ error: "Your session expired. Sign in again." }, 401);
    userId = data.user.id;
  } catch { return reply({ error: "Could not verify your session. Please retry." }, 503); }
  if (activeUsers.has(userId) || activeUsers.size >= 2) return reply({ error: "The resume parser is busy. Please try again shortly." }, 429);
  if (Number(request.headers.get("content-length")) > MAX_RESUME_BYTES) return reply({ error: "Resume files must be at most 5 MB." }, 413);
  if (!request.body) return reply({ error: "Choose a resume to parse." }, 400);
  activeUsers.add(userId);
  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    // Bound actual streamed bytes as well as Content-Length.
    let uploadTimedOut = false;
    const uploadTimer = setTimeout(() => { uploadTimedOut = true; void reader.cancel().catch(() => {}); }, 20_000);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESUME_BYTES) {
          await reader.cancel();
          return reply({ error: "Resume files must be at most 5 MB." }, 413);
        }
        chunks.push(value);
      }
    } finally { clearTimeout(uploadTimer); reader.releaseLock(); }
    if (uploadTimedOut) return reply({ error: "Resume upload timed out. Please retry." }, 408);
    if (request.signal.aborted) return reply({ error: "Resume parsing cancelled." }, 499);
    const parsed = await runResumeWorker(Buffer.concat(chunks), request.signal);
    const warnings: string[] = [];
    // Catalog reads use the student's token and existing RLS, never the service key.
    async function readAll(table: string, columns: string, order: string) {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client.from(table).select(columns).order(order).range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < 500) return rows;
      }
    }
    let skills: { id: number; name: string }[] = [];
    try {
      const [catalog, aliases] = await Promise.all([readAll("skills", "id,name", "id"), readAll("skill_aliases", "skill_id,alias", "alias")]);
      skills = resumeSkills(parsed.text, catalog as unknown as typeof skills, aliases as unknown as { skill_id: number; alias: string }[]);
    } catch { warnings.push("Skill suggestions could not be loaded. Your extracted resume details are still available."); }
    return reply({ ...parsed, skills, warnings });
  } catch (error) {
    return error instanceof ResumeWorkerError
      ? reply({ error: error.message }, error.status)
      : reply({ error: "Resume parsing failed. Please try again." }, 500);
  } finally { activeUsers.delete(userId); }
}
