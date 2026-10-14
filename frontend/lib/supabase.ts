import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// These come from frontend/.env.local (see .env.local.example).
// The anon key is safe in the browser: row-level security limits what it can do.
// NEVER put the service_role key here.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** null when the .env.local values are missing, so the page can show a setup message. */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;
