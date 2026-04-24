// Service-role Supabase client. Bypasses RLS. Only use from Edge Functions that
// have already verified the caller and are writing on behalf of a specific user.
//
// Never log the service-role key. Never return its output directly to the
// client without scoping the SQL query to the caller's identity.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.93.2";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
