import "server-only";
import { loadSettings } from "@/lib/google/client";
import { GOOGLE_COLORS } from "@/lib/google/match";

// Technician colours on the CRM calendar (Fred 2026-10-04, "bring the same technician colors into
// this CRM calendar"): the Google Calendar legend (Admin › Google Calendar, colour → technician) gives
// each mapped technician Google's own colour; everyone else gets a steady colour of their own from
// the palette below (by employee id, so it never changes between visits).

const PALETTE = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#dc2626", "#0891b2", "#65a30d", "#9333ea", "#ea580c", "#0d9488", "#4f46e5", "#b45309", "#be185d", "#15803d", "#1d4ed8"];

/** Colour per employee id for the ids given (and any technician in the Google legend). */
export async function technicianColors(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const settings = await loadSettings().catch(() => null);
  for (const [colorId, employeeId] of Object.entries(settings?.color_map ?? {})) {
    const hex = GOOGLE_COLORS.find((c) => c.id === colorId)?.hex;
    if (hex && !out.has(employeeId)) out.set(employeeId, hex);
  }
  for (const id of new Set(ids)) if (!out.has(id)) out.set(id, PALETTE[id % PALETTE.length]);
  return out;
}
