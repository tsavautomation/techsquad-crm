import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayET } from "@/lib/dates";
import { reviewFrom } from "@/lib/portalio/client";
import { proposalChanges, OPEN_REQUEST } from "@/lib/portalio/match";
import { ACCEPTED, PROPOSAL_COLS, type PaymentRequest, type ProposalRow } from "@/lib/portalio/sync";
import { loadFinanceSettings } from "./settings";
import { dueBuckets, figures, financialStatus, paymentNumbers, reliabilitySuggestion, type Figures, type FinRow, type FinancialStatus } from "./status";

// FIN (SPEC §9.1 FIN-a…FIN-h, Fred 2026-10-28): what Administrative › Finance and the project's Finance card read, with
// the signed-in person's client (RLS applies). Only Low Voltage projects are in the module (Electrical has its own
// flow later). Nothing is stored: project_financials() aggregates, src/lib/finance/status.ts decides.

export const LOW_VOLTAGE = "Low Voltage";

export type ClientKey = "owner" | "owner_org" | "design_firm" | "general_contractor" | "builder";
export const CLIENT_KEYS: { key: ClientKey; label: string }[] = [
  { key: "owner", label: "Job Owner" },
  { key: "owner_org", label: "Job Owner's organization" },
  { key: "design_firm", label: "Design firm" },
  { key: "general_contractor", label: "General contractor" },
  { key: "builder", label: "Builder / Developer" },
];
export type PartnerKey = "design_firm" | "builder" | "referral" | "commission_to";
export const PARTNER_KEYS: { key: PartnerKey; label: string }[] = [
  { key: "design_firm", label: "Designer" },
  { key: "builder", label: "Builder / Developer" },
  { key: "referral", label: "Referral" },
  { key: "commission_to", label: "Commission to" },
];

export type FinanceProject = Figures & {
  id: number;
  title: string;
  owner: string | null;
  owner_id: number | null;
  owner_org: string | null;
  owner_org_id: number | null;
  design_firm: string | null;
  general_contractor: string | null;
  builder: string | null;
  referral: string | null;
  commission_to: string | null;
  job_status: string | null;
  status: FinancialStatus;
  /** FIN-d: the paying client's reliability (Job Owner's, else their organization's). */
  reliability: "High" | "Medium" | "Low" | null;
  proposals: number;
  /** FIN-g alert: Proposal Approved or later with no Approved Proposal transaction. */
  missingProposal: boolean;
};

type ProjectRow = {
  id: number;
  title: string | null;
  job_status: string | null;
  category: string | null;
  owner: { id: number; title: string | null; payment_reliability: string | null; organizations: { id: number; title: string | null; payment_reliability: string | null } | null } | null;
  design_firm: { title: string | null } | null;
  gc: { title: string | null } | null;
  builder: { title: string | null } | null;
  ref_c: { title: string | null } | null;
  ref_o: { title: string | null } | null;
  com_c: { title: string | null } | null;
  com_o: { title: string | null } | null;
};

const PROJECT_SELECT = "id, title, job_status, category, owner:job_owner_id(id, title, payment_reliability, organizations:organization_id(id, title, payment_reliability)), design_firm:design_firm_id(title), gc:general_contractor_id(title), builder:builder_developer_id(title), ref_c:referral_contact_id(title), ref_o:referral_organization_id(title), com_c:commission_contact_id(title), com_o:commission_organization_id(title)";
const APPROVED_OR_LATER = new Set(["Proposal Approved", "ON HOLD", "Infrastructure", "Installation", "Programming", "Complete"]);

