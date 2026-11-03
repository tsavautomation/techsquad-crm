/**
 * FIN-o Prompt 2 dry run (Luana via Fred 2026-11-02): computes every change the Finance data fix would make
 * (superseded proposals, card fees, payment splits, allocation and numbering per proposal, dates, partners) and
 * writes docs/finance-dryrun.md + docs/finance-dryrun.csv with before → after per project. NOTHING IS WRITTEN
 * to the database. The same plan is applied by scripts/finance-apply.ts once Fred approves.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/finance-dryrun.ts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { buildPlan, type Data, type Plan, type PortalRec, type Split, type Tx } from "@/lib/finance/fix-plan";
import { monthFromHeader } from "@/lib/finance/sheet";
import { getProposal, loadSettings } from "@/lib/portalio/client";
import { adminDb } from "@/lib/supabase/admin";

const SHEET = "Sales Projections_Dashboard Updated 10-27-26.xlsx";
const money = (n: number | null | undefined) => (n == null ? "–" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n)));

async function all<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

async function main() {
  const db = adminDb();
  const [tx, sheet, portal, projects, items, organizations, contacts] = await Promise.all([
    all<Tx>(db.from("transactions").select("id, project_id, type, amount, date, description, cc_fee, tip, discount, method, portal_number, portal_proposal_id, portal_change_order_id, portal_request_id, parent_transaction_id, is_change_order, sheet_ref, sales_tax, parts_cost, invoice_status, created_at").is("deleted_at", null).limit(20000)),
    all<Data["sheet"][number]>(db.from("sheet_proposals").select("id, number, main_number, change_order, title, customer, amount, date, designer, commission, payments, cc_fee, project_id, transaction_id").limit(5000)),
    all<PortalRec & { detail: { paymentSchedule?: PortalRec["schedule"] } | null }>(db.from("portal_proposals").select("id, number, name, status, total, financial, payment_requests, change_orders, change_order_details, project_id, transaction_id, detail").limit(2000)),
    all<Data["projects"][number]>(db.from("projects").select("id, title, category, job_status, design_firm_id, builder_developer_id, general_contractor_id, referral_contact_id, referral_organization_id, commission_contact_id, commission_organization_id").is("deleted_at", null).limit(5000)),
    all<Data["items"][number]>(db.from("proposal_items").select("transaction_id, cost, quantity, item_type").limit(50000)),
    all<Data["organizations"][number]>(db.from("organizations").select("id, title, type").is("deleted_at", null).limit(5000)),
    all<Data["contacts"][number]>(db.from("contacts").select("id, title").is("deleted_at", null).limit(20000)),
  ]);
  for (const p of portal) p.schedule = p.detail?.paymentSchedule ?? null;

  // The sheet's multi-value cells (formulas with +), by month.
  const splits: Split[] = [];
  if (fs.existsSync(SHEET)) {
    const raw = JSON.parse(execFileSync(process.execPath, ["scripts/sheet-formulas.mjs", SHEET], { maxBuffer: 64 * 1024 * 1024 }).toString()) as { rows: { number: string | null; title: string | null; customer: string | null; cells: { header: string | number | null; result: number; parts: number[] }[] }[] };
    for (const r of raw.rows)
      for (const c of r.cells) {
        const month = monthFromHeader(c.header as never);
        if (month && c.parts.length > 1) splits.push({ number: r.number == null ? null : String(r.number), title: r.title, customer: r.customer, month, result: Number(c.result), parts: c.parts });
      }
  } else console.error(`Sheet ${SHEET} not found: multi-value cells skipped`);

  // Leventhal #3158 lives in the portal as a Draft: its Parts (cost × qty) and tax come from the live proposal.
  const extra: Data["extra"] = {};
  const s = await loadSettings();
  const lev = portal.find((p) => p.number === 3158);
  const levTx = tx.find((t) => t.project_id === 1283 && t.portal_number === "3158" && t.type === "Proposal");
  if (s && lev && levTx) {
    const live = (await getProposal(s.user_key, lev.id)) as unknown as { areas?: unknown; financialSummary?: { salesTax?: { total?: number } } };
    const its: { itemType?: string; cost?: number; quantity?: number }[] = [];
    const walk = (o: unknown) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === "object") {
        const r = o as Record<string, unknown>;
        if ("itemType" in r) its.push(r as never);
        else Object.values(r).forEach(walk);
      }
    };
    walk(live.areas);
    const parts = Math.round(its.filter((i) => i.itemType === "Part" || i.itemType === "CustomItem").reduce((n, i) => n + Number(i.cost ?? 0) * Number(i.quantity ?? 0), 0) * 100) / 100;
    extra[levTx.id] = { portal_id: lev.id, parts_cost: parts, sales_tax: Number(live.financialSummary?.salesTax?.total ?? 0) };
  }

  const data: Data = { tx, sheet, portal, projects, items, splits, organizations, contacts, extra };
  const plan = buildPlan(data);
  render(data, plan);
}

function render(d: Data, plan: Plan) {
  const title = new Map(d.projects.map((p) => [p.id, p.title ?? `#${p.id}`]));
  const txById = new Map(d.tx.map((t) => [t.id, t]));
  const lines: string[] = [];
  const out = (s = "") => lines.push(s);
  out("# Finance data fix: dry run (nothing written)");
  out(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Rules: SPEC §9.1 FIN-o. Apply with scripts/finance-apply.ts after Fred's OK.`);
  out();
  const byRule = (r: string) => plan.changes.filter((c) => c.rule === r);
  out("## Summary");
  out(`- A superseded / duplicate proposals: ${byRule("A").length} changes`);
  out(`- B card fees: ${byRule("B").length} changes`);
  out(`- C payments (splits ${plan.creates.length} new rows, allocation, dates): ${byRule("C").length} changes`);
  out(`- D partners on projects: ${byRule("D").length} changes`);
  const lv = d.projects.filter((p) => p.category === "Low Voltage");
  const sum = (k: "before" | "after", f: "approved" | "paid" | "balance") => lv.reduce((n, p) => n + (plan.totals.get(p.id)?.[k][f] ?? 0), 0);
  out(`- Low Voltage receivable (balance of every project): ${money(sum("before", "balance"))} → ${money(sum("after", "balance"))} (approved ${money(sum("before", "approved"))} → ${money(sum("after", "approved"))}; paid ${money(sum("before", "paid"))} → ${money(sum("after", "paid"))})`);
  out();
  out("## Test cases");
  const check = (pid: number, label: string) => {
    const t = plan.totals.get(pid);
    if (!t) return out(`- ${label}: project #${pid} not found`);
    out(`- ${label} (#${pid} ${title.get(pid)}): approved ${money(t.before.approved)} → ${money(t.after.approved)}; paid ${money(t.before.paid)} → ${money(t.after.paid)}; balance ${money(t.before.balance)} → ${money(t.after.balance)}`);
  };
  check(1135, "845 Chaparral (expected approved 456,902.72 / paid 422,660.60 / balance 34,242.12)");
  check(1283, "Leventhal (only #3158 counts)");
  check(1148, "Kaufman (expected #3115 1st 4,241.63 balance 1,817.85; CO 1st 2,054.38 + fee 63.80)");
  check(1211, "Eisen (expected #3198 2,299.41, fee 46.55 on the payment)");
  check(1281, "Gale (expected #2226 17,580.40, fee 380.86)");
  for (const [payId, label] of plan.numbering) {
    const t = txById.get(payId)!;
    if ([1148, 1211, 1281, 1283].includes(t.project_id ?? 0)) out(`  - payment #${payId} ${money(t.amount)} ${t.date}: ${label}`);
  }
  out();
  const projectsTouched = [...new Set([...plan.changes.map((c) => c.project_id), ...plan.creates.map((c) => c.project_id), ...plan.notes.map((n) => n.project_id)])].filter((x): x is number => x != null).sort((a, b) => (title.get(a) ?? "").localeCompare(title.get(b) ?? ""));
  out(`## Per project (${projectsTouched.length})`);
  const show = (v: unknown) => (v === "now" ? "deleted" : v == null ? "–" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));
  for (const pid of projectsTouched) {
    const t = plan.totals.get(pid);
    out(`### #${pid} ${title.get(pid)}`);
    if (t && (t.before.balance !== t.after.balance || t.before.approved !== t.after.approved)) out(`Approved ${money(t.before.approved)} → ${money(t.after.approved)} · Paid ${money(t.before.paid)} → ${money(t.after.paid)} · Balance ${money(t.before.balance)} → ${money(t.after.balance)}`);
    for (const c of plan.changes.filter((c) => c.project_id === pid)) {
      const x = c.table === "transactions" ? txById.get(c.id!) : null;
      const what = x ? `${x.type}${x.is_change_order ? " (CO)" : ""} #${x.id} ${x.portal_number ?? ""} ${money(x.amount)} ${x.date ?? ""}` : `project`;
      out(`- [${c.rule}] ${what}: ${Object.entries(c.set).map(([k, v]) => `${k} ${show(c.before[k])} → ${show(v)}`).join(", ")} — ${c.why}`);
    }
    for (const c of plan.creates.filter((c) => c.project_id === pid)) out(`- [${c.rule}] NEW Payment ${money(c.row.amount as number)} ${c.row.date} — ${c.why}`);
    for (const n of plan.notes.filter((n) => n.project_id === pid && !n.rule.startsWith("L-schedule-ok"))) out(`- (${n.rule}) ${n.text}`);
    out();
  }
  const general = plan.notes.filter((n) => n.project_id == null);
  if (general.length) {
    out("## Not tied to a project");
    for (const n of general) out(`- (${n.rule}) ${n.text}`);
    out();
  }
  const listsCount = (r: string) => plan.notes.filter((n) => n.rule === r).length;
  out("## Lists for Luana");
  out(`- Define the payment schedule: ${listsCount("L-schedule")} proposals (structured schedule found on ${listsCount("L-schedule-ok")})`);
  out(`- Credit change orders to decide: ${listsCount("L-credit")}`);
  out(`- Proposals with items without cost: ${listsCount("L-cost")}`);
  out(`- Sheet change orders missing in the CRM: ${listsCount("L-co")}`);
  out(`- Payments the office must allocate: ${plan.notes.filter((n) => n.rule === "C" && n.text.startsWith("Payment #")).length}`);
  out(`- Partners to create or decide: ${plan.notes.filter((n) => n.rule === "D").length}`);
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/finance-dryrun.md", lines.join("\n") + "\n");
  const csv = [["project_id", "project", "rule", "table", "id", "field", "before", "after", "why"].join(",")];
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  for (const c of plan.changes) for (const [k, v] of Object.entries(c.set)) csv.push([c.project_id, title.get(c.project_id ?? 0), c.rule, c.table, c.id, k, show(c.before[k]), show(v), c.why].map(q).join(","));
  for (const c of plan.creates) csv.push([c.project_id, title.get(c.project_id), c.rule, "transactions", "NEW", "payment", "", money(c.row.amount as number), c.why].map(q).join(","));
  fs.writeFileSync("docs/finance-dryrun.csv", "﻿" + csv.join("\r\n") + "\r\n");
  console.log(lines.slice(0, 22).join("\n"));
  console.log(`\n… full report: docs/finance-dryrun.md (${plan.changes.length} changes, ${plan.creates.length} new rows, ${plan.notes.length} notes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
