import { describe, expect, it } from "vitest";
import { freshness, matchVehicles, minutesSince, normalizeVin, parseBouncieVehicles, type FleetVehicle, type LiveVehicle } from "@/lib/bouncie/match";

// F8 Map + Bouncie (SPEC §9.1 F8-b): pairing Bouncie's vehicles with Fleet records, and reading its API.

const live = (over: Partial<LiveVehicle> = {}): LiveVehicle => ({
  imei: "123456789012345",
  vin: "1HGBIQOJXMN109186",
  name: "Van 1",
  lat: 26.1,
  lng: -80.2,
  heading: 90,
  speed: 35,
  isRunning: true,
  updatedAt: "2026-10-02T15:00:00.000Z",
  address: "1 Main St",
  ...over,
});
const fleet = (over: Partial<FleetVehicle> = {}): FleetVehicle => ({ id: 7, title: "2022 Ford Transit (ABC123)", vin: null, bouncie_imei: null, driver_id: 1006, ...over });
const names = new Map([[1006, "Lucas"]]);

describe("matching Bouncie vehicles to Fleet records", () => {
  it("matches by VIN, ignoring case and punctuation", () => {
    const [v] = matchVehicles([live()], [fleet({ vin: "1hgb-iqoj xmn109186" })], names);
    expect(v.vehicleId).toBe(7);
    expect(v.vehicleTitle).toBe("2022 Ford Transit (ABC123)");
    expect(v.driverId).toBe(1006);
    expect(v.driverName).toBe("Lucas");
  });

  it("prefers the Bouncie device (IMEI) over the VIN", () => {
    const rows = [fleet({ id: 1, vin: "1HGBIQOJXMN109186" }), fleet({ id: 2, bouncie_imei: "123456789012345", driver_id: null })];
    const [v] = matchVehicles([live()], rows, names);
    expect(v.vehicleId).toBe(2);
    expect(v.driverName).toBeNull();
  });

  it("leaves unmatched vehicles unmatched (still listed)", () => {
    const [v] = matchVehicles([live({ vin: null })], [fleet({ vin: "OTHER" })], names);
    expect(v.vehicleId).toBeNull();
    expect(v.name).toBe("Van 1");
  });

  it("normalizes VINs", () => {
    expect(normalizeVin(" 1hgb-iqoj xmn109186 ")).toBe("1HGBIQOJXMN109186");
    expect(normalizeVin(null)).toBe("");
  });
});

describe("freshness of a position", () => {
  const now = Date.parse("2026-10-02T15:30:00.000Z");
  it("counts minutes since Bouncie's last update", () => {
    expect(minutesSince("2026-10-02T15:00:00.000Z", now)).toBe(30);
    expect(minutesSince("2026-10-02T15:29:40.000Z", now)).toBe(0);
    expect(minutesSince(null, now)).toBeNull();
    expect(minutesSince("not a date", now)).toBeNull();
  });
  it("is fresh within 10 min, recent within an hour, stale after", () => {
    expect(freshness("2026-10-02T15:25:00.000Z", now)).toBe("fresh");
    expect(freshness("2026-10-02T15:00:00.000Z", now)).toBe("recent");
    expect(freshness("2026-10-02T13:00:00.000Z", now)).toBe("stale");
    expect(freshness(null, now)).toBe("none");
  });
});

describe("reading Bouncie's /v1/vehicles answer", () => {
  it("keeps what the map needs and names the vehicle by nickname or model", () => {
    const body = [
      {
        model: { make: "Ford", name: "Transit", year: 2022 },
        nickName: "Van 1",
        vin: "1HGBIQOJXMN109186",
        imei: "123456789012345",
        stats: { localTimeZone: "America/New_York", odometer: 1234.5, lastUpdated: "2026-10-02T15:00:00.000Z", location: { lat: 26.1, lon: -80.2, heading: 135, address: "1 Main St" }, fuelLevel: 50, isRunning: true, speed: 42 },
      },
      { model: { make: "Ram", name: "ProMaster", year: 2021 }, nickName: "", vin: "", imei: 987654321098765, stats: { lastUpdated: "2026-10-02T14:00:00.000Z" } },
      { nickName: "no device" },
      "junk",
    ];
    const out = parseBouncieVehicles(body);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ imei: "123456789012345", vin: "1HGBIQOJXMN109186", name: "Van 1", lat: 26.1, lng: -80.2, heading: 135, speed: 42, isRunning: true, updatedAt: "2026-10-02T15:00:00.000Z", address: "1 Main St" });
    expect(out[1]).toMatchObject({ imei: "987654321098765", vin: null, name: "2021 Ram ProMaster", lat: null, lng: null, heading: null, speed: null, isRunning: false, address: null });
  });
  it("answers an empty list for anything that isn't a list", () => {
    expect(parseBouncieVehicles({ error: "nope" })).toEqual([]);
    expect(parseBouncieVehicles(null)).toEqual([]);
  });
});
