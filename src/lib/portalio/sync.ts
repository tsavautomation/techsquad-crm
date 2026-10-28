import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminDb } from "@/lib/supabase/admin";
import { getProposal, listProposals, loadSettings, patchSettings, reviewFrom, type PortalSettings, type ProposalDetail, type ProposalSummary } from "./client";
import { matchContacts, suggestProjects, OPEN_REQUEST, type ContactLite, type ContactMatch, type PortalCustomer, type PortalLocation, type ProjectLite, type Suggestion } from "./match";
import { autoLinkCandidate } from "./plan";
import { syncLinkedProposal, type TxSyncSummary } from "./transactions";

// PI-b (SPEC §9.1): the mirror of Portal.io proposals. The hourly tick and Sync now read what changed since the last
// sync; Sync everything reads every proposal (archived included); the webhook refreshes one proposal at once.
// Nothing here writes to Portal.io or creates clients. Transactions: a linked proposal's Approved Proposal, change
// orders, Invoices and Payments are kept up to date by transactions.ts (FIN Part 2); an accepted proposal whose
// Portal.io customer has exactly one project is linked by itself (FIN-l), every other one waits for a person.

export type ProposalRow = {
  id: number;
  number: number | null;
  name: string | null;
  status: string | null;
  total: number | null;
  currency: string | null;
  customer: PortalCustomer | null;
  location: PortalLocation | null;
  salesperson: { id?: number; email?: string | null; firstName?: string | null; lastName?: string | null } | null;
  financial: Financial | null;
  payment_requests: PaymentRequest[];
  change_orders: ChangeOrder[];
  items_count: number | null;
  portal_created_at: string | null;
  portal_modified_at: string | null;
  accepted_at: string | null;
  archived: boolean;
  project_id: number | null;
  transaction_id: number | null;
  synced_total: number | null;
  synced_name: string | null;
  synced_change_orders: ChangeOrder[] | null;
  link_status: "new" | "linked" | "ignored";
  linked_at: string | null;
  suggestions: Suggestion[] | null;
  fetched_at: string;
};
export type PaymentRequest = { id: number | null; status: string | null; amount: number | null; dueDate: string | null; description: string | null; paymentMethod: string | null };
export type ChangeOrder = { id: number; number: number | null; name: string | null; status: string | null; total: number | null };

/** Statuses that mean the client said yes (Completed = accepted and the job finished). */
export const ACCEPTED = ["Accepted", "Completed"];

export const PROPOSAL_COLS = "id, number, name, status, total, currency, customer, location, salesperson, financial, payment_requests, change_orders, items_count, portal_created_at, portal_modified_at, accepted_at, archived, project_id, transaction_id, synced_total, synced_name, synced_change_orders, link_status, linked_at, suggestions, fetched_at";

