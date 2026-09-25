// All "today"/display logic is in US Eastern time (WebAuthor site setting, SPEC §8).
export const TIME_ZONE = "America/New_York";

/** Today's date in Eastern time as YYYY-MM-DD. */
export function todayET(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** m/d/yyyy, as WebAuthor showed dates. Accepts YYYY-MM-DD or an ISO timestamp. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "numeric", day: "numeric", year: "numeric" }).format(new Date(value));
}

/** m/d/yyyy h:mm AM/PM in Eastern time. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(d);
  return `${formatDate(value)} ${time}`;
}

/** Convert a stored timestamp to the value of an <input type="datetime-local"> in Eastern time. */
export function toDateTimeLocalET(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Convert an Eastern-time datetime-local value ("2026-09-25T14:30") to an ISO timestamp. */
export function fromDateTimeLocalET(local: string): string {
  const [date, time] = local.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  // Guess UTC, then correct by the Eastern offset at that moment (handles daylight saving).
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const asET = new Date(toDateTimeLocalET(new Date(guess).toISOString()) + ":00Z").getTime();
  return new Date(guess + (guess - asET)).toISOString();
}