/** Every Low Voltage project that has money, a linked proposal, or should have one (status Proposal Approved or later). */
export async function loadFinanceProjects(db: SupabaseClient): Promise<FinanceProject[]> {
  const [{ data: tx }, { data: pp }, { data: later }] = await Promise.all([
    db.from("transactions").select("project_id").eq("payment_type", "Apply to Project").is("deleted_at", null).not("project_id", "is", null).limit(20000),
    db.from("portal_proposals").select("project_id").eq("link_status", "linked").not("project_id", "is", null).limit(20000),
    db.from("projects").select("id").eq("category", LOW_VOLTAGE).in("job_status", [...APPROVED_OR_LATER]).is("deleted_at", null).limit(5000),
  ]);
  const proposals = new Map<number, number>();
  for (const r of (pp ?? []) as { project_id: number }[]) proposals.set(r.project_id, (proposals.get(r.project_id) ?? 0) + 1);
  const ids = [...new Set([...((tx ?? []) as { project_id: number }[]).map((r) => r.project_id), ...proposals.keys(), ...((later ?? []) as { id: number }[]).map((r) => r.id)])];
  if (!ids.length) return [];
  const [{ data: rows }, { data: fin }, settings] = await Promise.all([
    db.from("projects").select(PROJECT_SELECT).in("id", ids).eq("category", LOW_VOLTAGE).is("deleted_at", null).limit(20000),
    db.rpc("project_financials", { p_project_ids: ids }),
    loadFinanceSettings(db),
  ]);
  const byId = new Map(((fin ?? []) as FinRow[]).map((f) => [f.project_id, f]));
  const today = todayET();
  return ((rows ?? []) as unknown as ProjectRow[])
    .map((p) => {
      const f = byId.get(p.id);
      const empty: FinRow = { project_id: p.id, approved_amount: 0, invoiced_amount: 0, paid_amount: 0, discount_amount: 0, cc_fee_amount: 0, tip_amount: 0, sales_tax: 0, parts_cost: 0, open_invoice_dues: [], job_status: p.job_status, category: p.category, commission_percent: null, commission_amount: null };
      const row = f ?? empty;
      const fig = figures(row, today);
      return {
        ...fig,
        id: p.id,
        title: p.title ?? `Project #${p.id}`,
        owner: p.owner?.title ?? null,
        owner_id: p.owner?.id ?? null,
        owner_org: p.owner?.organizations?.title ?? null,
        owner_org_id: p.owner?.organizations?.id ?? null,
        design_firm: p.design_firm?.title ?? null,
        general_contractor: p.gc?.title ?? null,
        builder: p.builder?.title ?? null,
        referral: p.ref_c?.title ?? p.ref_o?.title ?? null,
        commission_to: [p.com_c?.title, p.com_o?.title].filter(Boolean).join(" / ") || null,
        job_status: p.job_status,
        status: financialStatus(row, settings.grace_days, today),
        reliability: (p.owner?.payment_reliability ?? p.owner?.organizations?.payment_reliability ?? null) as FinanceProject["reliability"],
        proposals: proposals.get(p.id) ?? 0,
        missingProposal: APPROVED_OR_LATER.has(p.job_status ?? "") && fig.approved <= 0,
      } satisfies FinanceProject;
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------- dashboard "What do we have to receive?"

export type Dashboard = {
  open: number;
  byStatus: Record<string, { amount: number; projects: number }>;
  onHold: { amount: number; projects: number };
  byReliability: Record<string, number>;
  due: { late: number; d30: number; d60: number; d90: number };
  profit: number;
  approved: number;
  ccFees: number;
  tips: number;
  missing: FinanceProject[];
  graceDays: number;
};

/** FIN-f: totals over the Low Voltage projects (ON HOLD apart; Proposal Denied never receivable). */
export async function loadDashboard(db: SupabaseClient, projects: FinanceProject[]): Promise<Dashboard> {
  const receivable = projects.filter((p) => p.job_status !== "Proposal Denied" && p.balance > 0);
  const live = receivable.filter((p) => !p.onHold);
  const byStatus: Dashboard["byStatus"] = {};
  for (const p of live) {
    const s = (byStatus[p.status] ??= { amount: 0, projects: 0 });
    s.amount += p.balance;
    s.projects++;
  }
  const byReliability: Record<string, number> = { High: 0, Medium: 0, Low: 0, Unknown: 0 };
  for (const p of live) byReliability[p.reliability ?? "Unknown"] += p.balance;
  const liveIds = live.map((p) => p.id);
  const { data: inv } = liveIds.length
    ? await db.from("transactions").select("project_id, amount, due_date, invoice_status").eq("payment_type", "Apply to Project").eq("type", "Invoice").is("deleted_at", null).in("project_id", liveIds).not("due_date", "is", null).limit(20000)
    : { data: [] };
  const open = ((inv ?? []) as { amount: number; due_date: string; invoice_status: string | null }[]).filter((i) => !["Paid", "Declined"].includes(i.invoice_status ?? "")).map((i) => ({ due: i.due_date, amount: Number(i.amount) }));
  const settings = await loadFinanceSettings(db);
  return {
    open: receivable.reduce((a, p) => a + p.balance, 0),
    byStatus,
    onHold: { amount: receivable.filter((p) => p.onHold).reduce((a, p) => a + p.balance, 0), projects: receivable.filter((p) => p.onHold).length },
    byReliability,
    due: dueBuckets(open, todayET()),
    profit: projects.reduce((a, p) => a + p.profit, 0),
    approved: projects.reduce((a, p) => a + p.approved, 0),
    ccFees: projects.reduce((a, p) => a + p.ccFees, 0),
    tips: projects.reduce((a, p) => a + p.tips, 0),
    missing: projects.filter((p) => p.missingProposal),
    graceDays: settings.grace_days,
  };
}

// ---------------------------------------------------------------- lists

export type PaymentLine = { id: number; date: string | null; project_id: number; project: string; client: string | null; description: string | null; portal_number: string | null; amount: number; cc_fee: number; tip: number; discount: number; method: string | null; reference: string | null; payment_no: number | null };

/** FIN-f payments by period (Amount, CC Fee, Tip, Method), Low Voltage projects only. */
export async function loadPayments(db: SupabaseClient, projects: FinanceProject[], from: string | null, to: string | null): Promise<PaymentLine[]> {
  const byId = new Map(projects.map((p) => [p.id, p]));
  if (!byId.size) return [];
  let q = db.from("transactions").select("id, date, project_id, description, portal_number, amount, cc_fee, tip, discount, method, reference").eq("payment_type", "Apply to Project").eq("type", "Payment").is("deleted_at", null).in("project_id", [...byId.keys()]).order("date", { ascending: false }).limit(5000);
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  const { data } = await q;
  type Row = { id: number; date: string | null; project_id: number; description: string | null; portal_number: string | null; amount: number; cc_fee: number | null; tip: number | null; discount: number | null; method: string | null; reference: string | null };
  const rows = (data ?? []) as Row[];
  // Payment # needs every payment of the project, not only the period's.
  const { data: all } = rows.length ? await db.from("transactions").select("id, date, project_id").eq("payment_type", "Apply to Project").eq("type", "Payment").is("deleted_at", null).in("project_id", [...new Set(rows.map((r) => r.project_id))]).limit(20000) : { data: [] };
  const perProject = new Map<number, { id: number; date: string | null }[]>();
  for (const a of (all ?? []) as { id: number; date: string | null; project_id: number }[]) perProject.set(a.project_id, [...(perProject.get(a.project_id) ?? []), a]);
  const numbers = new Map<number, number>();
  for (const [, list] of perProject) for (const [id, k] of paymentNumbers(list)) numbers.set(id, k);
  return rows.map((r) => {
    const p = byId.get(r.project_id)!;
    return { id: r.id, date: r.date, project_id: r.project_id, project: p.title, client: p.owner ?? p.owner_org, description: r.description, portal_number: r.portal_number, amount: Number(r.amount), cc_fee: Number(r.cc_fee ?? 0), tip: Number(r.tip ?? 0), discount: Number(r.discount ?? 0), method: r.method, reference: r.reference, payment_no: numbers.get(r.id) ?? null };
  });
}

export type ProposalLine = { id: number; date: string | null; project_id: number; project: string; client: string | null; description: string | null; portal_number: string | null; amount: number; is_change_order: boolean; sales_tax: number; parts_cost: number; partner: string | null; commission: number };

/** FIN-f approved proposals by period; also grouped by partner (Designer / Builder / Referral / Commission to) with the commission. */
export async function loadProposals(db: SupabaseClient, projects: FinanceProject[], from: string | null, to: string | null, partner: PartnerKey): Promise<ProposalLine[]> {
  const byId = new Map(projects.map((p) => [p.id, p]));
  if (!byId.size) return [];
  let q = db.from("transactions").select("id, date, project_id, description, portal_number, amount, is_change_order, sales_tax, parts_cost").eq("payment_type", "Apply to Project").eq("type", "Proposal").is("deleted_at", null).in("project_id", [...byId.keys()]).order("date", { ascending: false }).limit(5000);
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  const { data } = await q;
  type Row = { id: number; date: string | null; project_id: number; description: string | null; portal_number: string | null; amount: number; is_change_order: boolean; sales_tax: number | null; parts_cost: number | null };
  return ((data ?? []) as Row[]).map((r) => {
    const p = byId.get(r.project_id)!;
    const amount = Number(r.amount);
    // Commission on this proposal = the project's Commission % × this proposal's amount (FIN-e).
    const pct = p.approved > 0 ? p.commission / p.approved : 0;
    return { id: r.id, date: r.date, project_id: r.project_id, project: p.title, client: p.owner ?? p.owner_org, description: r.description, portal_number: r.portal_number, amount, is_change_order: r.is_change_order, sales_tax: Number(r.sales_tax ?? 0), parts_cost: Number(r.parts_cost ?? 0), partner: p[partner] ?? null, commission: Math.round(amount * pct * 100) / 100 };
  });
}

export type ClientTotals = { client: string; projects: { id: number; title: string; approved: number; invoiced: number; paid: number }[]; approved: number; invoiced: number; paid: number; balance: number };

/** PI-h / FIN-f "By client": transactions dated in [from, to] summed per project, grouped by the chosen client field. */
export async function loadByClient(db: SupabaseClient, projects: FinanceProject[], key: ClientKey, from: string | null, to: string | null): Promise<ClientTotals[]> {
  const byId = new Map(projects.map((p) => [p.id, p]));
  if (!byId.size) return [];
  let q = db.from("transactions").select("project_id, type, amount, discount").eq("payment_type", "Apply to Project").is("deleted_at", null).in("project_id", [...byId.keys()]).limit(20000);
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  const { data } = await q;
  const sums = new Map<number, { approved: number; invoiced: number; paid: number }>();
  for (const t of (data ?? []) as { project_id: number; type: string; amount: number; discount: number | null }[]) {
    const s = sums.get(t.project_id) ?? { approved: 0, invoiced: 0, paid: 0 };
    if (t.type === "Proposal") s.approved += Number(t.amount ?? 0);
    else if (t.type === "Invoice") s.invoiced += Number(t.amount ?? 0);
    else if (t.type === "Payment") s.paid += Number(t.amount ?? 0) + Number(t.discount ?? 0);
    sums.set(t.project_id, s);
  }
  const groups = new Map<string, ClientTotals>();
  for (const p of projects) {
    const s = sums.get(p.id);
    if (!s) continue;
    const client = p[key] ?? "(no client)";
    const g = groups.get(client) ?? { client, projects: [], approved: 0, invoiced: 0, paid: 0, balance: 0 };
    g.projects.push({ id: p.id, title: p.title, ...s });
    g.approved += s.approved;
    g.invoiced += s.invoiced;
    g.paid += s.paid;
    g.balance = Math.round((g.approved - g.paid) * 100) / 100;
    groups.set(client, g);
  }
  return [...groups.values()].sort((a, b) => b.approved - a.approved || a.client.localeCompare(b.client));
}

// ---------------------------------------------------------------- FIN-d reliability suggestion

/** Average days late of a client's paid invoices (Due Date → first payment on or after it), for the suggestion beside the manual value. */
export async function reliabilityFor(db: SupabaseClient, projectIds: number[]): Promise<ReturnType<typeof reliabilitySuggestion>> {
  if (!projectIds.length) return null;
  const { data } = await db.from("transactions").select("project_id, type, date, due_date, invoice_status").eq("payment_type", "Apply to Project").in("type", ["Invoice", "Payment"]).is("deleted_at", null).in("project_id", projectIds).limit(20000);
  type Row = { project_id: number; type: string; date: string | null; due_date: string | null; invoice_status: string | null };
  const rows = (data ?? []) as Row[];
  const late: number[] = [];
  for (const inv of rows.filter((r) => r.type === "Invoice" && r.due_date && r.invoice_status === "Paid")) {
    const pay = rows.filter((r) => r.type === "Payment" && r.project_id === inv.project_id && r.date && r.date >= (inv.due_date as string)).map((r) => r.date as string).sort()[0];
    late.push(pay ? Math.round((Date.parse(pay) - Date.parse(inv.due_date as string)) / 86_400_000) : 0);
  }
  return reliabilitySuggestion(late);
}

// ---------------------------------------------------------------- Portal.io review (PI-c / PI-e)

export type ReviewCard = { proposal: ProposalRow; kind: "new" | "changed"; changes: ReturnType<typeof proposalChanges>; projectTitle: string | null };

export async function loadReview(db: SupabaseClient, projectId?: number): Promise<ReviewCard[]> {
  let q = db.from("portal_proposals").select(PROPOSAL_COLS).eq("archived", false).in("link_status", ["new", "linked"]).order("accepted_at", { ascending: false, nullsFirst: false }).limit(300);
  if (projectId) q = q.eq("project_id", projectId);
  else {
    q = q.in("status", ACCEPTED);
    const from = await reviewFrom();
    if (from) q = q.or(`accepted_at.gte.${from}T00:00:00Z,link_status.eq.linked`);
  }
  const { data } = await q;
  const rows = (data ?? []) as ProposalRow[];
  const cards: ReviewCard[] = [];
  for (const p of rows) {
    if (p.link_status === "new" && ACCEPTED.includes(p.status ?? "")) cards.push({ proposal: p, kind: "new", changes: null, projectTitle: null });
    else if (p.link_status === "linked") {
      const ch = proposalChanges(p);
      if (ch) cards.push({ proposal: p, kind: "changed", changes: ch, projectTitle: null });
    }
  }
  const pids = [...new Set(cards.map((c) => c.proposal.project_id).filter((x): x is number => x !== null))];
  if (pids.length) {
    const { data: pr } = await db.from("projects").select("id, title").in("id", pids);
    const titles = new Map(((pr ?? []) as { id: number; title: string | null }[]).map((p) => [p.id, p.title]));
    for (const c of cards) if (c.proposal.project_id) c.projectTitle = titles.get(c.proposal.project_id) ?? null;
  }
  return cards;
}

export async function loadIgnored(db: SupabaseClient): Promise<ProposalRow[]> {
  const { data } = await db.from("portal_proposals").select(PROPOSAL_COLS).eq("link_status", "ignored").order("updated_at", { ascending: false }).limit(50);
  return (data ?? []) as ProposalRow[];
}

export async function loadProjectProposals(db: SupabaseClient, projectId: number): Promise<{ proposals: ProposalRow[]; requests: (PaymentRequest & { proposal: number | null })[] }> {
  const { data } = await db.from("portal_proposals").select(PROPOSAL_COLS).eq("project_id", projectId).eq("link_status", "linked").order("accepted_at", { ascending: false, nullsFirst: false });
  const proposals = (data ?? []) as ProposalRow[];
  const requests = proposals.flatMap((p) => (p.payment_requests ?? []).map((r) => ({ ...r, proposal: p.number })));
  requests.sort((a, b) => Number(!OPEN_REQUEST(a.status)) - Number(!OPEN_REQUEST(b.status)) || (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  return { proposals, requests };
}

export type ProjectTransaction = { id: number; type: string; description: string | null; portal_number: string | null; amount: number; date: string | null; due_date: string | null; invoice_status: string | null; method: string | null; cc_fee: number | null; tip: number | null; discount: number | null; is_change_order: boolean; parent_transaction_id: number | null; sales_tax: number | null; parts_cost: number | null; payment_no: number | null };

/** The project's transactions (Apply to Project) with the Payment #, for the Finance card's lists. */
export async function loadProjectTransactions(db: SupabaseClient, projectId: number): Promise<ProjectTransaction[]> {
  const { data } = await db.from("transactions").select("id, type, description, portal_number, amount, date, due_date, invoice_status, method, cc_fee, tip, discount, is_change_order, parent_transaction_id, sales_tax, parts_cost").eq("project_id", projectId).eq("payment_type", "Apply to Project").is("deleted_at", null).order("date").limit(500);
  const rows = (data ?? []) as Omit<ProjectTransaction, "payment_no">[];
  const numbers = paymentNumbers(rows.filter((r) => r.type === "Payment"));
  return rows.map((r) => ({ ...r, payment_no: numbers.get(r.id) ?? null }));
}
