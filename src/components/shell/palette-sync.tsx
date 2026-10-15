"use client";

import { useEffect } from "react";
import { PALETTE_COOKIE } from "@/lib/palettes";

/** UI-m: on a device that has not seen this person's choice yet, apply the palette from their profile and remember it. */
export function PaletteSync({ palette }: { palette: string }) {
  useEffect(() => {
    const html = document.documentElement;
    if (html.dataset.palette !== palette) {
      html.dataset.palette = palette;
      document.cookie = `${PALETTE_COOKIE}=${palette}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    }
  }, [palette]);
  return null;
}
