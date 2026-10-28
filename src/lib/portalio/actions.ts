"use server";

import { revalidatePath } from "next/cache";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { todayET } from "@/lib/dates";
import { canSeeFinance } from "@/lib/finance/access";
import { deleteRecordAction } from "@/lib/records/record-actions";
import { saveRecord } from "@/lib/records/save";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { clearMirror, disconnect, exchangeCredentials, listSubscriptions, loadSettings, portalEnv, saveSettings, subscribeWebhook, unsubscribeWebhook, PortalError, WEBHOOK_EVENTS, DEFAULT_REVIEW_FROM } from "./client";
import { proposalChanges, type ContactMatch } from "./match";
import { contactMatches, refreshProposal, syncProposals, type ProposalRow, type SyncSummary, PROPOSAL_COLS } from "./sync";
import { syncLinkedProposal, type TxSyncSummary } from "./transactions";

// PI-a…PI-e (SPEC §9.1): Admin › Portal.io, and what the office does with an accepted proposal on Finance / Today /
// the project page. Transactions, contacts and projects are created through saveRecord (validation, audit,
// permissions), never by the mirror itself.

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

async function sysadmin(): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can change the Portal.io connection." };
  if (!hasAdminKey()) return { ok: false, message: "The server has no admin key." };
  return { ok: true, id: me.id };
}

/** Linking, refreshing and replacing create or change Transactions, so the person needs Finance (or Transactions) and Transactions: Create. */
async function finance(): Promise<Result<{ me: CurrentUser }>> {
  const me = await requireUser();
  if (!canSeeFinance(me)) return { ok: false, message: "You don't have permission to do that." };
  if (!canDo(me.permissions, getTable("transactions"), "create", getTable)) return { ok: false, message: "You need permission to create Transactions." };
  if (!hasAdminKey()) return { ok: false, message: "The server has no admin key." };
  return { ok: true, me };
}

const err = (e: unknown) => (e instanceof PortalError ? e.message : e instanceof Error ? e.message : String(e));

function refreshPaths(projectId?: number | null) {
  revalidatePath("/administrative/finance");
  revalidatePath("/");
  if (projectId) revalidatePath(recordHref(getTable("projects"), projectId));
}

// ---------------------------------------------------------------- Admin › Portal.io

/** Connect: the Portal.io sign-in is exchanged for the user key once; the password is not kept. */
export async function connectPortalAction(username: string, password: string): Promise<Result> {
  const a = await sysadmin();
  if (!a.ok) return a;
  if (!portalEnv()) return { ok: false, message: "Portal.io keys are not set on the server (PORTAL_SANDBOX_* / PORTAL_PROD_*)." };
  if (!/^[^\s@]+@[^\s@]+$/.test(username.trim())) return { ok: false, message: "That is not an email address." };
  if (!password) return { ok: false, message: "Type the Portal.io password." };
  try {
    const r = await exchangeCredentials(username.trim(), password);
    const prev = await loadSettings();
    await saveSettings({ env: portalEnv()!.env, user_key: r.apiKey, user_name: r.userName, display_name: r.displayName, connected_at: new Date().toISOString(), connected_by: a.id, last_sync_at: null, last_sync_error: null, last_full_sync_at: null, webhook: prev?.webhook ?? null, review_from: prev?.review_from === undefined ? DEFAULT_REVIEW_FROM : prev.review_from }, a.id);
  } catch (e) {
    const m = err(e);
    return { ok: false, message: /401|refused|Unauthorized/i.test(m) ? "Portal.io refused the sign-in. Check the e-mail and password (the sandbox uses your production password)." : m };
  }
  revalidatePath("/admin/portalio");
  return { ok: true };
}

export async function disconnectPortalAction(): Promise<Result> {
  const a = await sysadmin();
  if (!a.ok) return a;
  const s = await loadSettings();
  if (s?.webhook) await unsubscribeWebhook(s.user_key, s.webhook.subscription_id).catch(() => undefined);
  // The mirror goes with the connection (a sandbox copy must not mix with production); the Transactions keep their Portal #.
  await clearMirror();
  await disconnect();
  revalidatePath("/admin/portalio");
  refreshPaths();
  return { ok: true };
}

