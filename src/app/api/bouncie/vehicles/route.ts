import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { bouncieConfigured, fetchVehicles, isConnected } from "@/lib/bouncie/client";
import { matchVehicles, VEHICLES_PERMISSION, type FleetVehicle, type VehiclesResponse } from "@/lib/bouncie/match";
import { recordsDb } from "@/lib/records/data";

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
    const [live, { data: fleet }] = await Promise.all([fetchVehicles(), db.from("vehicles").select("id, title, vin, bouncie_imei, driver_id").is("deleted_at", null)]);
    const rows = (fleet ?? []) as FleetVehicle[];
    const driverIds = [...new Set(rows.map((r) => r.driver_id).filter((id): id is number => id !== null))];
    const { data: emp } = driverIds.length ? await db.from("employees").select("id, title").in("id", driverIds) : { data: [] };
    const names = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
    return NextResponse.json({ connected: true, vehicles: matchVehicles(live, rows, names), fetchedAt } satisfies VehiclesResponse, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ connected: true, vehicles: [], fetchedAt, error: e instanceof Error ? e.message : String(e) } satisfies VehiclesResponse, { headers: { "Cache-Control": "no-store" } });
  }
}
