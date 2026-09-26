"use server";

import { requireUser } from "@/lib/auth/session";
import type { Address } from "./values";

// US address auto-complete through Google Places (API "New"), called from the server so the
// key (GOOGLE_MAPS_API_KEY, restricted to the Places API) never reaches the browser.
// A session token ties the suggestions to the final pick, which Google bills as one lookup.
// Without a key both actions return nothing and the address boxes work as plain inputs.

export type AddressSuggestion = { placeId: string; main: string; secondary: string };

const key = () => process.env.GOOGLE_MAPS_API_KEY;

export async function addressSuggestAction(input: string, session: string): Promise<AddressSuggestion[]> {
  await requireUser();
  const q = input.trim();
  if (!key() || q.length < 4) return [];
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key()! },
    body: JSON.stringify({ input: q.slice(0, 200), includedRegionCodes: ["us"], sessionToken: session, includedPrimaryTypes: ["street_address", "premise", "subpremise", "route"] }),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[] };
  return (body.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .slice(0, 5)
    .map((p) => ({ placeId: p.placeId, main: p.structuredFormat?.mainText?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" }));
}

type Component = { longText: string; shortText: string; types: string[] };

export async function addressDetailsAction(placeId: string, session: string): Promise<Address | null> {
  await requireUser();
  if (!key() || !/^[\w-]+$/.test(placeId)) return null;
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?sessionToken=${encodeURIComponent(session)}`, {
    headers: { "X-Goog-Api-Key": key()!, "X-Goog-FieldMask": "addressComponents" },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { addressComponents?: Component[] };
  return addressFromComponents(body.addressComponents ?? []);
}

/** Google address components → our { street, address_2, city, state, zip }. */
function addressFromComponents(c: Component[]): Address {
  const get = (type: string, short = false) => {
    const x = c.find((p) => p.types.includes(type));
    return x ? (short ? x.shortText : x.longText) : "";
  };
  const street = [get("street_number"), get("route", true)].filter(Boolean).join(" ");
  const city = get("locality") || get("sublocality_level_1") || get("sublocality") || get("neighborhood") || get("administrative_area_level_3");
  const zip = [get("postal_code"), get("postal_code_suffix")].filter(Boolean).join("-");
  const unit = get("subpremise");
  return { street, ...(unit ? { address_2: unit } : {}), city, state: get("administrative_area_level_1", true), zip };
}
