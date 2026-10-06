import "server-only";
import { recordsDb } from "@/lib/records/data";

// F20: the warnings a person still has to acknowledge (own rows only, by RLS).

export type FieldWarning = { id: number; kind: "forgot_checkout" | "forgot_clock_out" | "missing_report"; day: string; visit_id: number | null; project: string | null; closed_at: string | null };

export async function loadMyWarnings(): Promise<FieldWarning[]> {
  const db = await recordsDb();
  const { data } = await db.from("field_warnings").select("id, kind, day, visit_id, project, closed_at").is("acknowledged_at", null).order("day", { ascending: false }).order("id").limit(50);
  return (data ?? []) as FieldWarning[];
}