/** PI-i: Admin › Portal.io › "Offer for review proposals accepted from" (empty = all of them). */
export async function setReviewFromAction(date: string): Promise<Result> {
  const a = await sysadmin();
  if (!a.ok) return a;
  const d = date.trim();
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, message: "Type a date as yyyy-mm-dd, or leave it empty for every proposal." };
  const s = await loadSettings();
  if (!s) return { ok: false, message: "Connect Portal.io first." };
  await saveSettings({ ...s, review_from: d || null }, a.id);
  revalidatePath("/admin/portalio");
  refreshPaths();
  return { ok: true };
}

export async function syncPortalNowAction(full: boolean): Promise<Result<{ summary: SyncSummary }>> {
  const a = await sysadmin();
  if (!a.ok) return a;
  // 50 s: under Vercel's function limit, so the run always gets to write its summary; a long sync takes several clicks (or the hourly ticks).
  const summary = await syncProposals({ full, reread: full, budgetMs: 50_000 });
  revalidatePath("/admin/portalio");
  refreshPaths();
  return { ok: true, summary };
}

/** Register the CRM's webhook with Portal.io (or re-register it after the site URL changed). */
export async function registerWebhookAction(): Promise<Result> {
  const a = await sysadmin();
  if (!a.ok) return a;
  const s = await loadSettings();
  if (!s) return { ok: false, message: "Connect Portal.io first." };
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!/^https:\/\//.test(site) || /localhost|127\.0\.0\.1/.test(site)) return { ok: false, message: "The webhook needs the public https address of the CRM (NEXT_PUBLIC_SITE_URL); Portal.io refuses localhost. Use Sync now while developing." };
  const url = `${site.replace(/\/$/, "")}/api/portalio/webhook`;
  try {
    if (s.webhook) await unsubscribeWebhook(s.user_key, s.webhook.subscription_id).catch(() => undefined);
    const sub = await subscribeWebhook(s.user_key, url);
    if (!sub.secretKey) return { ok: false, message: "Portal.io registered the webhook but returned no secret; remove it there and try again." };
    await saveSettings({ ...s, webhook: { subscription_id: sub.subscriptionId, secret: sub.secretKey, url, events: sub.events ?? WEBHOOK_EVENTS, created_at: new Date().toISOString() } }, a.id);
  } catch (e) {
    return { ok: false, message: err(e) };
  }
  revalidatePath("/admin/portalio");
  return { ok: true };
}

export async function removeWebhookAction(): Promise<Result> {
  const a = await sysadmin();
  if (!a.ok) return a;
  const s = await loadSettings();
  if (!s?.webhook) return { ok: true };
  try {
    await unsubscribeWebhook(s.user_key, s.webhook.subscription_id);
  } catch (e) {
    if (!(e instanceof PortalError && e.status === 404)) return { ok: false, message: err(e) };
  }
  await saveSettings({ ...s, webhook: null }, a.id);
  revalidatePath("/admin/portalio");
  return { ok: true };
}

/** Admin: what Portal.io says is registered (to spot a stale subscription). */
export async function listWebhooksAction(): Promise<Result<{ subscriptions: { id: string; url: string; enabled: boolean; events: string[] }[] }>> {
  const a = await sysadmin();
  if (!a.ok) return a;
  const s = await loadSettings();
  if (!s) return { ok: false, message: "Connect Portal.io first." };
  try {
    const subs = await listSubscriptions(s.user_key);
    return { ok: true, subscriptions: (subs ?? []).map((x) => ({ id: String(x.subscriptionId), url: x.url, enabled: x.enabled ?? true, events: x.events ?? [] })) };
  } catch (e) {
    return { ok: false, message: err(e) };
  }
}

// ---------------------------------------------------------------- the review cards

async function proposal(id: number): Promise<ProposalRow | null> {
  const { data } = await adminDb().from("portal_proposals").select(PROPOSAL_COLS).eq("id", id).maybeSingle();
  return (data as ProposalRow | null) ?? null;
}

