import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { proposalChanges, OPEN_REQUEST } from "@/lib/portalio/match";
import { PROPOSAL_COLS, type PaymentRequest, type ProposalRow } from "@/lib/portalio/sync";

// PI-h (SPEC §9.1): what Administrative › Finance reads with the signed-in person's client (RLS applies).
// Nothing is stored: Approved / Invoiced / Paid come from Transactions (project_financials), the payment status
// from project_payment_status, the Portal.io side from the mirror.

export type PaymentStatus = "Paid" | "Current" | "Overdue" | "No data";
export type ClientKey = "owner" | "owner_org" | "design_firm" | "general_contractor" | "builder";
export const CLIENT_KEYS: { key: ClientKey; label: string }[] = [
  { key: "owner", label: "Job Owner" },
  { key: "owner_org", label: "Job Owner's organization" },
  { key: "design_firm", label: "Design firm" },
  { key: "general_contractor", label: "General contractor" },
  { key: "builder", label: "Builder / Developer" },
];

export type FinanceProject = {
  id: number;
  title: string;
  owner: string | null;
  owner_org: string | null;
  design_firm: string | null;
  general_contractor: string | null;
  builder: string | null;
  job_status: string | null;
  approved: number;
  invoiced: number;
  paid: number;
  balance: number;
  status: PaymentStatus;
  next_due: string | null;
  open_requests: number;
  proposals: number;
};

type ProjectRow = {
  id: number;
  title: string | null;
  job_status: string | null;
  owner: { title: string | null; organizations: { title: string | null } | null } | null;
  design_firm: { title: string | null } | null;
  gc: { title: string | null } | null;
  builder: { title: string | null } | null;
};

