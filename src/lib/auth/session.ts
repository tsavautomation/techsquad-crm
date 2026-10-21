import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { ensureFieldSettings } from "@/lib/admin/field-settings";
import { createClient } from "@/lib/supabase/server";
import { isLang, type Lang } from "@/i18n/core";
import { paletteOr } from "@/lib/palettes";

export type CurrentUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** Language of this person's screens (their choice in the account menu). */
  language: Lang;
  /** UI-m: brand colours chosen under the profile icon (a palette id from src/lib/palettes.ts). */
  palette: string;
  permissions: ReadonlySet<string>;
  /** Administrator (profiles.is_admin): bypasses every permission check and may edit permissions. */
  isSysadmin: boolean;
  /** F27: push notification events an administrator turned on for this login. */
  pushEvents: ReadonlySet<string>;
  /** F6: set for a customer-portal login (the Contact it belongs to); null for staff. */
  contactId: number | null;
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
    supabase.from("profiles").select("email, first_name, last_name, active, language, palette, is_admin, contact_id, push_events").eq("id", userId).maybeSingle(),
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
      palette: paletteOr(profile.palette),
      permissions: new Set((permissions as string[] | null) ?? []),
      isSysadmin: Boolean(profile.is_admin),
      pushEvents: new Set((profile.push_events as string[] | null) ?? []),
      contactId: profile.contact_id ?? null,
    },
  };
});

/**
 * The active signed-in staff member, or a redirect to /login (signed out) or /auth/inactive (deactivated).
 * A customer-portal login (F6) is sent to /portal: it has no place in the staff app.
 */
export async function requireUser(): Promise<CurrentUser> {
  const session = await getSession();
  if (session.status === "signed-out") redirect("/login");
  if (session.status === "inactive") redirect("/auth/inactive");
  if (session.user.contactId) redirect("/portal");
  return session.user;
}
