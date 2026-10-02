import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { ensureFieldSettings } from "@/lib/admin/field-settings";
import { createClient } from "@/lib/supabase/server";
import { isLang, type Lang } from "@/i18n/core";

export type CurrentUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** Language of this person's screens (their choice in the account menu). */
  language: Lang;
  permissions: ReadonlySet<string>;
  /** Administrator (profiles.is_admin): bypasses every permission check and may edit permissions. */
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

  const [{ data: profile }, { data: permissions, error }] = await Promise.all([
    supabase.from("profiles").select("email, first_name, last_name, active, language, is_admin").eq("id", userId).maybeSingle(),
    supabase.rpc("my_permissions"),
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
      language: isLang(profile.language) ? profile.language : "en",
      permissions: new Set((permissions as string[] | null) ?? []),
      isSysadmin: Boolean(profile.is_admin),
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