/** Every project that has money (a transaction) or a linked Portal.io proposal, with its figures and status. */
export async function loadFinanceProjects(db: SupabaseClient): Promise<FinanceProject[]> {
  const [{ data: tx }, { data: pp }] = await Promise.all([
    db.from("transactions").select("project_id").eq("payment_type", "Apply to Project").is("deleted_at", null).not("project_id", "is", null).limit(20000),
    db.from("portal_proposals").select("project_id").eq("link_status", "linked").not("project_id", "is", null).limit(20000),
  ]);
  const proposals = new Map<number, number>();
  for (const r of (pp ?? []) as { project_id: number }[]) proposals.set(r.project_id, (proposals.get(r.project_id) ?? 0) + 1);
  const ids = [...new Set([...((tx ?? []) as { project_id: number }[]).map((r) => r.project_id), ...proposals.keys()])];
  if (!ids.length) return [];
  const [{ data: rows }, { data: fin }, { data: pay }] = await Promise.all([
    db.from("projects").select("id, title, job_status, owner:job_owner_id(title, organizations:organization_id(title)), design_firm:design_firm_id(title), gc:general_contractor_id(title), builder:builder_developer_id(title)").in("id", ids).is("deleted_at", null).limit(20000),
    db.rpc("project_financials", { p_project_ids: ids }),
    db.rpc("project_payment_status", { p_project_ids: ids }),
  ]);
  const money = new Map(((fin ?? []) as { project_id: number; approved_amount: number; invoiced_amount: number; paid_amount: number }[]).map((f) => [f.project_id, f]));
  const status = new Map(((pay ?? []) as { project_id: number; status: PaymentStatus; next_due: string | null; open_requests: number }[]).map((s) => [s.project_id, s]));
  return ((rows ?? []) as unknown as ProjectRow[])
    .map((p) => {
      const m = money.get(p.id);
      const s = status.get(p.id);
      const invoiced = Number(m?.invoiced_amount ?? 0);
      const paid = Number(m?.paid_amount ?? 0);
      return {
        id: p.id,
        title: p.title ?? `Project #${p.id}`,
        owner: p.owner?.title ?? null,
        owner_org: p.owner?.organizations?.title ?? null,
        design_firm: p.design_firm?.title ?? null,
        general_contractor: p.gc?.title ?? null,
        builder: p.builder?.title ?? null,
        job_status: p.job_status,
        approved: Number(m?.approved_amount ?? 0),
        invoiced,
        paid,
        balance: invoiced - paid,
        status: s?.status ?? "No data",
        next_due: s?.next_due ?? null,
        open_requests: s?.open_requests ?? 0,
        proposals: proposals.get(p.id) ?? 0,
      } satisfies FinanceProject;
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export type ClientTotals = { client: string; projects: { id: number; title: string; approved: number; invoiced: number; paid: number }[]; approved: number; invoiced: number; paid: number; balance: number };

/** PI-h "By client": transactions dated in [from, to] summed per project, then grouped by the chosen client field. */
export async function loadByClient(db: SupabaseClient, projects: FinanceProject[], key: ClientKey, from: string | null, to: string | null): Promise<ClientTotals[]> {
  let q = db.from("transactions").select("project_id, type, amount").eq("payment_type", "Apply to Project").is("deleted_at", null).not("project_id", "is", null).limit(20000);
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  const { data } = await q;
  const sums = new Map<number, { approved: number; invoiced: number; paid: number }>();
  for (const t of (data ?? []) as { project_id: number; type: string; amount: number }[]) {
    const s = sums.get(t.project_id) ?? { approved: 0, invoiced: 0, paid: 0 };
    if (t.type === "Proposal") s.approved += Number(t.amount ?? 0);
    else if (t.type === "Invoice") s.invoiced += Number(t.amount ?? 0);
    else if (t.type === "Payment") s.paid += Number(t.amount ?? 0);
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
    g.balance = g.invoiced - g.paid;
    groups.set(client, g);
  }
  return [...groups.values()].sort((a, b) => b.invoiced - a.invoiced || a.client.localeCompare(b.client));
}

// ---------------------------------------------------------------- Portal.io review

export type ReviewCard = {
  proposal: ProposalRow;
  kind: "new" | "changed";
  changes: ReturnType<typeof proposalChanges>;
  projectTitle: string | null;
};

/** PI-c / PI-e: accepted proposals not linked yet, and linked ones that changed in Portal.io since. */
export async function loadReview(db: SupabaseClient, projectId?: number): Promise<ReviewCard[]> {
  let q = db.from("portal_proposals").select(PROPOSAL_COLS).eq("archived", false).in("link_status", ["new", "linked"]).order("accepted_at", { ascending: false, nullsFirst: false }).limit(300);
  if (projectId) q = q.eq("project_id", projectId);
  else q = q.eq("status", "Accepted");
  const { data } = await q;
  const rows = (data ?? []) as ProposalRow[];
  const cards: ReviewCard[] = [];
  for (const p of rows) {
    if (p.link_status === "new" && p.status === "Accepted") cards.push({ proposal: p, kind: "new", changes: null, projectTitle: null });
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

/** Ignored proposals, for the undo list on the Finance tab. */
export async function loadIgnored(db: SupabaseClient): Promise<ProposalRow[]> {
  const { data } = await db.from("portal_proposals").select(PROPOSAL_COLS).eq("link_status", "ignored").order("updated_at", { ascending: false }).limit(50);
  return (data ?? []) as ProposalRow[];
}

/** The project's linked proposals with their open payment requests (the Finance card on the project page). */
export async function loadProjectProposals(db: SupabaseClient, projectId: number): Promise<{ proposals: ProposalRow[]; requests: (PaymentRequest & { proposal: number | null })[] }> {
  const { data } = await db.from("portal_proposals").select(PROPOSAL_COLS).eq("project_id", projectId).eq("link_status", "linked").order("accepted_at", { ascending: false, nullsFirst: false });
  const proposals = (data ?? []) as ProposalRow[];
  const requests = proposals.flatMap((p) => (p.payment_requests ?? []).map((r) => ({ ...r, proposal: p.number })));
  requests.sort((a, b) => Number(!OPEN_REQUEST(a.status)) - Number(!OPEN_REQUEST(b.status)) || (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  return { proposals, requests };
}
