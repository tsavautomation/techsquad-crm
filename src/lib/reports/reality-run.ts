import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTrips, isConnected } from "@/lib/bouncie/client";
import { fromDateTimeLocalET, toDateTimeLocalET } from "@/lib/dates";
import { loadFieldDay } from "@/lib/field-day/return-card";
import type { Address } from "@/lib/records/values";
import { addDays } from "@/lib/schedule/dates";
import { geocode } from "@/lib/time-clock/geocode";
import { loadDayEntries } from "@/lib/time-clock/record";
import { realityFlags, type RealityFlag, type RealityTrip } from "./reality";

// F19-b Report vs. reality: run when a Job Report is reviewed (F17 runner). Gathers the visit, the
// technician's time-clock entries that day, the office position, and the van's Bouncie trips, hands
// them to the pure engine and stores the flags on the report and on the visit (the calendar tile reads them).

type Report = { id: number; visit_id: number | null; project_id: number | null; vehicle_id: number | null; date: string | null; team: { target_id: number }[] };
type Visit = { id: number; starts_at: string | null; on_way_at: string | null; checked_in_at: string | null; checked_out_at: string | null; vehicle_id: number | null; project_id: number | null; projects: { job_address: Address | null } | null };

const line = (a: Address | null) => (a ? [a.street, a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "") || null;

export async function realityCheckForReport(db: SupabaseClient, reportId: number): Promise<string | null> {
  const { data } = await db.from("job_reports").select("id, visit_id, project_id, vehicle_id, date, team:job_reports_team(target_id)").eq("id", reportId).maybeSingle();
  const r = data as unknown as Report | null;
  if (!r) return null;
  let visit: Visit | null = null;
  const cols = "id, starts_at, on_way_at, checked_in_at, checked_out_at, vehicle_id, project_id, projects(job_address)";
  if (r.visit_id) {
    const { data: v } = await db.from("visits").select(cols).eq("id", r.visit_id).maybeSingle();
    visit = v as unknown as Visit | null;
  } else if (r.project_id && r.date) {
    const { data: v } = await db.from("visits").select(cols).eq("project_id", r.project_id).gte("starts_at", fromDateTimeLocalET(`${r.date}T00:00`)).lt("starts_at", fromDateTimeLocalET(`${addDays(r.date, 1)}T00:00`)).is("deleted_at", null).not("checked_in_at", "is", null).limit(1);
    visit = ((v ?? []) as unknown as Visit[])[0] ?? null;
  }
  if (!visit) return null;
  const tech = r.team[0]?.target_id ?? null;
  const day = visit.checked_in_at ? toDateTimeLocalET(visit.checked_in_at).slice(0, 10) : r.date;
  const settings = await loadFieldDay(db);
  const office = settings.time_clock.office_lat !== null && settings.time_clock.office_lng !== null ? { lat: settings.time_clock.office_lat, lng: settings.time_clock.office_lng } : null;
  const [entries, site] = await Promise.all([tech && day ? loadDayEntries(db, tech, day) : Promise.resolve([]), geocode(db, line(visit.projects?.job_address ?? null))]);

  // The van's trips that day (only when Bouncie is connected and the visit's van has a device).
  let trips: RealityTrip[] | null = null;
  let tripNote: string | null = null;
  if (visit.vehicle_id && day && (await isConnected().catch(() => false))) {
    const { data: veh } = await db.from("vehicles").select("bouncie_imei").eq("id", visit.vehicle_id).maybeSingle();
    const imei = (veh as { bouncie_imei: string | null } | null)?.bouncie_imei;
    if (imei) {
      try {
        trips = await fetchTrips(imei, fromDateTimeLocalET(`${day}T00:00`), fromDateTimeLocalET(`${addDays(day, 1)}T00:00`));
      } catch (e) {
        tripNote = `van trips not read: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }
  const flags: RealityFlag[] = realityFlags({
    visit: { starts_at: visit.starts_at, on_way_at: visit.on_way_at, checked_in_at: visit.checked_in_at, checked_out_at: visit.checked_out_at, vehicle_id: visit.vehicle_id, site },
    report: { vehicle_id: r.vehicle_id },
    entries: entries.map((e) => ({ kind: e.kind, at: e.at, place: e.place, lat: e.lat, lng: e.lng })),
    office,
    trips,
    thresholdMin: settings.report_rule.threshold_min,
    graceMin: settings.report_rule.grace_min,
  });
  await Promise.all([db.from("job_reports").update({ reality_flags: flags }).eq("id", r.id), db.from("visits").update({ reality_flags: flags }).eq("id", visit.id)]);
  const warn = flags.filter((f) => f.level === "warn").length;
  return [warn ? `reality check: ${warn} mismatch${warn === 1 ? "" : "es"} flagged` : "reality check: nothing to flag", tripNote].filter(Boolean).join("; ");
}
