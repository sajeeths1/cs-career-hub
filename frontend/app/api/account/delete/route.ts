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
  const { error } = await admin.auth.admin.deleteUser(data.user.id);
  if (error) return reply("Could not delete your account. Please contact the project administrator.", 500);
  return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
