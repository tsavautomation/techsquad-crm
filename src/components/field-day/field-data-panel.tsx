import { recordsDb } from "@/lib/records/data";
import { adminDb } from "@/lib/supabase/admin";
import { FieldDataForm, type FieldEntry, type FieldPerson } from "./field-data-form";

// J-n (Jessica 2026-10-20, item 5) + F29 (per person): the office corrects a visit's field data — each person's
// three times — and the time-clock entries (phone positions) behind them. Shown to whoever may change visits.

export async function FieldDataPanel({ visitId }: { visitId: number }) {
  const db = await recordsDb();
  const { data } = await db.from("visits").select("id, status, technician_id, deleted_at, visits_team(target_id)").eq("id", visitId).maybeSingle();
  const v = data as { id: number; status: string | null; technician_id: number | null; deleted_at: string | null; visits_team: { target_id: number }[] } | null;
  if (!v || v.deleted_at) return null;
  const admin = adminDb();
  // Entries are the technicians' own rows (RLS): read with the service role, names through the public view.
  const [{ data: rows }, { data: att }] = await Promise.all([
    admin.from("time_entries").select("id, kind, at, place, distance_m, lat, lng, employee_id").eq("visit_id", visitId).is("deleted_at", null).order("at"),
    admin.from("visit_attendance").select("employee_id, on_way_at, checked_in_at, checked_out_at").eq("visit_id", visitId),
  ]);
  const list = (rows ?? []) as { id: number; kind: string; at: string; place: string; distance_m: number | null; lat: number | null; lng: number | null; employee_id: number }[];
  const attendance = (att ?? []) as { employee_id: number; on_way_at: string | null; checked_in_at: string | null; checked_out_at: string | null }[];
  const peopleIds = [...new Set([v.technician_id, ...v.visits_team.map((x) => x.target_id), ...attendance.map((a) => a.employee_id), ...list.map((e) => e.employee_id)].filter((x): x is number => x !== null))];
  const { data: emp } = peopleIds.length ? await db.from("employee_names").select("id, title").in("id", peopleIds) : { data: [] };
  const name = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
  const people: FieldPerson[] = peopleIds.map((id) => {
    const a = attendance.find((x) => x.employee_id === id);
    return { employeeId: id, name: name.get(id) ?? `#${id}`, times: { on_way_at: a?.on_way_at ?? null, checked_in_at: a?.checked_in_at ?? null, checked_out_at: a?.checked_out_at ?? null } };
  });
  const entries: FieldEntry[] = list.map((e) => ({ id: e.id, kind: e.kind, at: e.at, place: e.place, distance_m: e.distance_m, lat: e.lat, lng: e.lng, who: name.get(e.employee_id) ?? `#${e.employee_id}` }));
  return <FieldDataForm visitId={v.id} status={v.status ?? "Scheduled"} people={people} entries={entries} />;
}