/** The columns a Portal.io detail answer fills (never the CRM's own link columns). */
export function rowFromDetail(d: ProposalDetail, archived = false) {
  const c = d.customer ?? null;
  const loc = c?.location ?? null;
  const items = (d.areas ?? []).reduce((n, a) => n + (a.options ?? []).reduce((m, o) => m + (o.items?.length ?? 0), 0), 0);
  return {
    id: d.id,
    number: d.number ?? null,
    name: d.name ?? null,
    status: d.status ?? null,
    // The detail keeps the money under financialSummary (seen on the sandbox 2026-10-28); the list under total.
    total: d.financialSummary?.proposalTotal ?? d.total?.proposalTotal ?? d.proposalTotal ?? null,
    currency: d.financialSummary?.currency?.code ?? d.total?.currency?.code ?? "USD",
    financial: d.financialSummary ? { parts: d.financialSummary.partsTotal ?? null, labor: d.financialSummary.laborTotal ?? null, fee: d.financialSummary.feeTotal ?? null, subtotal: d.financialSummary.proposalSubtotal ?? null, tax: d.financialSummary.salesTax?.total ?? null } : null,
    customer: c ? { id: c.id ?? null, partyType: c.partyType ?? null, contactType: c.contactType ?? null, firstName: c.firstName ?? null, lastName: c.lastName ?? null, companyName: c.companyName ?? null, email: c.contactEmail ?? null, phone: c.contactPhone ?? null } : null,
    location: loc ? { street: loc.street ?? null, suite: loc.suite ?? null, city: loc.city ?? null, state: loc.state ?? null, stateAbbrev: loc.stateAbbrev ?? null, postalCode: loc.postalCode ?? null } : null,
    salesperson: d.salesperson ? { id: d.salesperson.id, email: d.salesperson.email ?? null, firstName: d.salesperson.firstName ?? null, lastName: d.salesperson.lastName ?? null } : null,
    payment_requests: (d.paymentRequests ?? []).map((r) => ({ id: r.id ?? null, status: r.status ?? null, amount: r.amount ?? null, dueDate: r.dueDate ?? null, description: r.description ?? null, paymentMethod: r.paymentMethod ?? null })),
    change_orders: (d.changeOrders ?? []).map((o) => ({ id: o.id, number: o.number ?? null, name: o.name ?? null, status: o.status ?? null, total: o.total?.changeOrderTotal ?? null })),
    items_count: items,
    portal_created_at: d.createdDate ?? null,
    portal_modified_at: d.lastModifiedDate ?? null,
    accepted_at: ACCEPTED.includes(d.status ?? "") ? d.clientLastDecisionDate ?? d.lastCompletedDate ?? d.lastModifiedByUserDate ?? null : null,
    archived,
    detail: d as unknown as Record<string, unknown>,
    fetched_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- suggestions

/** Every project with its owner's e-mail / phone, and which projects already carry each Portal number in a Transaction. */
export async function loadProjectIndex(db: SupabaseClient): Promise<{ projects: ProjectLite[]; txByNumber: Map<string, number[]> }> {
  const [{ data: pr }, { data: tx }] = await Promise.all([
    db.from("projects").select("id, title, job_address, job_owner_id, contacts:job_owner_id(first_name, last_name, email, main_phone)").is("deleted_at", null).limit(5000),
    db.from("transactions").select("project_id, portal_number").eq("payment_type", "Apply to Project").is("deleted_at", null).not("portal_number", "is", null).not("project_id", "is", null).limit(5000),
  ]);
  type Row = { id: number; title: string | null; job_address: ProjectLite["job_address"]; contacts: { first_name: string | null; last_name: string | null; email: string | null; main_phone: string | null } | null };
  const projects = ((pr ?? []) as unknown as Row[]).map((p) => ({ id: p.id, title: p.title, job_address: p.job_address, owner_email: p.contacts?.email ?? null, owner_phone: p.contacts?.main_phone ?? null, owner_name: p.contacts ? [p.contacts.first_name, p.contacts.last_name].filter(Boolean).join(" ") : null }));
  const txByNumber = new Map<string, number[]>();
  for (const t of (tx ?? []) as { project_id: number; portal_number: string }[]) {
    const k = t.portal_number.replace(/\D/g, "");
    if (!k) continue;
    txByNumber.set(k, [...(txByNumber.get(k) ?? []), t.project_id]);
  }
  return { projects, txByNumber };
}

/** PI-d: contacts that look like the proposal's customer (e-mail, phone, then full name). */
export async function contactMatches(db: SupabaseClient, c: PortalCustomer | null): Promise<ContactMatch[]> {
  if (!c) return [];
  const ors: string[] = [];
  const email = (c.email ?? "").trim();
  if (email) ors.push(`email.ilike.${email},alternate_email.ilike.${email}`);
  const digits = (c.phone ?? "").replace(/\D/g, "").slice(-10);
  if (digits.length === 10) ors.push(`main_phone.ilike.%${digits.slice(0, 3)}%${digits.slice(3, 6)}%${digits.slice(6)}`);
  if (c.firstName && c.lastName) ors.push(`and(first_name.ilike.${c.firstName.trim()},last_name.ilike.${c.lastName.trim()})`);
  if (!ors.length) return [];
  const { data } = await db.from("contacts").select("id, first_name, last_name, email, alternate_email, main_phone, organizations:organization_id(title)").is("deleted_at", null).or(ors.join(",")).limit(30);
  type Row = Omit<ContactLite, "organization"> & { organizations: { title: string | null } | null };
  return matchContacts(c, ((data ?? []) as unknown as Row[]).map((k) => ({ ...k, organization: k.organizations?.title ?? null })));
}

// ---------------------------------------------------------------- sync

export type SyncSummary = { checked: number; updated: number; toReview: number; errors: string[]; skipped?: string; transactions?: TxTally };
export type Financial = { parts: number | null; labor: number | null; fee: number | null; subtotal: number | null; tax: number | null };

type Index = Awaited<ReturnType<typeof loadProjectIndex>>;
export type TxTally = { proposals: number; created: number; updated: number; autoLinked: number };
const tally = (t: TxTally | undefined, r: TxSyncSummary) => {
  if (!t) return;
  t.proposals++;
  t.created += r.created.main + r.created.co + r.created.invoice + r.created.payment;
  t.updated += r.updated;
};

async function upsertDetail(db: SupabaseClient, d: ProposalDetail, archived: boolean, index: Index | null, s: PortalSettings | null, tx?: TxTally): Promise<void> {
  const row = rowFromDetail(d, archived);
  const { data: prev } = await db.from("portal_proposals").select("link_status, suggestions, customer").eq("id", d.id).maybeSingle();
  const before = prev as { link_status: string; suggestions: Suggestion[] | null; customer: PortalCustomer | null } | null;
  const patch: Record<string, unknown> = { ...row };
  const status = before?.link_status ?? "new";
  // PI-c: suggestions for an accepted proposal not yet linked, recomputed on every read (projects change too).
  let suggestions: Suggestion[] | null = null;
  if (ACCEPTED.includes(row.status ?? "") && status === "new" && index) {
    suggestions = suggestProjects({ number: row.number, name: row.name, customer: row.customer, location: row.location }, index.projects, index.txByNumber);
    patch.suggestions = suggestions;
  }
  const { error } = await db.from("portal_proposals").upsert(patch, { onConflict: "id" });
  if (error) throw new Error(`Proposal ${d.id}: ${error.message}`);
  // FIN Part 2: a linked proposal's Transactions follow; a new accepted one may link itself (FIN-l).
  if (status === "linked") tally(tx, await syncLinkedProposal(db, d.id, { settings: s }));
  else if (suggestions && !archived && index && (await autoLink(db, { id: d.id, number: row.number, customer: row.customer, accepted_at: row.accepted_at }, suggestions, index, s))) {
    if (tx) tx.autoLinked++;
    tally(tx, await syncLinkedProposal(db, d.id, { settings: s }));
  }
}

/**
 * FIN-l: link a new accepted proposal by itself when its Portal.io customer belongs to exactly one Low Voltage project
 * and nothing stronger points elsewhere. Only proposals within the review window (PI-i); the History and Timeline say
 * it was automatic, so the office can undo it like any link (Replace, or delete the Transaction).
 */
async function autoLink(db: SupabaseClient, p: { id: number; number: number | null; customer: PortalCustomer | null; accepted_at: string | null }, suggestions: Suggestion[], index: Index, s: PortalSettings | null): Promise<boolean> {
  const customerId = p.customer?.id ?? null;
  if (!customerId) return false;
  const from = s ? s.review_from : await reviewFrom();
  if (from && (!p.accepted_at || p.accepted_at.slice(0, 10) < from)) return false;
  const { data } = await db.from("projects").select("id, title").eq("portal_customer_id", customerId).eq("category", "Low Voltage").is("deleted_at", null).limit(5);
  const candidates = (data ?? []) as { id: number; title: string | null }[];
  const projectId = autoLinkCandidate(customerId, candidates.map((c) => c.id), suggestions);
  if (!projectId) return false;
  const title = candidates[0].title ?? `#${projectId}`;
  const { data: row } = await db.from("portal_proposals").select("total, name, change_orders").eq("id", p.id).maybeSingle();
  const r = row as { total: number | null; name: string | null; change_orders: ChangeOrder[] } | null;
  // synced_* follow the mirror, so no "changed in Portal.io" card appears for what the sync itself wrote.
  const { error } = await db.from("portal_proposals").update({ project_id: projectId, link_status: "linked", linked_at: new Date().toISOString(), auto_linked: true, synced_total: r?.total ?? null, synced_name: r?.name ?? null, synced_change_orders: r?.change_orders ?? [] }).eq("id", p.id).eq("link_status", "new");
  if (error) return false;
  const who = [p.customer?.firstName, p.customer?.lastName, p.customer?.companyName].filter(Boolean).join(" ");
  await db.from("audit_log").insert({ table_name: "projects", record_id: projectId, action: "update", actor: null, changes: { portal_proposal: [null, `Portal.io proposal #${p.number ?? p.id} linked automatically: its customer (${who}) has only this project`] } });
  await db.from("project_events").insert({ project_id: projectId, channel: "portal", source_table: "portal_proposals", source_id: p.id, source_ref: `portal:${p.id}`, occurred_at: new Date().toISOString(), actor: "Portal.io", title: `Portal.io: proposal #${p.number ?? p.id} accepted`, body: `${r?.name ?? ""}\nLinked automatically to ${title} (same Portal.io customer)`, attachments: [], created_by: null });
  if (p.number !== null) index.txByNumber.set(String(p.number), [...(index.txByNumber.get(String(p.number)) ?? []), projectId]);
  return true;
}

/** FIN-j: linked proposals with a payment request still open (or never synced) are read again once an hour. */
async function rereadOpen(db: SupabaseClient, s: PortalSettings, index: Index, deadline: number, out: SyncSummary): Promise<boolean> {
  const { data } = await db.from("portal_proposals").select("id, number, payment_requests, fetched_at, tx_synced_at, archived").eq("link_status", "linked").eq("archived", false).limit(500);
  const stale = Date.now() - 50 * 60_000;
  for (const p of (data ?? []) as { id: number; number: number | null; payment_requests: PaymentRequest[]; fetched_at: string; tx_synced_at: string | null; archived: boolean }[]) {
    const open = (p.payment_requests ?? []).some((r) => OPEN_REQUEST(r.status)) || !p.tx_synced_at;
    if (!open || new Date(p.fetched_at).getTime() > stale) continue;
    if (Date.now() > deadline) return false;
    try {
      const d = await getProposal(s.user_key, p.id);
      await upsertDetail(db, d, p.archived, index, s, out.transactions);
      out.updated++;
    } catch (e) {
      out.errors.push(`#${p.number ?? p.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return true;
}

/**
 * Read what changed in Portal.io since the last sync (or everything, archived included, with `full`), fetch each
 * changed proposal's detail and upsert it. Never throws: the error lands on the settings and in the summary.
 */
const STOPPED = "Stopped at the time limit; the next sync continues";

export async function syncProposals(opts: { full?: boolean; reread?: boolean; budgetMs?: number } = {}): Promise<SyncSummary> {
  const s = await loadSettings();
  if (!s) return { checked: 0, updated: 0, toReview: 0, errors: [], skipped: "Portal.io is not connected" };
  const db = adminDb();
  const started = Date.now();
  // Vercel cuts a function at its time limit without warning, so every run works inside a budget and says when it
  // stopped early; the next run (a click or the hourly tick) continues, because proposals already read are skipped.
  const budget = opts.budgetMs ?? 50_000;
  const out: SyncSummary = { checked: 0, updated: 0, toReview: 0, errors: [], transactions: { proposals: 0, created: 0, updated: 0, autoLinked: 0 } };
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (!out.errors.includes(STOPPED)) out.errors.push(STOPPED);
  };
  // A day of overlap: Portal.io's ModifiedAfter is compared to lastModifiedDate, and the clocks need not agree.
  const since = opts.full || !s.last_sync_at ? undefined : new Date(new Date(s.last_sync_at).getTime() - 24 * 3600_000).toISOString();
  // Archived proposals are walked on a full sync, and until one full walk has finished.
  const includeArchived = opts.full || !s.last_full_sync_at;
  const index = await loadProjectIndex(db);
  try {
    // FIN-j first: the few linked proposals with open requests (the money people are waiting for), then the list walk.
    if (!(await rereadOpen(db, s, index, started + budget, out))) stop();
    for (const archived of includeArchived ? [false, true] : [false]) {
      if (stopped) break;
      for (let page = 1; page < 200; page++) {
        if (Date.now() - started > budget) {
          stop();
          break;
        }
        const list = await listProposals(s.user_key, { modifiedAfter: since, isArchive: archived, pageNumber: page, pageSize: 100 });
        const items: ProposalSummary[] = list.proposals ?? [];
        if (!items.length) break;
        out.checked += items.length;
        const ids = items.map((p) => p.id);
        const { data: have } = await db.from("portal_proposals").select("id, portal_modified_at, archived").in("id", ids);
        const known = new Map(((have ?? []) as { id: number; portal_modified_at: string | null; archived: boolean }[]).map((h) => [h.id, h]));
        for (const p of items) {
          const k = known.get(p.id);
          const changed = !k || !k.portal_modified_at || !p.lastModifiedDate || new Date(p.lastModifiedDate).getTime() > new Date(k.portal_modified_at).getTime() || k.archived !== archived;
          if (!changed && !opts.reread) continue;
          if (Date.now() - started > budget) {
            stop();
            break;
          }
          try {
            const d = await getProposal(s.user_key, p.id);
            await upsertDetail(db, d, archived, index, s, out.transactions);
            out.updated++;
          } catch (e) {
            out.errors.push(`#${p.number ?? p.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (items.length < 100) break;
      }
    }
    let cq = db.from("portal_proposals").select("id", { count: "exact", head: true }).in("status", ACCEPTED).eq("link_status", "new").eq("archived", false);
    if (s.review_from) cq = cq.gte("accepted_at", `${s.review_from}T00:00:00Z`);
    const { count } = await cq;
    out.toReview = count ?? 0;
    const at = new Date().toISOString();
    // A run cut short leaves last_sync_at alone, so the next one lists from the same point and picks up the rest.
    await patchSettings({ ...(stopped ? {} : { last_sync_at: at }), last_sync_error: out.errors.length ? out.errors.slice(0, 3).join(" · ") : null, ...(includeArchived && !stopped ? { last_full_sync_at: at } : {}) });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    out.errors.push(m);
    await patchSettings({ last_sync_error: m }).catch(() => undefined);
  }
  return out;
}

/** The webhook (PI-b) and the Refresh buttons: one proposal, now. */
export async function refreshProposal(id: number): Promise<{ ok: true; status: string | null } | { ok: false; message: string }> {
  const s = await loadSettings();
  if (!s) return { ok: false, message: "Portal.io is not connected" };
  try {
    const d = await getProposal(s.user_key, id);
    const db = adminDb();
    const { data: prev } = await db.from("portal_proposals").select("archived").eq("id", id).maybeSingle();
    await upsertDetail(db, d, (prev as { archived: boolean } | null)?.archived ?? false, await loadProjectIndex(db), s);
    return { ok: true, status: d.status ?? null };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