const who = (me: CurrentUser) => [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email;
const money = (n: number | null | undefined) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n ?? 0));

/** One History line on the project (audit_log, action update, actor = the person). */
async function history(projectId: number, actor: string, key: string, note: string, extra: Record<string, [unknown, unknown]> = {}) {
  await adminDb().from("audit_log").insert({ table_name: "projects", record_id: projectId, action: "update", actor, changes: { [key]: [null, note], ...extra } });
}

/** A Timeline line (channel portal) once per proposal; rewritten when the proposal is linked again. */
async function timeline(projectId: number, p: ProposalRow, title: string, body: string, userId: string) {
  const db = adminDb();
  const ref = `portal:${p.id}`;
  const fields = { project_id: projectId, occurred_at: new Date().toISOString(), actor: "Portal.io", title, body, deleted_at: null };
  const { data: ex } = await db.from("project_events").select("id").eq("channel", "portal").eq("source_ref", ref).maybeSingle();
  if (ex) await db.from("project_events").update(fields).eq("id", (ex as { id: number }).id);
  else await db.from("project_events").insert({ ...fields, channel: "portal", source_table: "portal_proposals", source_id: p.id, source_ref: ref, attachments: [], created_by: userId });
}

const txValues = (p: ProposalRow, projectId: number, date: string) => ({
  payment_type: "Apply to Project",
  project_id: projectId,
  type: "Proposal",
  description: (p.name ?? `Portal.io proposal #${p.number ?? p.id}`).slice(0, 100),
  portal_number: String(p.number ?? p.id).slice(0, 10),
  amount: Number(p.total ?? 0),
  date,
});

/** PI-c Link: the Approved-Proposal Transaction under the chosen project, History and Timeline lines. */
/** FIN Part 2: the Transactions that hang on a linked proposal (change orders, invoices, payments, items), with the person as the History actor. */
async function followUp(proposalId: number, actor: string): Promise<TxSyncSummary> {
  const s = await loadSettings().catch(() => null);
  return syncLinkedProposal(adminDb(), proposalId, { settings: s, actor });
}

export async function linkProposalAction(proposalId: number, projectId: number): Promise<Result<{ transactionId: number; sync: TxSyncSummary }>> {
  const a = await finance();
  if (!a.ok) return a;
  const p = await proposal(proposalId);
  if (!p) return { ok: false, message: "This proposal is no longer in the mirror." };
  if (p.link_status === "linked" && p.transaction_id) return { ok: false, message: "This proposal is already linked." };
  const date = (p.accepted_at ?? "").slice(0, 10) || todayET();
  const r = await saveRecord("transactions", null, txValues(p, projectId, date));
  if (!r.ok) return { ok: false, message: r.message ?? Object.values(r.errors).join("; ") };
  const { data: pr } = await adminDb().from("projects").select("title").eq("id", projectId).maybeSingle();
  const title = (pr as { title: string | null } | null)?.title ?? `#${projectId}`;
  await adminDb().from("portal_proposals").update({ project_id: projectId, transaction_id: r.id, synced_total: p.total, synced_name: p.name, synced_change_orders: p.change_orders, link_status: "linked", linked_at: new Date().toISOString(), linked_by: a.me.id, auto_linked: false }).eq("id", proposalId);
  await history(projectId, a.me.id, "portal_proposal", `Portal.io proposal #${p.number ?? p.id} "${p.name ?? ""}" (${money(p.total)}) linked by ${who(a.me)}: Approved Proposal transaction created`);
  await timeline(projectId, p, `Portal.io: proposal #${p.number ?? p.id} accepted`, `${p.name ?? ""}\nTotal ${money(p.total)} · linked to ${title} by ${who(a.me)}`, a.me.id);
  const sync = await followUp(proposalId, a.me.id);
  refreshPaths(projectId);
  return { ok: true, transactionId: r.id, sync };
}

/** PI-c Ignore: kept in the mirror, never offered again (undo on the Finance tab). */
export async function ignoreProposalAction(proposalId: number, back = false): Promise<Result> {
  const a = await finance();
  if (!a.ok) return a;
  await adminDb().from("portal_proposals").update({ link_status: back ? "new" : "ignored", linked_by: a.me.id }).eq("id", proposalId).neq("link_status", "linked");
  refreshPaths();
  return { ok: true };
}

