import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_RESUME_BYTES } from "@/lib/resume";

export const RESUME_LIBRARY_BUCKET = "resumes";
export const RESUME_LIBRARY_COLUMNS = "id, name, original_filename, storage_path, mime_type, file_size_bytes, created_at:uploaded_at, is_default, has_file";
export type StoredResume = {
  id: string; name: string; original_filename: string; storage_path: string;
  mime_type: string; file_size_bytes: number; created_at: string; is_default: boolean; has_file: boolean;
};
export type JobResumeChoice = { job_id: number; resume_id: string };

/** Determine the storage type from bytes, independent of the browser's MIME type. */
export function resumeFileType(bytes: Uint8Array) {
  const starts = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { extension: "pdf", mime: "application/pdf" };
  if (starts(0x50, 0x4b, 0x03, 0x04)) return { extension: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { extension: "png", mime: "image/png" };
  if (starts(0xff, 0xd8, 0xff)) return { extension: "jpg", mime: "image/jpeg" };
  throw new Error("Use a PDF, DOCX, PNG or JPEG resume.");
}

export async function uploadResumeVersion(client: SupabaseClient, userId: string, file: File): Promise<StoredResume> {
  if (!file.size || file.size > MAX_RESUME_BYTES) throw new Error("Choose a nonempty resume of at most 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = resumeFileType(bytes);
  const path = `${userId}/${crypto.randomUUID()}.${type.extension}`;
  const storage = client.storage.from(RESUME_LIBRARY_BUCKET);
  const uploaded = await storage.upload(path, bytes, { contentType: type.mime, upsert: false });
  if (uploaded.error) throw uploaded.error;
  const { data, error } = await client.from("resumes").insert({
    user_id: userId, name: (file.name.replace(/\.[^.]+$/, "").trim() || "Resume").slice(0, 150),
    original_filename: file.name.slice(0, 255), storage_path: path, mime_type: type.mime, file_size_bytes: file.size,
  }).select(RESUME_LIBRARY_COLUMNS).single();
  if (error) {
    await storage.remove([path]).catch(() => {});
    throw error;
  }
  return data as StoredResume;
}
