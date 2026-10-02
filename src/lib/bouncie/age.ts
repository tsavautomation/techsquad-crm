import { minutesSince } from "./match";

// "reported 3 h ago": how long since Bouncie last heard from a van, in the person's language.
// Shared by the map, its list and Admin › Bouncie (client and server), so the wording stays the same.

type Translate = (text: string, vars?: Record<string, string | number>) => string;

export function reportedLabel(tr: Translate, updatedAt: string | null, now: number = Date.now()): string {
  const m = minutesSince(updatedAt, now);
  if (m === null) return tr("never reported");
  if (m === 0) return tr("reported just now");
  if (m < 60) return tr("reported {n} min ago", { n: m });
  if (m < 60 * 24) return tr("reported {n} h ago", { n: Math.round(m / 60) });
  return tr("reported {n} days ago", { n: Math.round(m / (60 * 24)) });
}

/** "Moving, 35 mph" / "Engine on" / "Parked". */
export function motionLabel(tr: Translate, v: { isRunning: boolean; speed: number | null }): string {
  if (v.isRunning && v.speed !== null && v.speed > 0) return tr("Moving, {n} mph", { n: Math.round(v.speed) });
  if (v.isRunning) return tr("Engine on");
  return tr("Parked");
}
