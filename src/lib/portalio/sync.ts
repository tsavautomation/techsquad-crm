import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminDb } from "@/lib/supabase/admin";
import { getProposal, listProposals, loadSettings, patchSettings, type ProposalDetail, type ProposalSummary } from "./client";
import { matchContacts, suggestProjects, type ContactLite, type ContactMatch, type PortalCustomer, type PortalLocation, type ProjectLite, type Suggestion } from "./match";

// PI-b (SPEC §9.1): the mirror of Portal.io proposals. The hourly tick and Sync now read what changed since the last
// sync; Sync everything reads every proposal (archived included); the webhook refreshes one proposal at once.
// Nothing here writes to Portal.io, creates clients or creates Transactions: accepted proposals only get suggestions.

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

export const PROPOSAL_COLS = "id, number, name, status, total, currency, customer, location, salesperson, payment_requests, change_orders, items_count, portal_created_at, portal_modified_at, accepted_at, archived, project_id, transaction_id, synced_total, synced_name, synced_change_orders, link_status, linked_at, suggestions, fetched_at";

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
    total: d.total?.proposalTotal ?? d.proposalTotal ?? null,
    currency: d.total?.currency?.code ?? "USD",
    customer: c ? { id: c.id ?? null, partyType: c.partyType ?? null, contactType: c.contactType ?? null, firstName: c.firstName ?? null, lastName: c.lastName ?? null, companyName: c.companyName ?? null, email: c.contactEmail ?? null, phone: c.contactPhone ?? null } : null,
    location: loc ? { street: loc.street ?? null, suite: loc.suite ?? null, city: loc.city ?? null, state: loc.state ?? null, stateAbbrev: loc.stateAbbrev ?? null, postalCode: loc.postalCode ?? null } : null,
    salesperson: d.salesperson ? { id: d.salesperson.id, email: d.salesperson.email ?? null, firstName: d.salesperson.firstName ?? null, lastName: d.salesperson.lastName ?? null } : null,
    payment_requests: (d.paymentRequests ?? []).map((r) => ({ id: r.id ?? null, status: r.status ?? null, amount: r.amount ?? null, dueDate: r.dueDate ?? null, description: r.description ?? null, paymentMethod: r.paymentMethod ?? null })),
    change_orders: (d.changeOrders ?? []).map((o) => ({ id: o.id, number: o.number ?? null, name: o.name ?? null, status: o.status ?? null, total: o.total?.changeOrderTotal ?? null })),
    items_count: items,
    portal_created_at: d.createdDate ?? null,
    portal_modified_at: d.lastModifiedDate ?? null,
    accepted_at: d.status === "Accepted" ? d.clientLastDecisionDate ?? d.lastModifiedByUserDate ?? null : null,
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

export type SyncSummary = { checked: number; updated: number; toReview: number; errors: string[]; skipped?: string };

async function upsertDetail(db: SupabaseClient, d: ProposalDetail, archived: boolean, index: Awaited<ReturnType<typeof loadProjectIndex>> | null): Promise<void> {
  const row = rowFromDetail(d, archived);
  const { data: prev } = await db.from("portal_proposals").select("link_status, suggestions, customer").eq("id", d.id).maybeSingle();
  const before = prev as { link_status: string; suggestions: Suggestion[] | null; customer: PortalCustomer | null } | null;
  const patch: Record<string, unknown> = { ...row };
  // PI-c: suggestions for an accepted proposal not yet linked (recomputed when the customer changed or there were none).
  if (row.status === "Accepted" && (before?.link_status ?? "new") === "new" && index && (!before?.suggestions || JSON.stringify(before.customer) !== JSON.stringify(row.customer))) {
    patch.suggestions = suggestProjects({ number: row.number, name: row.name, customer: row.customer, location: row.location }, index.projects, index.txByNumber);
  }
  const { error } = await db.from("portal_proposals").upsert(patch, { onConflict: "id" });
  if (error) throw new Error(`Proposal ${d.id}: ${error.message}`);
}

/**
 * Read what changed in Portal.io since the last sync (or everything, archived included, with `full`), fetch each
 * changed proposal's detail and upsert it. Never throws: the error lands on the settings and in the summary.
 */
export async function syncProposals(opts: { full?: boolean; budgetMs?: number } = {}): Promise<SyncSummary> {
  const s = await loadSettings();
  if (!s) return { checked: 0, updated: 0, toReview: 0, errors: [], skipped: "Portal.io is not connected" };
  const db = adminDb();
  const started = Date.now();
  const budget = opts.budgetMs ?? 240_000;
  const out: SyncSummary = { checked: 0, updated: 0, toReview: 0, errors: [] };
  // A day of overlap: Portal.io's ModifiedAfter is compared to lastModifiedDate, and the clocks need not agree.
  const since = opts.full || !s.last_sync_at ? undefined : new Date(new Date(s.last_sync_at).getTime() - 24 * 3600_000).toISOString();
  const index = await loadProjectIndex(db);
  try {
    for (const archived of opts.full ? [false, true] : [false]) {
      for (let page = 1; page < 200; page++) {
        if (Date.now() - started > budget) {
          out.errors.push("Stopped at the time limit; the next sync continues");
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
          if (!changed) continue;
          try {
            const d = await getProposal(s.user_key, p.id);
            await upsertDetail(db, d, archived, index);
            out.updated++;
          } catch (e) {
            out.errors.push(`#${p.number ?? p.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (items.length < 100) break;
      }
    }
    const { count } = await db.from("portal_proposals").select("id", { count: "exact", head: true }).eq("status", "Accepted").eq("link_status", "new").eq("archived", false);
    out.toReview = count ?? 0;
    const at = new Date().toISOString();
    await patchSettings({ last_sync_at: at, last_sync_error: out.errors.length ? out.errors.slice(0, 3).join(" · ") : null, ...(opts.full ? { last_full_sync_at: at } : {}) });
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
    await upsertDetail(db, d, (prev as { archived: boolean } | null)?.archived ?? false, await loadProjectIndex(db));
    return { ok: true, status: d.status ?? null };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
