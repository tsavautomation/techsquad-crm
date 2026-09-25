"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { deliver, queueEmail } from "@/lib/engine/email";
import { recordsDb } from "@/lib/records/data";
import type { ActionResult } from "@/lib/records/record-actions";
import { adminDb } from "@/lib/supabase/admin";

// Users & groups (PLAN M12). Permissions follow WebAuthor's site-admin pages (SPEC §7):
//   site.admin.add_new_member  invite people        site.admin.members  edit names / deactivate
//   site.admin.groups          groups and memberships (built-in groups: System Administrators only, see migration m12)
// Everything except creating the login and its sign-up link runs as the signed-in admin, so row-level security applies.

/** The link is returned too, so an admin can text it (in email test mode the email only reaches the test inbox). */
type LinkResult = { link?: string; emailed?: boolean };

const DENIED: ActionResult = { ok: false, message: "You don't have permission to do that." };

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://techsquad-crm.vercel.app").replace(/\/$/, "");
const confirmLink = (hashedToken: string, type: "invite" | "recovery") =>
  `${site()}/auth/confirm?token_hash=${hashedToken}&type=${type}&next=${encodeURIComponent("/auth/update-password")}`;

/** Email a sign-up / set-password link through the outbox (test mode applies). */
async function emailLink(to: string, name: string, link: string, isNew: boolean) {
  const db = adminDb();
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;color:#111827;max-width:560px">
<p>Hi ${esc(name || to)},</p>
<p>${isNew ? "You've been given a login to the TechSquad CRM." : "Here is a link to set your TechSquad CRM password."} Tap the button to choose your password. The link works once and expires in 24 hours.</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#111827;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Set my password</a></p>
<p style="color:#6b7280;font-size:13px">Then sign in at ${esc(site())} with ${esc(to)}. On iPhone, open it in Safari and use Share → Add to Home Screen.</p></div>`;
  const id = await queueEmail(db, {
    automationId: null,
    table: null,
    recordId: null,
    from: "TS CRM",
    to: [to],
    subject: isNew ? "Your TechSquad CRM login" : "Set your TechSquad CRM password",
    html,
    attachments: [],
  });
  return deliver(db, id);
}

const InviteInput = z.object({
  email: z.email().transform((s) => s.trim().toLowerCase()),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80),
  groupIds: z.array(z.number().int()),
});

export async function inviteUserAction(input: z.input<typeof InviteInput>): Promise<ActionResult & LinkResult & { userId?: string }> {
  const me = await requireUser();
  if (!me.permissions.has("site.admin.add_new_member")) return DENIED;
  const parsed = InviteInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { email, firstName, lastName, groupIds } = parsed.data;
  if (groupIds.length && !me.permissions.has("site.admin.groups")) return { ok: false, message: "You may invite people, but not choose their groups." };

  const db = await recordsDb();
  const { data: existing } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (existing) return { ok: false, message: "Someone with that email already has a login." };

  const { data, error } = await adminDb().auth.admin.generateLink({ type: "invite", email, options: { data: { first_name: firstName, last_name: lastName } } });
  if (error) return { ok: false, message: error.message };
  const userId = data.user.id;

  if (groupIds.length) {
    const { error: gErr } = await db.from("group_members").insert(groupIds.map((group_id) => ({ group_id, user_id: userId })));
    if (gErr) return { ok: false, message: `Login created, but groups could not be set: ${gErr.message}`, userId } as ActionResult & { userId: string };
  }
  const link = confirmLink(data.properties.hashed_token, "invite");
  const sent = await emailLink(email, firstName, link, true);
  revalidatePath("/admin/users");
  return { ok: true, userId, link, emailed: sent.ok };
}

/** A fresh set-password link (for someone who lost the invite or forgot their password). */
export async function sendPasswordLinkAction(userId: string): Promise<ActionResult & LinkResult> {
  const me = await requireUser();
  if (!me.permissions.has("site.admin.members")) return DENIED;
  const db = await recordsDb();
  const { data: p } = await db.from("profiles").select("email, first_name, active").eq("id", userId).maybeSingle();
  if (!p) return { ok: false, message: "User not found." };
  if (!p.active) return { ok: false, message: "This login is deactivated. Reactivate it first." };
  const { data, error } = await adminDb().auth.admin.generateLink({ type: "recovery", email: p.email });
  if (error) return { ok: false, message: error.message };
  const link = confirmLink(data.properties.hashed_token, "recovery");
  const sent = await emailLink(p.email, p.first_name ?? "", link, false);
  return { ok: true, link, emailed: sent.ok };
}

const ProfileInput = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80),
  active: z.boolean(),
});

export async function updateUserAction(userId: string, input: z.input<typeof ProfileInput>): Promise<ActionResult> {
  const me = await requireUser();
  if (!me.permissions.has("site.admin.members")) return DENIED;
  const parsed = ProfileInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  if (userId === me.id && !parsed.data.active) return { ok: false, message: "You can't deactivate your own login." };
  const db = await recordsDb();
  const { data, error } = await db
    .from("profiles")
    .update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName || null, active: parsed.data.active })
    .eq("id", userId)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return DENIED;
  // A deactivated login is signed out everywhere at once.
  if (!parsed.data.active) await adminDb().auth.admin.signOut(userId, "global").catch(() => undefined);
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Replace a person's group memberships with `groupIds`. */
export async function setUserGroupsAction(userId: string, groupIds: number[]): Promise<ActionResult> {
  const me = await requireUser();
  if (!me.permissions.has("site.admin.groups")) return DENIED;
  const db = await recordsDb();
  const { data: groups } = await db.from("groups").select("id, slug");
  const sysadmin = (groups ?? []).find((g) => g.slug === "system_administrators")?.id;
  const { data: current } = await db.from("group_members").select("group_id").eq("user_id", userId);
  const have = new Set((current ?? []).map((r) => r.group_id as number));
  const want = new Set(groupIds);
  if (userId === me.id && sysadmin && have.has(sysadmin) && !want.has(sysadmin)) return { ok: false, message: "You can't remove yourself from System Administrators." };
  const add = [...want].filter((id) => !have.has(id));
  const remove = [...have].filter((id) => !want.has(id));
  if (add.length) {
    const { error } = await db.from("group_members").insert(add.map((group_id) => ({ group_id, user_id: userId })));
    if (error) return { ok: false, message: /row-level security/.test(error.message) ? "Only System Administrators can change the built-in groups." : error.message };
  }
  if (remove.length) {
    const { data, error } = await db.from("group_members").delete().eq("user_id", userId).in("group_id", remove).select("group_id");
    if (error) return { ok: false, message: error.message };
    if ((data?.length ?? 0) < remove.length) return { ok: false, message: "Only System Administrators can change the built-in groups." };
  }
  revalidatePath("/admin/users");
  revalidatePath("/admin/groups");
  return { ok: true };
}

const GroupInput = z.object({ name: z.string().trim().min(1, "Name is required").max(60), active: z.boolean() });

export async function saveGroupAction(groupId: number | null, input: z.input<typeof GroupInput>): Promise<ActionResult & { id?: number }> {
  const me = await requireUser();
  if (!me.permissions.has("site.admin.groups")) return DENIED;
  const parsed = GroupInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const db = await recordsDb();
  const row = { name: parsed.data.name, active: parsed.data.active };
  const q = groupId
    ? db.from("groups").update(row).eq("id", groupId).select("id")
    : db.from("groups").insert({ ...row, slug: parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "group" }).select("id");
  const { data, error } = await q;
  if (error) return { ok: false, message: /duplicate/.test(error.message) ? "A group with that name already exists." : error.message };
  if (!data?.length) return { ok: false, message: "Only System Administrators can change the built-in groups." };
  revalidatePath("/admin/groups");
  return { ok: true, id: data[0].id as number };
}
