/**
 * FIN-o Finance data fix: APPLIES the plan the dry run showed (scripts/finance-dryrun.ts). Approved by Fred
 * 2026-11-03 ("pode gravar"). Needs migration 20261103100000_fin_o_data_fix.sql.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/finance-apply.ts            # summary only
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/finance-apply.ts --apply    # writes
 *
 * Order: 1 partners to create (organizations / contacts) · 2 soft-deletes (frees the sheet_ref unique index)
 * · 3 the other transaction updates · 4 new split payments · 5 project partner fields · 6 sheet / portal
 * mirror rows re-pointed at the kept proposal. Every write is logged in docs/finance-apply-log.json with the
 * previous values (the file is not committed). Stops at the first error and says what was already written.
 */
import fs from "node:fs";
import { loadFixData } from "@/lib/finance/fix-load";
import { buildPlan, type Change } from "@/lib/finance/fix-plan";
import { adminDb } from "@/lib/supabase/admin";

const APPLY = process.argv.includes("--apply");
const LOG = "docs/finance-apply-log.json";
const DETAILS = "scripts/data/partner-details.json"; // phones, e-mails, addresses of the partners to create (local file)

type Logged = { table: string; id: number; set: Record<string, unknown>; before: Record<string, unknown>; why: string; rule: string };
const log: { at: string; partners: { key: string; table: string; id: number }[]; changes: Logged[]; created: { id: number; why: string }[]; repointed: { table: string; id: number; from: number | null; to: number }[] } = { at: new Date().toISOString(), partners: [], changes: [], created: [], repointed: [] };

async function main() {
  const db = adminDb();
  const data = await loadFixData();
  const plan = buildPlan(data);
  const txById = new Map(data.tx.map((t) => [t.id, t]));
  const by = (r: string) => plan.changes.filter((c) => c.rule === r).length;
  console.log(`Plan: A ${by("A")} · B ${by("B")} · C ${by("C")} · D ${by("D")} changes; ${plan.creates.length} new payments; ${plan.partnerCreates.length} partners to create (${plan.partnerCreates.map((p) => p.key).join(", ")})`);
  if (!APPLY) {
    console.log("Summary only. Add --apply to write.");
    return;
  }
  const { error: probe } = await db.from("transactions").select("proposal_transaction_id").limit(1);
  if (probe) throw new Error(`Migration 20261103100000 not applied: ${probe.message}`);

  const now = new Date().toISOString();
  const newIds = new Map<string, number>();
  const value = (v: unknown) => {
    if (v === "now") return now;
    if (typeof v === "string" && v.startsWith("new:")) {
      const id = newIds.get(v.slice(4));
      if (!id) throw new Error(`Partner ${v} was not created`);
      return id;
    }
    return v;
  };
  const save = () => fs.writeFileSync(LOG, JSON.stringify(log, null, 2));
  const fail = (step: string, e: { message: string }) => {
    save();
    throw new Error(`${step}: ${e.message}. Written so far is in ${LOG}`);
  };

  // 1. partners
  const details: Record<string, Record<string, unknown>> = fs.existsSync(DETAILS) ? JSON.parse(fs.readFileSync(DETAILS, "utf8")) : {};
  for (const pc of plan.partnerCreates) {
    const { data: row, error } = await db.from(pc.table).insert({ ...pc.row, ...details[pc.key] } as never).select("id").single();
    if (error) fail(`create ${pc.table} ${pc.key}`, error);
    newIds.set(pc.key, row!.id);
    log.partners.push({ key: pc.key, table: pc.table, id: row!.id });
    console.log(`+ ${pc.table} #${row!.id} ${pc.row.title} (${pc.key})`);
  }

  // 2–3. transactions: soft-deletes first (the sheet_ref unique index ignores deleted rows), then the rest
  const update = async (c: Change) => {
    const set: Record<string, unknown> = { updated_at: now };
    for (const [k, v] of Object.entries(c.set)) set[k] = value(v);
    const { error } = await db.from(c.table).update(set as never).eq("id", c.id!);
    if (error) fail(`${c.table} #${c.id} ${JSON.stringify(c.set)}`, error);
    log.changes.push({ table: c.table, id: c.id!, set, before: c.before, why: c.why, rule: c.rule });
  };
  const txChanges = plan.changes.filter((c) => c.table === "transactions");
  for (const c of txChanges.filter((c) => "deleted_at" in c.set)) await update(c);
  for (const c of txChanges.filter((c) => !("deleted_at" in c.set))) await update(c);
  console.log(`~ ${txChanges.length} transaction rows updated`);

  // 4. split payments: the new rows take the proposal of the payment they were split from
  const allocated = new Map<number, unknown>();
  for (const c of txChanges) if ("proposal_transaction_id" in c.set) allocated.set(c.id!, c.set.proposal_transaction_id);
  const estimated = new Map<number, unknown>();
  for (const c of txChanges) if ("date_estimated" in c.set) estimated.set(c.id!, c.set.date_estimated);
  for (const cr of plan.creates) {
    const { allocate_like, ...row } = cr.row as Record<string, unknown> & { allocate_like?: number };
    const like = allocate_like ? txById.get(allocate_like) : undefined;
    if (allocate_like) {
      row.proposal_transaction_id = allocated.get(allocate_like) ?? null;
      row.date_estimated = estimated.get(allocate_like) ?? false;
      row.method = like?.method ?? null;
    }
    const { data: made, error } = await db.from("transactions").insert(row as never).select("id").single();
    if (error) fail(`create payment ${JSON.stringify(row)}`, error);
    log.created.push({ id: made!.id, why: cr.why });
  }
  console.log(`+ ${plan.creates.length} payments created`);

  // 5. projects
  const pjChanges = plan.changes.filter((c) => c.table === "projects");
  for (const c of pjChanges) await update(c);
  console.log(`~ ${pjChanges.length} projects updated`);

  // 6. mirror rows: a moved sheet_ref / portal link means the sheet or portal row now points at the kept proposal
  for (const c of txChanges) {
    if (typeof c.set.sheet_ref === "string") {
      const sheetId = Number(c.set.sheet_ref.split(":")[0]);
      const rec = data.sheet.find((s) => s.id === sheetId);
      if (rec && rec.transaction_id !== c.id) {
        const { error } = await db.from("sheet_proposals").update({ transaction_id: c.id }).eq("id", sheetId);
        if (error) fail(`sheet_proposals #${sheetId}`, error);
        log.repointed.push({ table: "sheet_proposals", id: sheetId, from: rec.transaction_id, to: c.id! });
      }
    }
    if (typeof c.set.portal_proposal_id === "number") {
      const rec = data.portal.find((p) => p.id === c.set.portal_proposal_id);
      if (rec && rec.transaction_id !== c.id) {
        const { error } = await db.from("portal_proposals").update({ transaction_id: c.id }).eq("id", rec.id);
        if (error) fail(`portal_proposals #${rec.id}`, error);
        log.repointed.push({ table: "portal_proposals", id: rec.id, from: rec.transaction_id, to: c.id! });
      }
    }
  }
  save();
  console.log(`Done. Log: ${LOG}`);

  // Re-plan on fresh data: what is left should be notes only.
  const again = buildPlan(await loadFixData());
  console.log(`Re-check: ${again.changes.length} changes and ${again.creates.length} new rows still planned (expected 0 / 0).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
