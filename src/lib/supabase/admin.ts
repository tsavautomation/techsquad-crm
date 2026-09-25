import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * Service-role client for engines only (automations, scheduled jobs). It bypasses
 * row-level security — never use it for work done on behalf of a signed-in user,
 * and never import it into client components.
 */
export function adminDb(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set: automations cannot run");
  return createClient(supabaseEnv().url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const hasAdminKey = () => Boolean(process.env.SUPABASE_SECRET_KEY);
