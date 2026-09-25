import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import type { TableDef } from "@/registry/types";
import { conditionsMatch, eventsForChange, renderTokens, type Conditions } from "./conditions";
import { cardHtml, deliver, queueEmail, type OutboxAttachment } from "./email";
import { cardFields, displayStrings, loadEngineRecord, type EngineRecord } from "./record-view";

// Automations engine (SPEC §5). Data-driven: every WebAuthor trigger is a row in public.automations.
//
// Event runs: after each request, pending change-history rows (audit_log.automation_status is null)
// are claimed and matched against automations for their table. Rows written by the engine itself
// (actor = null) are skipped, so an automation's own update can't set off another round.
// Scheduled runs ('daily' / 'hourly', M11) check every live record of the table.

export type Action =
  | { type: "update"; set: Record<string, unknown> }
  | { type: "archive" }
  | { type: "checklist"; target?: string; item: string }
  | { type: "email"; from: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; card?: boolean; link?: boolean; pdf?: boolean; files?: string[] };

export type Automation = { id: number; table_name: string; title: string; events: string[]; conditions: Conditions; actions: Action[] };

type AuditRow = { id: number; table_name: string; record_id: number; action: string; changes: Record<string, unknown>; actor: string | null };

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

async function activeAutomations(db: SupabaseClient, table?: string): Promise<Automation[]> {
  let q = db.from("automations").select("id, table_name, title, events, conditions, actions").eq("active", true);
  if (table) q = q.eq("table_name", table);
  const { data, error } = await q.order("id");
  if (error) throw new Error(`Could not load automations: ${error.message}`);
  return (data ?? []) as Automation[];
}

/** Run one automation's actions on one record. Returns what it did (empty = nothing to do). */
async function runActions(db: SupabaseClient, a: Automation, t: TableDef, rec: EngineRecord): Promise<string[]> {
  const did: string[] = [];
  let display: Record<string, string> | null = null;
  const show = async () => (display ??= await displayStrings(db, t, rec));

  for (const action of a.actions) {
    switch (action.type) {
      case "update": {
        // Only write fields whose value actually changes, so daily re-checks leave no noise in History.
        const patch = Object.fromEntries(Object.entries(action.set).filter(([k, v]) => (rec.values[k] ?? null) !== v));
        if (!Object.keys(patch).length) break;
        const { error } = await db.from(t.name).update(patch).eq("id", rec.id);
        if (error) throw new Error(`update: ${error.message}`);
        Object.assign(rec.values, patch);
        display = null;
        did.push(`set ${Object.entries(patch).map(([k, v]) => `${k} = ${v ?? "empty"}`).join(", ")}`);
        break;
      }
      case "archive": {
        const { data } = await db.from(t.name).update({ archived_at: new Date().toISOString() }).eq("id", rec.id).is("archived_at", null).select("id");
        if (data?.length) did.push("archived");
        break;
      }
      case "checklist": {
        const item = renderTokens(action.item, (f) => String(rec.values[f] ?? "")).trim();
        if (!item) break;
        let table = t.name;
        let id: number | null = rec.id;
        if (action.target) {
          const f = t.fields.find((x) => x.name === action.target);
          table = f?.lookup?.table ?? "";
          id = (rec.values[action.target] as number | null) ?? null;
        }
        if (!table || !id) break;
        const source = `${t.name}:${rec.id}`;
        // Once per source and item: a re-run never duplicates the checklist entry.
        const { data: existing } = await db.from("record_checklist_items").select("id").eq("table_name", table).eq("record_id", id).eq("source", source).eq("item", item).limit(1);
        if (existing?.length) break;
        const { error } = await db.from("record_checklist_items").insert({ table_name: table, record_id: id, item, source, created_by: null });
        if (error) throw new Error(`checklist: ${error.message}`);
        did.push(`checklist item on ${table} #${id}`);
        break;
      }
      case "email": {
        const d = await show();
        const token = (f: string) => d[f] ?? String(rec.values[f] ?? "");
        const addresses = (list?: string[]) => [...new Set((list ?? []).map((x) => renderTokens(x, token).trim().toLowerCase()).filter((x) => EMAIL_RE.test(x)))];
        const to = addresses(action.to);
        const bcc = addresses(action.bcc);
        if (!to.length && !bcc.length) {
          did.push("email skipped: no valid recipient");
          break;
        }
        const title = rec.title ?? `${t.itemLabel} #${rec.id}`;
        const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
        const html = cardHtml({
          title,
          tableLabel: t.label,
          fields: action.card ? cardFields(t, rec, d) : [],
          link: action.link && site ? `${site}${recordHref(t, rec.id)}` : undefined,
        });
        const attachments: OutboxAttachment[] = [];
        if (action.pdf) attachments.push({ kind: "record_pdf" });
        for (const f of action.files ?? []) for (const file of rec.files[f] ?? []) attachments.push({ kind: "file", path: file.path, name: file.name, size: file.size });
        const id = await queueEmail(db, {
          automationId: a.id,
          table: t.name,
          recordId: rec.id,
          from: action.from,
          to: to.length ? to : bcc.slice(0, 1),
          bcc: to.length ? bcc : bcc.slice(1),
          subject: renderTokens(action.subject, token).replace(/\s+/g, " ").trim() || title,
          html,
          attachments,
        });
        const sent = await deliver(db, id);
        const redirected = process.env.EMAIL_TEST_MODE !== "false" ? ` (test mode: sent to ${process.env.EMAIL_TEST_RECIPIENT || "fred@tsav.net"})` : "";
        did.push(sent.ok ? `email to ${to.join(", ")}${redirected}` : `email failed (${sent.error})`);
        break;
      }
    }
  }
  return did;
}

