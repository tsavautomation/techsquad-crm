"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { connectWithPassword, disconnect } from "./client";
import { fileMessage, ignoreMessage, syncMail, type SyncSummary } from "./sync";

// F26-2: Admin › Gmail intake (connect, check now, disconnect) and the Assign list on Today (assign / ignore).

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

async function sysadmin(): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can change the Gmail connection." };
  if (!hasAdminKey()) return { ok: false, message: "The server has no admin key." };
  return { ok: true, id: me.id };
}

/** Connect with the mailbox address and its Gmail app password: one IMAP sign-in proves it, then it is kept encrypted. */
export async function connectGmailAction(account: string, password: string): Promise<Result> {
  const a = await sysadmin();
  if (!a.ok) return a;
  if (!/^[^\s@]+@[^\s@]+$/.test(account.trim())) return { ok: false, message: "That is not an email address." };
  if (password.replace(/\s+/g, "").length < 12) return { ok: false, message: "The app password is 16 letters (Google shows them in four groups)." };
  try {
    await connectWithPassword(account, password, a.id);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { ok: false, message: /auth|credentials|invalid|AUTHENTICATIONFAILED/i.test(m) ? "Google refused the sign-in. Check the address, that 2-Step Verification is on, and that this is an app password (not the normal password)." : m };
  }
  revalidatePath("/admin/gmail");
  return { ok: true };
}

export async function disconnectGmailAction(): Promise<Result> {
  const a = await sysadmin();
  if (!a.ok) return a;
  await disconnect();
  revalidatePath("/admin/gmail");
  return { ok: true };
}

export async function checkMailNowAction(): Promise<Result<{ summary: SyncSummary }>> {
  const a = await sysadmin();
  if (!a.ok) return a;
  const summary = await syncMail();
  revalidatePath("/admin/gmail");
  revalidatePath("/");
  return { ok: true, summary };
}

async function office(): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  if (!canDo(me.permissions, getTable("projects"), "modify", getTable)) return { ok: false, message: "You don't have permission to do that." };
  if (!hasAdminKey()) return { ok: false, message: "The server has no admin key." };
  return { ok: true, id: me.id };
}

/** Today › Emails to assign: file the email under the chosen project (attachments to OneDrive, event on the timeline). */
export async function assignMailAction(mailId: number, projectId: number): Promise<Result> {
  const a = await office();
  if (!a.ok) return a;
  const r = await fileMessage(adminDb(), mailId, projectId, "manual", a.id);
  if (!r.ok) return r;
  revalidatePath("/");
  revalidatePath(recordHref(getTable("projects"), projectId));
  return { ok: true };
}

/** Not a project email: out of the Assign list, kept in the mailbox. */
export async function ignoreMailAction(mailId: number): Promise<Result> {
  const a = await office();
  if (!a.ok) return a;
  const r = await ignoreMessage(adminDb(), mailId, a.id);
  if (!r.ok) return r;
  revalidatePath("/");
  return { ok: true };
}

/** Projects by name for the Assign list's picker (the person's own permissions apply). */
export async function searchProjectsAction(query: string): Promise<{ id: number; label: string }[]> {
  await requireUser();
  const q = query.trim().replace(/[%_,()]/g, " ").trim();
  if (q.length < 2) return [];
  const db = await recordsDb();
  const byId = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;
  let req = db.from("projects").select("id, title").is("deleted_at", null).order("updated_at", { ascending: false }).limit(8);
  req = byId ? req.eq("id", byId) : req.ilike("title", `%${q}%`);
  const { data } = await req;
  return ((data ?? []) as { id: number; title: string | null }[]).map((p) => ({ id: p.id, label: `${p.title ?? "Project"} (#${p.id})` }));
}
