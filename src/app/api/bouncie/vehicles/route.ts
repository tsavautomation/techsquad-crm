import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { bouncieConfigured, fetchVehicles, isConnected } from "@/lib/bouncie/client";
import { matchVehicles, VEHICLES_PERMISSION, type FleetVehicle, type VehiclesResponse } from "@/lib/bouncie/match";
import { fromDateTimeLocalET, todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { addDays } from "@/lib/schedule/dates";

/**
 * Live positions for the Schedule map, polled by the browser. Only people who may open the Fleet list
 * see the vans (SPEC §9.1 F8-b). The Bouncie token never leaves the server; Fleet records are read with
 * the person's own permissions.
 */
export async function GET() {
  const s = await getSession();
  if (s.status !== "active") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!s.user.isSysadmin && !s.user.permissions.has(VEHICLES_PERMISSION)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const fetchedAt = new Date().toISOString();
  if (!bouncieConfigured() || !(await isConnected())) return NextResponse.json({ connected: false, vehicles: [], fetchedAt } satisfies VehiclesResponse);
  try {
    const db = await recordsDb();
    // F10-a: today's visits say who has each van; Fleet › Usual driver is only the fallback.
    const today = todayET();
    const [live, { data: fleet }, { data: todays }] = await Promise.all([
      fetchVehicles(),
      db.from("vehicles").select("id, title, vin, bouncie_imei, driver_id").is("deleted_at", null),
      db
        .from("visits")
        .select("vehicle_id, technician_id")
        .gte("starts_at", fromDateTimeLocalET(`${today}T00:00`))
        .lt("starts_at", fromDateTimeLocalET(`${addDays(today, 1)}T00:00`))
        .not("vehicle_id", "is", null)
        .not("technician_id", "is", null)
        .neq("status", "Cancelled")
        .is("deleted_at", null)
        .order("starts_at"),
    ]);
    const rows = (fleet ?? []) as FleetVehicle[];
    const todayDrivers = new Map<number, number>();
    for (const v of (todays ?? []) as { vehicle_id: number; technician_id: number }[]) if (!todayDrivers.has(v.vehicle_id)) todayDrivers.set(v.vehicle_id, v.technician_id);
    const driverIds = [...new Set([...rows.map((r) => r.driver_id), ...todayDrivers.values()].filter((id): id is number => id !== null))];
    const { data: emp } = driverIds.length ? await db.from("employees").select("id, title").in("id", driverIds) : { data: [] };
    const names = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
    return NextResponse.json({ connected: true, vehicles: matchVehicles(live, rows, names, todayDrivers), fetchedAt } satisfies VehiclesResponse, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ connected: true, vehicles: [], fetchedAt, error: e instanceof Error ? e.message : String(e) } satisfies VehiclesResponse, { headers: { "Cache-Control": "no-store" } });
  }
}
