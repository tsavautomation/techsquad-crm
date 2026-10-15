// UI-m Brand colours (SPEC §9.1 UI-m): the colour themes a person can pick under their profile icon, each named
// after a brand we work with and copied from that brand's app. The colours themselves are CSS variables in
// src/app/globals.css under `html[data-palette="<id>"]` (and `.dark` for night); this file is the list the
// selector shows and the server validates. Adding a brand: one entry here, one block (two with night) in the CSS.

export type Palette = { id: string; name: string; /** three swatches shown on the selector: primary, sidebar, accent */ swatch: [string, string, string] };

export const PALETTES: Palette[] = [
  { id: "techsquad", name: "Tech Squad", swatch: ["#0e76ad", "#0f172a", "#29abe2"] },
  // From the brands' apps (screenshots from Fred, 2026-10-14).
  { id: "ovrc", name: "OvrC", swatch: ["#1b8ce6", "#0a6ea0", "#ff7a1a"] },
  { id: "lutron", name: "Lutron", swatch: ["#1577cf", "#0d4f91", "#8ec5ff"] },
  { id: "crestron", name: "Crestron", swatch: ["#e5473a", "#000000", "#1c1c1e"] },
  { id: "sonos", name: "Sonos", swatch: ["#ffffff", "#000000", "#1ed760"] },
];

export const DEFAULT_PALETTE = "techsquad";
export const PALETTE_COOKIE = "palette";
export const isPalette = (v: unknown): v is string => typeof v === "string" && PALETTES.some((p) => p.id === v);
export const paletteOr = (v: unknown): string => (isPalette(v) ? v : DEFAULT_PALETTE);
