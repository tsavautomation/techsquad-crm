import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { ensureFieldSettings } from "@/lib/admin/field-settings";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  permissions: ReadonlySet<string>;
  /** Member of the active System Administrators group (bypasses every permission check). */
  isSysadmin: boolean;
};

type SessionState = { status: "signed-out" } | { status: "inactive" } | { status: "active"; user: CurrentUser };

/**
 * The signed-in user with their permission keys. Cached for the duration of a
 * request, so layouts and pages can call it freely.
 */
export const getSession = cache(async (): Promise<SessionState> => {
  // Every page and server action passes here, so Form settings are current before any form is built.
  await ensureFieldSettings();
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return { status: "signed-out" };

  const [{ data: profile }, { data: permissions, error }, { data: sysadmin }] = await Promise.all([
    supabase.from("profiles").select("email, first_name, last_name, active").eq("id", userId).maybeSingle(),
    supabase.rpc("my_permissions"),
    supabase.from("group_members").select("group_id, groups!inner(slug, active)").eq("user_id", userId).eq("groups.slug", "system_administrators").eq("groups.active", true),
  ]);
  if (error) throw new Error(`Could not load permissions: ${error.message}`);
  if (!profile?.active) return { status: "inactive" };

  return {
    status: "active",
    user: {
      id: userId,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      permissions: new Set((permissions as string[] | null) ?? []),
      isSysadmin: Boolean(sysadmin?.length),
    },
  };
});

/** The active signed-in user, or a redirect to /login (signed out) or /auth/inactive (deactivated). */
export async function requireUser(): Promise<CurrentUser> {
  const session = await getSession();
  if (session.status === "signed-out") redirect("/login");
  if (session.status === "inactive") redirect("/auth/inactive");
  return session.user;
}
