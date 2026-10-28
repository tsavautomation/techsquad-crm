import type { SupabaseClient } from "@supabase/supabase-js";
import { suggestProjects, type ProjectLite, type Suggestion } from "@/lib/portalio/match";
import { planSheetLink, type SheetExistingTx, type SheetRow } from "./sheet";

// FIN-m: linking a sheet row to a project, and the suggestions for a row. No framework imports: the import script
// (scripts/import-sales-sheet.ts) and the server actions both call this with their own Supabase client.

export const SHEET_COLS = "id, number, main_number, change_order, year, date, customer, designer, commission, title, amount, payments, discount, cc_fee, tip, commission_amount, status, receivable, probability, notes, row_key, suggestions, link_status, project_id, transaction_id, auto_linked, linked_at";
export type SheetRowRecord = SheetRow & { id: number; suggestions: Suggestion[] | null; link_status: "new" | "linked" | "ignored"; project_id: number | null; transaction_id: number | null; auto_linked: boolean; linked_at: string | null };

const TX_COLS = "id, type, amount, date, portal_number, portal_proposal_id, portal_request_id, portal_change_order_id, is_change_order, sheet_ref, cc_fee, tip, discount";

/** The sheet row as the suggestion rule sees it: the number, the title without its prefix, the customer text (often an address). */
export function sheetSuggestions(row: SheetRow, projects: ProjectLite[], txByNumber: Map<string, number[]>, mirrorLinks: Map<number, { project_id: number; title: string | null }>): Suggestion[] {
  const out: Suggestion[] = [];
  const linked = row.main_number ? mirrorLinks.get(row.main_number) : undefined;
  if (linked) out.push({ id: linked.project_id, title: `${linked.title ?? "Project"} (#${linked.project_id})`, reason: `Portal.io proposal #${row.main_number} is linked to this project`, score: 100 });
  const customer = (row.customer ?? "").trim();
  const street = /^\d/.test(customer) ? customer.split(/[:,]/)[0] : null;
  const who = customer.includes(":") ? customer.split(":").pop()!.trim() : customer;
  const [firstName, ...rest] = who.split(/\s+/);
  const more = suggestProjects({ number: row.main_number, name: row.title, customer: { firstName: firstName ?? null, lastName: rest.join(" ") || null }, location: street ? { street } : null }, projects, txByNumber);
  for (const s of more) if (!out.some((x) => x.id === s.id)) out.push(s);
  return out.slice(0, 5);
}

export type SheetLinkSummary = { created: number; updated: number; notes: string[]; transactionId: number | null };

/** History line on the project (audit_log; actor = the person, or null for the import). */
async function history(db: SupabaseClient, projectId: number, actor: string | null, note: string) {
  await db.from("audit_log").insert({ table_name: "projects", record_id: projectId, action: "update", actor, changes: { sheet_import: [null, note] } });
}

/**
 * Link one sheet row to a project: the Approved Proposal (adopted when the project already has it from Portal.io or
 * by hand) and the monthly Payments (adopted by amount), then the row's extras: reliability on the Job Owner when
 * empty, Comm $ on the project when empty, the payment note as a project note.
 */
export async function linkSheetRow(db: SupabaseClient, rowId: number, projectId: number, opts: { actor?: string | null; auto?: boolean } = {}): Promise<{ ok: true; summary: SheetLinkSummary } | { ok: false; message: string }> {
  const { data } = await db.from("sheet_proposals").select(SHEET_COLS).eq("id", rowId).maybeSingle();
  const row = data as unknown as SheetRowRecord | null;
  if (!row) return { ok: false, message: "This sheet row is no longer there." };
  if (row.link_status === "linked" && row.project_id) return { ok: false, message: "This row is already linked." };
  const { data: tx } = await db.from("transactions").select(TX_COLS).eq("project_id", projectId).eq("payment_type", "Apply to Project").is("deleted_at", null).limit(2000);
  const existing = (tx ?? []) as SheetExistingTx[];
  const plan = planSheetLink(rowId, row, projectId, existing);
  const summary: SheetLinkSummary = { created: 0, updated: 0, notes: plan.notes, transactionId: null };
  for (const c of plan.create) {
    const { data: ins, error } = await db.from("transactions").insert({ ...c, created_by: opts.actor ?? null }).select("id").single();
    if (error) return { ok: false, message: `Could not write ${String(c.type)}: ${error.message}` };
    summary.created++;
    if (c.type === "Proposal") summary.transactionId = (ins as { id: number }).id;
  }
  for (const u of plan.update) {
    const { error } = await db.from("transactions").update(u.set).eq("id", u.id);
    if (error) return { ok: false, message: `Could not update a transaction: ${error.message}` };
    summary.updated++;
    if (u.why === "proposal") summary.transactionId = u.id;
  }
  if (!summary.transactionId) summary.transactionId = existing.find((t) => t.sheet_ref === `${rowId}:proposal`)?.id ?? null;
  // ---- extras
  const { data: pr } = await db.from("projects").select("title, commission_amount, job_owner_id").eq("id", projectId).maybeSingle();
  const project = pr as { title: string | null; commission_amount: number | null; job_owner_id: number | null } | null;
  if (row.commission_amount && project && !project.commission_amount) {
    await db.from("projects").update({ commission_amount: row.commission_amount }).eq("id", projectId);
    summary.notes.push(`commission ${row.commission_amount} set on the project`);
  }
  if (row.probability && project?.job_owner_id) {
    const level = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" }[row.probability];
    if (level) {
      const { data: c } = await db.from("contacts").select("payment_reliability").eq("id", project.job_owner_id).maybeSingle();
      if (c && !(c as { payment_reliability: string | null }).payment_reliability) {
        await db.from("contacts").update({ payment_reliability: level }).eq("id", project.job_owner_id);
        summary.notes.push(`Payment Reliability ${level} set on the Job Owner`);
      }
    }
  }
  if (row.notes) await db.from("record_notes").insert({ table_name: "projects", record_id: projectId, body: `Sales Projections sheet, ${row.number ?? ""}: ${row.notes}`, created_by: opts.actor ?? null });
  await db.from("sheet_proposals").update({ link_status: "linked", project_id: projectId, transaction_id: summary.transactionId, auto_linked: Boolean(opts.auto), linked_at: new Date().toISOString(), linked_by: opts.actor ?? null }).eq("id", rowId);
  const how = opts.auto ? "linked automatically (its Portal.io proposal is linked to this project)" : "linked";
  await history(db, projectId, opts.actor ?? null, `Sales Projections sheet row ${row.number ?? ""} "${row.title ?? ""}" (${row.amount}) ${how}: ${summary.created} transactions created, ${summary.updated} adopted${summary.notes.length ? `; ${summary.notes.join("; ")}` : ""}`);
  return { ok: true, summary };
}

/** The rows of the sheet whose Portal.io number was just linked to a project: they follow it (same proposal, same money). */
export async function linkSheetRowsByNumber(db: SupabaseClient, number: number | null, projectId: number, actor: string | null): Promise<number> {
  if (!number) return 0;
  const { data } = await db.from("sheet_proposals").select("id").eq("main_number", number).eq("link_status", "new");
  let n = 0;
  for (const r of (data ?? []) as { id: number }[]) {
    const res = await linkSheetRow(db, r.id, projectId, { actor, auto: true });
    if (res.ok) n++;
  }
  return n;
}
