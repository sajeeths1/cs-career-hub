import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function reply(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Delete only the verified caller's account. This key must stay on the server. */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !adminKey) return reply("Account deletion is not configured. Ask the project administrator to configure the server key.", 503);
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return reply("Sign in before deleting your account.", 401);
  let body: unknown;
  try { body = await request.json(); } catch { return reply("Type DELETE to confirm.", 400); }
  if (!body || typeof body !== "object" || !("confirmation" in body) || body.confirmation !== "DELETE") {
    return reply("Type DELETE to confirm.", 400);
  }

  const verifier = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: authError } = await verifier.auth.getUser(token);
  if (authError || !data.user) return reply("Your session expired. Sign in again.", 401);
  const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const failed = () => reply("Could not delete your account. Please contact the project administrator.", 500);
  // Resume files and text are personal data, so they go first and a failure stops the
  // deletion. Files are found from both rows and the folder, so none are left behind.
  const userId = data.user.id;
  const storage = admin.storage.from("resumes");
  const rows = await admin.from("resumes").select("storage_path, has_file").eq("user_id", userId);
  if (rows.error) return failed();
  const paths = new Set<string>((rows.data ?? []).filter((row: { has_file?: boolean }) => row.has_file !== false)
    .map((row: { storage_path: string }) => row.storage_path)
    .filter((path: string) => !path.startsWith("not-stored/")));
  for (let offset = 0; ; offset += 1000) {
    const folder = await storage.list(userId, { limit: 1000, offset });
    if (folder.error) return failed();
    for (const file of folder.data ?? []) paths.add(`${userId}/${file.name}`);
    if ((folder.data?.length ?? 0) < 1000) break;
  }
  const files = [...paths];
  for (let offset = 0; offset < files.length; offset += 1000) {
    if ((await storage.remove(files.slice(offset, offset + 1000))).error) return failed();
  }
  if ((await admin.from("resumes").delete().eq("user_id", userId)).error) return failed();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return failed();
  return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
