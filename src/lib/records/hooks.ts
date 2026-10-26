import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Values } from "@/lib/rules/evaluate";
import { seriesStarts, type RepeatRule } from "@/lib/schedule/series";
import type { TableDef } from "@/registry/types";
import { syncJoin } from "./relations";
import { buildTitle } from "./title";
import { surveyPlace, isSurvey } from "@/lib/schedule/survey";
import type { Address } from "./values";

// Table-specific follow-ups after a record is created through saveRecord (one write path).
// A hook returns an error message, or nothing when all went well.

type AfterCreate = (db: SupabaseClient, t: TableDef, id: number, values: Values, row: Record<string, unknown>) => Promise<string | void>;

/** Visit with "Repeat": create the rest of the series as their own visits, linked by series_id. */
const visitSeries: AfterCreate = async (db, t, id, values, row) => {
  const rule = values.repeat as RepeatRule | null;
  const count = Number(values.repeat_count);
  if (!rule || !(count > 1) || typeof values.starts_at !== "string") return;
  const series = randomUUID();
  await db.from(t.name).update({ series_id: series }).eq("id", id);
  const team = t.fields.find((f) => f.name === "team_ids")!;
  const starts = seriesStarts(values.starts_at, rule, count).slice(1);
  for (const starts_at of starts) {
    const copy: Record<string, unknown> = { ...row, starts_at, series_id: series, status: "Scheduled" };
    copy.title = await buildTitle(t, { ...values, starts_at }, null, db);
    const { data, error } = await db.from(t.name).insert(copy).select("id").single();
    if (error || !data) return `The first visit was saved, but the series stopped: ${error?.message ?? "unknown error"}`;
    await syncJoin(db, t, team, (data as { id: number }).id, (values.team_ids as number[] | null) ?? []);
  }
};

/** Visit made with "Schedule return" (F2): the return card now points at it and is being worked on. */
const linkReturnCard: AfterCreate = async (db, _t, id, values) => {
  const task = values.return_task_id;
  if (typeof task !== "number") return;
  const { error } = await db.from("tasks").update({ visit_id: id, status: "Working" }).eq("id", task);
  if (error) return `The visit was saved, but the return card wasn't updated: ${error.message}`;
};

const visitCreated: AfterCreate = async (...args) => (await visitSeries(...args)) || (await linkReturnCard(...args));

export const AFTER_CREATE: Record<string, AfterCreate> = { visits: visitCreated };

// ---------------------------------------------------------------- titles that formulas cannot make (SV, Fred 2026-10-26)

/**
 * A survey visit is "SURVEY – <address or contact> – <date> – <technician>" and its report
 * "SURVEY – <address or contact> – <technicians> – <date>": the formula with the place where the project would be.
 * Null when the ordinary formula applies.
 */
export async function titleOverride(db: SupabaseClient, t: TableDef, values: Values): Promise<string | null> {
  if (t.name === "visits") {
    if (!isSurvey(values.kind as string | null) || values.project_id) return null;
    const place = surveyPlace(values.address as Address | null, values.contact_name as string | null);
    return buildTitle(t, { ...values, project_id: null, subject: place ? `SURVEY – ${place}` : "SURVEY" }, null, db);
  }
  if (t.name === "job_reports") {
    if (values.project_id || typeof values.visit_id !== "number") return null;
    const { data } = await db.from("visits").select("kind, address, contact_name").eq("id", values.visit_id).maybeSingle();
    const v = data as { kind: string | null; address: Address | null; contact_name: string | null } | null;
    if (!v || !isSurvey(v.kind)) return null;
    const place = surveyPlace(v.address, v.contact_name);
    const rest = (await buildTitle(t, { ...values, project_id: null }, null, db)) ?? "";
    return `SURVEY${place ? ` – ${place}` : ""}${rest}`;
  }
  return null;
}