async function logRun(db: SupabaseClient, a: Automation, recordId: number, event: string, status: "done" | "error", detail: Record<string, unknown>) {
  await db.from("automation_runs").insert({ automation_id: a.id, table_name: a.table_name, record_id: recordId, event, status, detail });
}

/** Check one automation against one record and run it if the conditions hold. */
async function apply(db: SupabaseClient, a: Automation, t: TableDef, rec: EngineRecord, event: string) {
  if (!conditionsMatch(a.conditions, rec.values)) return;
  try {
    const did = await runActions(db, a, t, rec);
    if (did.length) await logRun(db, a, rec.id, event, "done", { actions: did });
  } catch (e) {
    await logRun(db, a, rec.id, event, "error", { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Process new change-history rows. Rows are claimed first (marked 'done'), so two
 * overlapping calls never run the same automation twice.
 */
export async function processPendingEvents(limit = 50): Promise<{ processed: number }> {
  if (!hasAdminKey()) return { processed: 0 };
  const db = adminDb();
  const { data: pending } = await db.from("audit_log").select("id").is("automation_status", null).order("id").limit(limit);
  const ids = ((pending ?? []) as { id: number }[]).map((r) => r.id);
  if (!ids.length) return { processed: 0 };

  const { data: claimed } = await db
    .from("audit_log")
    .update({ automation_status: "done" })
    .in("id", ids)
    .is("automation_status", null)
    .select("id, table_name, record_id, action, changes, actor");
  const rows = ((claimed ?? []) as AuditRow[]).sort((x, y) => x.id - y.id);

  const byTable = new Map<string, Automation[]>();
  const ran = new Set<string>(); // one run per automation and record per batch
  for (const row of rows) {
    if (!row.actor) continue; // engine / workflow writes
    const events = eventsForChange(row.action, row.changes ?? {});
    if (!events.length) continue;
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, await activeAutomations(db, row.table_name));
    const matching = byTable.get(row.table_name)!.filter((a) => a.events.some((e) => events.includes(e)));
    if (!matching.length) continue;

    let t: TableDef;
    try {
      t = getTable(row.table_name);
    } catch {
      continue;
    }
    const rec = await loadEngineRecord(db, t, row.record_id);
    if (!rec || rec.deleted) continue;
    for (const a of matching) {
      const key = `${a.id}:${rec.id}`;
      if (ran.has(key)) continue;
      ran.add(key);
      await apply(db, a, t, rec, a.events.find((e) => events.includes(e))!);
    }
  }
  if (ids.length === limit) return { processed: rows.length + (await processPendingEvents(limit)).processed };
  return { processed: rows.length };
}

/** Scheduled check ('daily' / 'hourly'): every live record of each table with such an automation. */
export async function runScheduled(kind: "daily" | "hourly"): Promise<{ checked: number }> {
  const db = adminDb();
  const autos = (await activeAutomations(db)).filter((a) => a.events.includes(kind));
  let checked = 0;
  for (const table of new Set(autos.map((a) => a.table_name))) {
    const t = getTable(table);
    const { data } = await db.from(table).select("id").is("deleted_at", null).order("id");
    for (const { id } of (data ?? []) as { id: number }[]) {
      const rec = await loadEngineRecord(db, t, id);
      if (!rec) continue;
      checked++;
      for (const a of autos.filter((x) => x.table_name === table)) await apply(db, a, t, rec, kind);
    }
  }
  return { checked };
}

/** Called from server actions via next/server after(): never lets an automation problem break a save. */
export async function runAutomationsSafely() {
  try {
    await processPendingEvents();
  } catch (e) {
    console.error("automations:", e);
  }
}