/** PI-e Refresh: the existing Transaction takes the proposal's current total and name. */
export async function refreshProposalAction(proposalId: number): Promise<Result> {
  const a = await finance();
  if (!a.ok) return a;
  const p = await proposal(proposalId);
  if (!p?.transaction_id || !p.project_id) return { ok: false, message: "This proposal is not linked to a Transaction." };
  const ch = proposalChanges(p);
  if (!ch) return { ok: true };
  const r = await saveRecord("transactions", p.transaction_id, { amount: Number(p.total ?? 0), description: (p.name ?? "").slice(0, 100) || undefined });
  if (!r.ok) return { ok: false, message: r.message ?? Object.values(r.errors).join("; ") };
  await adminDb().from("portal_proposals").update({ synced_total: p.total, synced_name: p.name, synced_change_orders: p.change_orders }).eq("id", proposalId);
  await followUp(proposalId, a.me.id);
  await history(p.project_id, a.me.id, "portal_proposal", `Refreshed from Portal.io by ${who(a.me)}: proposal #${p.number ?? p.id} ${ch.total ? `${money(ch.total[0])} → ${money(ch.total[1])}` : "(name or change orders)"}`);
  refreshPaths(p.project_id);
  return { ok: true };
}

/** PI-e Replace: the old Transaction goes to Deleted items; a new one dated today carries the new total. */
export async function replaceProposalAction(proposalId: number): Promise<Result> {
  const a = await finance();
  if (!a.ok) return a;
  const p = await proposal(proposalId);
  if (!p?.transaction_id || !p.project_id) return { ok: false, message: "This proposal is not linked to a Transaction." };
  const del = await deleteRecordAction("transactions", p.transaction_id);
  if (!del.ok) return del;
  const r = await saveRecord("transactions", null, txValues(p, p.project_id, todayET()));
  if (!r.ok) return { ok: false, message: r.message ?? Object.values(r.errors).join("; ") };
  await adminDb().from("portal_proposals").update({ transaction_id: r.id, synced_total: p.total, synced_name: p.name, synced_change_orders: p.change_orders, linked_at: new Date().toISOString(), linked_by: a.me.id }).eq("id", proposalId);
  await history(p.project_id, a.me.id, "portal_proposal", `Replaced from Portal.io by ${who(a.me)}: proposal #${p.number ?? p.id}, old transaction ${money(p.synced_total)} deleted, new transaction ${money(p.total)}`);
  await followUp(proposalId, a.me.id);
  refreshPaths(p.project_id);
  return { ok: true };
}

/** PI-e Keep as is: accept the difference until the proposal changes again. */
export async function keepProposalAction(proposalId: number): Promise<Result> {
  const a = await finance();
  if (!a.ok) return a;
  const p = await proposal(proposalId);
  if (!p?.project_id) return { ok: false, message: "This proposal is not linked." };
  await adminDb().from("portal_proposals").update({ synced_total: p.total, synced_name: p.name, synced_change_orders: p.change_orders }).eq("id", proposalId);
  await history(p.project_id, a.me.id, "portal_proposal", `Portal.io proposal #${p.number ?? p.id} changed to ${money(p.total)}; ${who(a.me)} kept the transaction as it is (${money(p.synced_total)})`);
  refreshPaths(p.project_id);
  return { ok: true };
}

/** Read one proposal again from Portal.io (the card's "Check Portal.io now"). */
export async function refreshFromPortalAction(proposalId: number): Promise<Result> {
  const a = await finance();
  if (!a.ok) return a;
  const r = await refreshProposal(proposalId);
  if (!r.ok) return r;
  refreshPaths();
  return { ok: true };
}

// ---------------------------------------------------------------- PI-d new project, never an automatic client

export type NewContactInput = { first_name: string; last_name: string; email: string; main_phone: string; organization_id: number | null; type: string };

