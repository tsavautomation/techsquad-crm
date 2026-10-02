"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { deliver, queueEmail } from "@/lib/engine/email";
import { checklistKeys } from "@/lib/permissions/checklist";
import { recordsDb } from "@/lib/records/data";
import type { ActionResult } from "@/lib/records/record-actions";
import { adminDb } from "@/lib/supabase/admin";

// Users (PLAN M12, permissions per person since SPEC §9.1 P1):
//   site.admin.add_new_member  invite people        site.admin.members  edit names / deactivate
//   administrators (profiles.is_admin) set what each person may do; the database policy enforces the same.
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
});

export async function inviteUserAction(input: z.input<typeof InviteInput>): Promise<ActionResult & LinkResult & { userId?: string }> {
  const me = await requireUser();
  if (!me.permissions.has("site.admin.add_new_member")) return DENIED;
  const parsed = InviteInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { email, firstName, lastName } = parsed.data;

  const db = await recordsDb();
  const { data: existing } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (existing) return { ok: false, message: "Someone with that email already has a login." };

  const { data, error } = await adminDb().auth.admin.generateLink({ type: "invite", email, options: { data: { first_name: firstName, last_name: lastName } } });
  if (error) return { ok: false, message: error.message };
  const userId = data.user.id;
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

const PermissionsInput = z.object({ isAdmin: z.boolean(), keys: z.array(z.string().max(120)).max(500) });

/**
 * Replace what a person may do (SPEC §9.1 P1): the administrator flag and the full list of keys.
 * Administrators only; the database enforces the same. Keys outside the checklist are ignored.
 */
export async function savePermissionsAction(userId: string, input: z.input<typeof PermissionsInput>): Promise<ActionResult> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can change permissions." };
  const parsed = PermissionsInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  if (userId === me.id && !parsed.data.isAdmin) return { ok: false, message: "You can't stop being an administrator yourself. Ask another administrator." };
  const allowed = checklistKeys();
  const want = new Set(parsed.data.keys.filter((k) => allowed.has(k)));

  const db = await recordsDb();
  const { data: current, error: cErr } = await db.from("user_permissions").select("permission_key").eq("user_id", userId);
  if (cErr) return { ok: false, message: cErr.message };
  const have = new Set((current ?? []).map((r) => r.permission_key));
  const add = [...want].filter((k) => !have.has(k));
  const remove = [...have].filter((k) => !want.has(k));

  const { data: prof, error: pErr } = await db.from("profiles").update({ is_admin: parsed.data.isAdmin }).eq("id", userId).select("id");
  if (pErr) return { ok: false, message: pErr.message };
  if (!prof?.length) return { ok: false, message: "User not found." };
  if (add.length) {
    const { error } = await db.from("user_permissions").insert(add.map((permission_key) => ({ user_id: userId, permission_key })));
    if (error) return { ok: false, message: error.message };
  }
  if (remove.length) {
    const { error } = await db.from("user_permissions").delete().eq("user_id", userId).in("permission_key", remove);
    if (error) return { ok: false, message: error.message };
  }
  revalidatePath("/admin/users");
  revalidatePath("/", "layout"); // menus depend on permissions
  return { ok: true };
}
