import type { Address } from "@/lib/records/values";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (n: number | null | undefined) => usd.format(Number(n ?? 0));

export function addressLines(a: Address | null | undefined, unit?: string | null): string[] {
  if (!a) return [];
  const l1 = [a.street, a.address_2].filter(Boolean).join(", ");
  const l2 = [a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [unit ? `${l1} · ${unit}` : l1, l2].filter(Boolean);
}

/** Tone of a visit's status pill in the portal. */
export function visitTone(status: string): "ok" | "warn" | "info" | "muted" {
  if (status === "On the way") return "warn";
  if (status === "On site") return "info";
  if (status === "Done") return "ok";
  return "muted";
}

export function requestTone(status: string): "ok" | "warn" | "info" | "muted" {
  if (status === "Requested") return "warn";
  if (status === "Scheduled") return "info";
  if (status === "Done") return "ok";
  return "muted";
}

/** The arrival window as the option label the office picked ("Within 1 h"); nothing for an exact time. */
const WINDOWS: Record<string, string> = { "30": "Within 30 min", "60": "Within 1 h", "120": "Within 2 h" };
export const arrivalLabel = (w: string | null | undefined): string | null => (w && WINDOWS[w]) || null;