/** The contacts that look like the proposal's customer, with the reason, for the picker. */
export async function contactMatchesAction(proposalId: number): Promise<ContactMatch[]> {
  const a = await finance();
  if (!a.ok) return [];
  const p = await proposal(proposalId);
  return p ? contactMatches(adminDb(), p.customer) : [];
}

export async function searchContactsAction(query: string): Promise<{ id: number; label: string }[]> {
  await requireUser();
  const q = query.trim().replace(/[%_,()]/g, " ").trim();
  if (q.length < 2) return [];
  const byId = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;
  let req = adminDb().from("contacts").select("id, title, email").is("deleted_at", null).order("updated_at", { ascending: false }).limit(8);
  req = byId ? req.eq("id", byId) : req.or(`title.ilike.%${q}%,email.ilike.%${q}%`);
  const { data } = await req;
  return ((data ?? []) as { id: number; title: string | null; email: string | null }[]).map((c) => ({ id: c.id, label: `${c.title ?? "Contact"}${c.email ? ` · ${c.email}` : ""} (#${c.id})` }));
}

/** Organizations whose name equals the Portal.io company, for the new-contact box (never created here). */
export async function organizationByNameAction(name: string): Promise<{ id: number; label: string } | null> {
  await requireUser();
  const q = name.trim();
  if (!q) return null;
  const { data } = await adminDb().from("organizations").select("id, title").is("deleted_at", null).ilike("title", q).limit(1).maybeSingle();
  const o = data as { id: number; title: string | null } | null;
  return o ? { id: o.id, label: `${o.title ?? "Organization"} (#${o.id})` } : null;
}

/**
 * New project from this proposal: the Job Owner is an existing contact the person picked, or a new contact whose
 * fields the person confirmed. Then the project (name, job address, owner, salesperson by e-mail), then Link.
 */
export async function createProjectFromProposalAction(proposalId: number, owner: { contactId: number } | { newContact: NewContactInput }): Promise<Result<{ projectId: number }>> {
  const a = await finance();
  if (!a.ok) return a;
  if (!canDo(a.me.permissions, getTable("projects"), "create", getTable)) return { ok: false, message: "You need permission to create Projects." };
  const p = await proposal(proposalId);
  if (!p) return { ok: false, message: "This proposal is no longer in the mirror." };
  let contactId: number;
  if ("contactId" in owner) contactId = owner.contactId;
  else {
    if (!canDo(a.me.permissions, getTable("contacts"), "create", getTable)) return { ok: false, message: "You need permission to create Contacts." };
    const c = owner.newContact;
    const r = await saveRecord("contacts", null, { type: c.type || "End Customer", first_name: c.first_name.trim(), last_name: c.last_name.trim(), email: c.email.trim() || null, main_phone: c.main_phone.trim() || null, organization_id: c.organization_id });
    if (!r.ok) return { ok: false, message: r.message ?? Object.values(r.errors).join("; ") };
    contactId = r.id;
  }
  let salespersonId: number | null = null;
  const spEmail = (p.salesperson?.email ?? "").trim();
  if (spEmail) {
    const { data: emp } = await adminDb().from("employees").select("id").ilike("email", spEmail).is("deleted_at", null).limit(1).maybeSingle();
    salespersonId = (emp as { id: number } | null)?.id ?? null;
  }
  const loc = p.location;
  const job_address = loc && (loc.street || loc.city) ? { street: [loc.street, loc.suite].filter(Boolean).join(", "), address_2: "", city: loc.city ?? "", state: loc.stateAbbrev ?? loc.state ?? "", zip: loc.postalCode ?? "" } : null;
  const pr = await saveRecord("projects", null, { title: (p.name ?? `Portal.io proposal #${p.number ?? p.id}`).slice(0, 200), job_owner_id: contactId, job_address, salesperson_id: salespersonId, job_status: "Proposal Approved" });
  if (!pr.ok) return { ok: false, message: pr.message ?? Object.values(pr.errors).join("; ") };
  const link = await linkProposalAction(proposalId, pr.id);
  if (!link.ok) return link;
  revalidatePath(recordHref(getTable("projects"), pr.id));
  return { ok: true, projectId: pr.id };
}
