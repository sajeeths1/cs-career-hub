import { createClient } from "@supabase/supabase-js";
import { MAX_RESUME_BYTES, RESUME_FILENAME_HEADER, type ParsedResume } from "@/lib/resume";
import { ResumeWorkerError, runResumeWorker } from "@/lib/server/resume-worker";

export const runtime = "nodejs";
export const maxDuration = 120;
const activeUsers = new Set<string>();
const RESUME_BUCKET = "resumes";

/** From the bytes, as the parser does. The bucket only accepts PDF and DOCX, so images keep text only. */
function documentType(bytes: Uint8Array): { mime: string; extension?: string } {
  const startsWith = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return { mime: "application/pdf", extension: "pdf" };
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx" };
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return { mime: "image/png" };
  if (startsWith(0xff, 0xd8, 0xff)) return { mime: "image/jpeg" };
  return { mime: "application/octet-stream" };
}

/** The name comes from the browser, so it is only ever stored as plain text. */
function uploadedFilename(request: Request) {
  try {
    return decodeURIComponent(request.headers.get(RESUME_FILENAME_HEADER) ?? "").trim() || "resume";
  } catch { return "resume"; }
}

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
    const bytes = Buffer.concat(chunks);
    const parsed = await runResumeWorker(bytes, request.signal);
    const warnings: string[] = [];
    let scan: ParsedResume["scan"] = "queued";
    // Everything uses the student's token. Storage rules and the database function
    // both limit it to their own files and row, so no service key is needed here.
    const type = documentType(bytes);
    const storage = client.storage.from(RESUME_BUCKET);
    let storagePath: string | null = null;
    if (type.extension) {
      const path = `${userId}/${crypto.randomUUID()}.${type.extension}`;
      try {
        const { error } = await storage.upload(path, bytes, { contentType: type.mime, upsert: false });
        if (error) throw error;
        storagePath = path;
      } catch {
        warnings.push("We could not keep a copy of your file, but your skills will still be scanned.");
      }
    }
    try {
      const { data, error } = await client.rpc("save_uploaded_resume", {
        p_original_filename: uploadedFilename(request),
        p_storage_path: storagePath,
        p_mime_type: type.mime,
        p_file_size_bytes: size,
        p_extracted_text: parsed.text,
      });
      if (error) throw error;
      // Best effort: account deletion clears the student's folder, including anything left here.
      const replaced = (data ?? []) as string[];
      if (replaced.length) await storage.remove(replaced).catch(() => {});
    } catch {
      scan = "failed";
      warnings.push("Your resume was read, but we could not save it for the skill scan. No skills were added. Please try again.");
      if (storagePath) await storage.remove([storagePath]).catch(() => {});
    }
    return reply({ ...parsed, scan, warnings });
  } catch (error) {
    return error instanceof ResumeWorkerError
      ? reply({ error: error.message }, error.status)
      : reply({ error: "Resume parsing failed. Please try again." }, 500);
  } finally { activeUsers.delete(userId); }
}
