// Calendar date helpers (F1). Plain "YYYY-MM-DD" strings in Eastern time; pure and unit-tested.

/** Add days to a YYYY-MM-DD date. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The Sunday that starts the week containing `date` (US calendars). */
export function weekStartOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, -dow);
}

/** "HH:mm" → minutes after midnight. */
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Minutes after midnight → "HH:mm". */
export const fromMinutes = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** 9:30 AM style. */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Side-by-side columns for overlapping visits of one day: each gets a lane index and the lane count of its group. */
export function lanes<T extends { start: number; end: number }>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (T & { lane: number; lanes: number })[] = [];
  let group: (T & { lane: number; lanes: number })[] = [];
  let groupEnd = -1;
  const close = () => {
    const n = Math.max(1, ...group.map((g) => g.lane + 1));
    group.forEach((g) => (g.lanes = n));
    out.push(...group);
    group = [];
  };
  for (const it of sorted) {
    if (group.length && it.start >= groupEnd) close();
    const used = new Set(group.filter((g) => g.end > it.start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ ...it, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, it.end);
  }
  if (group.length) close();
  return out;
}
