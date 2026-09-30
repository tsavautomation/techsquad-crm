import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Values } from "@/lib/rules/evaluate";
import { seriesStarts, type RepeatRule } from "@/lib/schedule/series";
import type { TableDef } from "@/registry/types";
import { syncJoin } from "./relations";
import { buildTitle } from "./title";

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

export const AFTER_CREATE: Record<string, AfterCreate> = { visits: visitSeries };
