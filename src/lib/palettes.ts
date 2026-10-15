// UI-m Brand colours (SPEC §9.1 UI-m): the colour themes a person can pick under their profile icon, each named
// after a brand we work with and copied from that brand's app. The colours themselves are CSS variables in
// src/app/globals.css under `html[data-palette="<id>"]` (and `.dark` for night); this file is the list the
// selector shows and the server validates. Adding a brand: one entry here, one block (two with night) in the CSS.

export type Palette = { id: string; name: string; /** three swatches shown on the selector: page, sidebar, accent */ swatch: [string, string, string] };

export const PALETTES: Palette[] = [
  { id: "techsquad", name: "Tech Squad", swatch: ["#f3f5f8", "#0f172a", "#0e76ad"] },
  // From the brands' apps (screenshots from Fred, 2026-10-14).
  { id: "ovrc", name: "OvrC", swatch: ["#f5faff", "#1b8ce6", "#ff7a1a"] },
  { id: "lutron", name: "Lutron", swatch: ["#e8eff8", "#0d4f91", "#0d5fb0"] },
  { id: "crestron", name: "Crestron", swatch: ["#000000", "#1c1c1e", "#e5473a"] },
  { id: "sonos", name: "Sonos", swatch: ["#000000", "#1e1f22", "#ffffff"] },
];

export const DEFAULT_PALETTE = "techsquad";
export const PALETTE_COOKIE = "palette";
export const isPalette = (v: unknown): v is string => typeof v === "string" && PALETTES.some((p) => p.id === v);
export const paletteOr = (v: unknown): string => (isPalette(v) ? v : DEFAULT_PALETTE);
