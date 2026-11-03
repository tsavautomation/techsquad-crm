/**
 * FIN-o: loads everything the Finance data-fix planner (fix-plan.ts) looks at. Shared by the dry run
 * (scripts/finance-dryrun.ts) and the apply step (scripts/finance-apply.ts) so both see the same data.
 * Server only (service role + Portal.io key).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { Data, PortalRec, Split, Tx } from "@/lib/finance/fix-plan";
import { monthFromHeader } from "@/lib/finance/sheet";
import { getProposal, loadSettings } from "@/lib/portalio/client";
import { adminDb } from "@/lib/supabase/admin";

export const SHEET = "Sales Projections_Dashboard Updated 10-27-26.xlsx";

// PostgREST returns at most 1000 rows per request whatever .limit() says: page by id until a short page comes back.
const PAGE = 1000;
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const got = (data ?? []) as T[];
    rows.push(...got);
    if (got.length < PAGE) return rows;
  }
}

export async function loadFixData(): Promise<Data> {
  const db = adminDb();
  const [tx, sheet, portal, projects, items, organizations, contacts] = await Promise.all([
    all<Tx>((a, b) => db.from("transactions").select("*").is("deleted_at", null).order("id").range(a, b)),
    all<Data["sheet"][number]>((a, b) => db.from("sheet_proposals").select("id, number, main_number, change_order, title, customer, amount, date, designer, commission, payments, cc_fee, project_id, transaction_id").order("id").range(a, b)),
    all<PortalRec>((a, b) => db.from("portal_proposals").select("id, number, name, status, total, financial, payment_requests, change_orders, change_order_details, project_id, transaction_id, schedule:detail->paymentSchedule").order("id").range(a, b)),
    all<Data["projects"][number]>((a, b) => db.from("projects").select("id, title, category, job_status, design_firm_id, builder_developer_id, general_contractor_id, referral_contact_id, referral_organization_id, commission_contact_id, commission_organization_id").is("deleted_at", null).order("id").range(a, b)),
    all<Data["items"][number]>((a, b) => db.from("proposal_items").select("transaction_id, cost, quantity, item_type").order("id").range(a, b)),
    all<Data["organizations"][number]>((a, b) => db.from("organizations").select("id, title, type").is("deleted_at", null).order("id").range(a, b)),
    all<Data["contacts"][number]>((a, b) => db.from("contacts").select("id, title").is("deleted_at", null).order("id").range(a, b)),
  ]);

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

  return { tx, sheet, portal, projects, items, splits, organizations, contacts, extra };
}
