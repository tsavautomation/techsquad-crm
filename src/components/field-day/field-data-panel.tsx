import { recordsDb } from "@/lib/records/data";
import { adminDb } from "@/lib/supabase/admin";
import { FieldDataForm, type FieldEntry } from "./field-data-form";

// J-n (Jessica 2026-10-20, item 5): the office corrects a visit's field data — status, the three times and the
// time-clock entries (phone positions) behind them. Shown to whoever may change visits (the page checks).

export async function FieldDataPanel({ visitId }: { visitId: number }) {
  const db = await recordsDb();
  const { data } = await db.from("visits").select("id, status, on_way_at, checked_in_at, checked_out_at, deleted_at").eq("id", visitId).maybeSingle();
  const v = data as { id: number; status: string | null; on_way_at: string | null; checked_in_at: string | null; checked_out_at: string | null; deleted_at: string | null } | null;
  if (!v || v.deleted_at) return null;
  // Entries are the technicians' own rows (RLS): read with the service role, names through the public view.
  const { data: rows } = await adminDb().from("time_entries").select("id, kind, at, place, distance_m, lat, lng, employee_id").eq("visit_id", visitId).is("deleted_at", null).order("at");
  const list = (rows ?? []) as { id: number; kind: string; at: string; place: string; distance_m: number | null; lat: number | null; lng: number | null; employee_id: number }[];
  const ids = [...new Set(list.map((e) => e.employee_id))];
  const { data: emp } = ids.length ? await db.from("employee_names").select("id, title").in("id", ids) : { data: [] };
  const name = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
  const entries: FieldEntry[] = list.map((e) => ({ id: e.id, kind: e.kind, at: e.at, place: e.place, distance_m: e.distance_m, lat: e.lat, lng: e.lng, who: name.get(e.employee_id) ?? `#${e.employee_id}` }));
  return <FieldDataForm visitId={v.id} status={v.status ?? "Scheduled"} times={{ on_way_at: v.on_way_at, checked_in_at: v.checked_in_at, checked_out_at: v.checked_out_at }} entries={entries} />;
}
