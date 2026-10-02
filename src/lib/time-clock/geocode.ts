import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Geo } from "./clock";

// Address → position for the time clock (P2). Looked up once per address through Google Places
// (the same key as the address auto-fill) and kept in public.geocodes; no key → null, never an error.

const keyOf = (address: string) => address.trim().replace(/\s+/g, " ").toLowerCase();

export async function geocode(db: SupabaseClient, address: string | null | undefined): Promise<Geo | null> {
  if (!address?.trim()) return null;
  const key = keyOf(address);
  const { data } = await db.from("geocodes").select("lat, lng").eq("address", key).maybeSingle();
  if (data) return { lat: Number(data.lat), lng: Number(data.lng) };
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.location" },
      body: JSON.stringify({ textQuery: address.trim(), maxResultCount: 1 }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { places?: { location?: { latitude: number; longitude: number } }[] };
    const loc = body.places?.[0]?.location;
    if (!loc) return null;
    await db.from("geocodes").upsert({ address: key, lat: loc.latitude, lng: loc.longitude }, { onConflict: "address", ignoreDuplicates: true });
    return { lat: loc.latitude, lng: loc.longitude };
  } catch {
    return null;
  }
}
