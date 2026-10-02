"use client";

import type { Geo } from "./clock";

/**
 * The phone's position right now, or null when the browser can't give one within a few seconds
 * (denied, no signal, not supported). Asked only at the moment a button is pressed.
 */
export function currentPosition(timeoutMs = 8000): Promise<Geo | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (g: Geo | null) => resolve(g);
    const timer = setTimeout(() => done(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        done({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy) });
      },
      () => {
        clearTimeout(timer);
        done(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
