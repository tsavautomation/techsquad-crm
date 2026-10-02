// F8 Map (SPEC §9.1 F8-b): pure helpers shared by the vehicles API route, the map and the tests.
// Bouncie reports each device with its VIN and IMEI; the Fleet record is found by the IMEI typed in
// "Bouncie device", or else by VIN. No database here.

/** One vehicle as Bouncie reports it, trimmed to what the map needs. */
export type LiveVehicle = {
  imei: string;
  vin: string | null;
  /** Nickname in the Bouncie app, or "year make model". */
  name: string;
  lat: number | null;
  lng: number | null;
  /** Degrees clockwise from north. */
  heading: number | null;
  /** Miles per hour as Bouncie reports it. */
  speed: number | null;
  isRunning: boolean;
  /** ISO time of Bouncie's last update, or null when it never reported. */
  updatedAt: string | null;
  address: string | null;
};

export type FleetVehicle = { id: number; title: string | null; vin: string | null; bouncie_imei: string | null; driver_id: number | null };

/** Who may see the vans on the map: people who can open the Fleet list (and administrators). */
export const VEHICLES_PERMISSION = "administrative.vehicles.view_page";

export type MapVehicle = LiveVehicle & {
  vehicleId: number | null;
  vehicleTitle: string | null;
  driverId: number | null;
  driverName: string | null;
};

/** What /api/bouncie/vehicles answers. */
export type VehiclesResponse = { connected: boolean; vehicles: MapVehicle[]; fetchedAt: string; error?: string };

/** VINs are compared without case, spaces or punctuation (people type them in many ways). */
export const normalizeVin = (vin: string | null | undefined) => (vin ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Pair each Bouncie vehicle with its Fleet record (by Bouncie device, else by VIN) and the usual driver's name. */
export function matchVehicles(live: LiveVehicle[], fleet: FleetVehicle[], driverNames: ReadonlyMap<number, string>): MapVehicle[] {
  const byImei = new Map(fleet.filter((f) => digits(f.bouncie_imei)).map((f) => [digits(f.bouncie_imei), f]));
  const byVin = new Map(fleet.filter((f) => normalizeVin(f.vin)).map((f) => [normalizeVin(f.vin), f]));
  return live.map((v) => {
    const f = byImei.get(digits(v.imei)) ?? (normalizeVin(v.vin) ? byVin.get(normalizeVin(v.vin)) : undefined) ?? null;
    return {
      ...v,
      vehicleId: f?.id ?? null,
      vehicleTitle: f?.title ?? null,
      driverId: f?.driver_id ?? null,
      driverName: f?.driver_id ? (driverNames.get(f.driver_id) ?? null) : null,
    };
  });
}

/** Minutes since Bouncie last heard from the vehicle (null when it never reported). */
export function minutesSince(updatedAt: string | null, now: number = Date.now()): number | null {
  if (!updatedAt) return null;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((now - t) / 60_000));
}

/** Fresh = reported in the last 10 minutes; stale after an hour (the marker is greyed). */
export type Freshness = "fresh" | "recent" | "stale" | "none";
export function freshness(updatedAt: string | null, now: number = Date.now()): Freshness {
  const m = minutesSince(updatedAt, now);
  if (m === null) return "none";
  if (m <= 10) return "fresh";
  if (m <= 60) return "recent";
  return "stale";
}

/** Parse Bouncie's /v1/vehicles response defensively: a vehicle with no position is kept (listed, not drawn). */
export function parseBouncieVehicles(body: unknown): LiveVehicle[] {
  if (!Array.isArray(body)) return [];
  const out: LiveVehicle[] = [];
  for (const raw of body) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as { imei?: unknown; vin?: unknown; nickName?: unknown; model?: { make?: unknown; name?: unknown; year?: unknown }; stats?: { location?: { lat?: unknown; lon?: unknown; heading?: unknown; address?: unknown }; speed?: unknown; isRunning?: unknown; lastUpdated?: unknown } };
    const imei = typeof v.imei === "string" ? v.imei : typeof v.imei === "number" ? String(v.imei) : "";
    if (!imei) continue;
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
    const loc = v.stats?.location;
    const lat = num(loc?.lat);
    const lng = num(loc?.lon);
    const model = [v.model?.year, v.model?.make, v.model?.name].filter((x) => typeof x === "string" || typeof x === "number").join(" ");
    out.push({
      imei,
      vin: typeof v.vin === "string" && v.vin ? v.vin : null,
      name: (typeof v.nickName === "string" && v.nickName.trim()) || model || imei,
      lat: lat !== null && lng !== null ? lat : null,
      lng: lat !== null && lng !== null ? lng : null,
      heading: num(loc?.heading),
      speed: num(v.stats?.speed),
      isRunning: v.stats?.isRunning === true,
      updatedAt: typeof v.stats?.lastUpdated === "string" ? v.stats.lastUpdated : null,
      address: typeof loc?.address === "string" ? loc.address : null,
    });
  }
  return out;
}
