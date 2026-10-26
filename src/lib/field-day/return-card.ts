import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayET } from "@/lib/dates";
import type { EngineRecord } from "@/lib/engine/record-view";
import { buildTitle } from "@/lib/records/title";
import { getTable } from "@/registry";
import type { TableDef } from "@/registry/types";
import { isNotFinished, missingLines, parseFieldDay, pickScheduler, returnCardDetails, returnDueDate, type FieldDaySettings, type ReportForCard } from "./day";

// F2 return cards (docs/portal-features-merge.md §D, SPEC §9.1 F2-c), run by the automation
// "Return card for a partial visit". Once per Job Report; the missing items become the card's checklist.

export async function loadFieldDay(db: SupabaseClient): Promise<FieldDaySettings> {
  const { data } = await db.from("app_settings").select("value").eq("key", "field_day").maybeSingle();
  return parseFieldDay((data as { value: unknown } | null)?.value);
}

/**
 * J-x: who gets a task about this project: the Electrical scheduler for Electrical projects (project Category,
 * else the first technician's department), otherwise the usual scheduler. Null when nobody is set or imported.
 */
export async function resolveScheduler(db: SupabaseClient, settings: FieldDaySettings, projectId: number | null, employeeIds: number[] = []): Promise<number | null> {
  let category: string | null = null;
  if (projectId) {
    const { data } = await db.from("projects").select("category").eq("id", projectId).maybeSingle();
    category = (data as { category: string | null } | null)?.category ?? null;
  }
  let departments: string[] | null = null;
  if (!category && employeeIds.length) {
    const { data } = await db.from("employees").select("departments").eq("id", employeeIds[0]).maybeSingle();
    departments = (data as { departments: string[] | null } | null)?.departments ?? null;
  }
  const id = pickScheduler(settings, category, departments);
  if (!id) return null;
  const { data } = await db.from("employees").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  return data ? id : null; // not imported yet: the card still shows on the Tasks board
}

/** Creates the card and returns what it did, or null when there's nothing to do. */
export async function createReturnCard(db: SupabaseClient, t: TableDef, rec: EngineRecord): Promise<string | null> {
  const v = rec.values;
  if (t.name !== "job_reports" || rec.deleted || !isNotFinished(v.result)) return null;
  const { data: existing } = await db.from("tasks").select("id").eq("job_report_id", rec.id).is("deleted_at", null).limit(1);
  if (existing?.length) return null;

  const settings = await loadFieldDay(db);
  const projectId = typeof v.project_id === "number" ? v.project_id : null;
  const date = typeof v.date === "string" ? v.date : todayET();

  // The project's report before this one also unfinished → "2nd partial in a row": Urgent.
  let second = false;
  if (projectId) {
    const { data } = await db.from("job_reports").select("id, date, result").eq("project_id", projectId).neq("id", rec.id).is("deleted_at", null).lte("date", date).order("date", { ascending: false }).order("id", { ascending: false }).limit(10);
    const before = ((data ?? []) as { id: number; date: string | null; result: string | null }[]).find((r) => (r.date ?? "") < date || r.id < rec.id);
    second = Boolean(before && isNotFinished(before.result));
  }

  const techs = Array.isArray(v.who_can_ids) ? (v.who_can_ids as unknown[]).filter((x): x is number => typeof x === "number") : [];
  const memberId = await resolveScheduler(db, settings, projectId, techs);

  const values: Record<string, unknown> = {
    member_id: memberId,
    status: "Pending",
    priority: second ? "Urgent" : null,
    due_date: returnDueDate(v.partial_reason, todayET(), settings),
    details: returnCardDetails(v as unknown as ReportForCard, second),
    project_id: projectId,
    job_report_id: rec.id,
    labels: second ? ["Return", "Urgent"] : ["Return"],
  };
  values.title = await buildTitle(getTable("tasks"), values, null, db);
  const { data: task, error } = await db.from("tasks").insert(values).select("id").single();
  if (error?.code === "23505") return null; // another run just made it
  if (error || !task) throw new Error(`return card: ${error?.message ?? "not created"}`);
  const id = (task as { id: number }).id;

  const items = missingLines(v.missing_items);
  if (items.length) {
    const { error: e } = await db.from("record_checklist_items").insert(items.map((item) => ({ table_name: "tasks", record_id: id, item, source: `job_reports:${rec.id}`, created_by: null })));
    if (e) throw new Error(`return card checklist: ${e.message}`);
  }
  return `return card: task #${id}${second ? " (2nd in a row, Urgent)" : ""}`;
}
