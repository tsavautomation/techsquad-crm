// BD-a (Fred 2026-10-21): the birthday strip on Today. Pure: the page passes the people and today's
// Eastern date, this decides who is listed. Day and month only, never the year or the age.

export type BirthdayPerson = { name: string; birthday: string | null | undefined };
export type Birthdays = { today: string[]; upcoming: { name: string; date: string }[] };

const DAYS = 7;

/** Month and day of a YYYY-MM-DD date or an MM-DD pair; null when there is none. */
function monthDay(value: string | null | undefined): { m: number; d: number } | null {
  const x = value?.match(/^(?:\d{4}-)?(\d{2})-(\d{2})/);
  if (!x) return null;
  const m = Number(x[1]);
  const d = Number(x[2]);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { m, d } : null;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Who has a birthday today, and otherwise who has one in the next 7 days, in date order.
 * `today` is YYYY-MM-DD in America/New_York. Month and year roll over (12/28 sees 01/02).
 * A 02/29 birthday is shown on 02/28 in a year without a 29th.
 */
export function upcomingBirthdays(people: BirthdayPerson[], today: string): Birthdays {
  const t = today.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!t) return { today: [], upcoming: [] };
  const year = Number(t[1]);
  const start = Date.UTC(year, Number(t[2]) - 1, Number(t[3]));
  const todayNames: string[] = [];
  const later: { name: string; date: string; offset: number }[] = [];
  for (const p of people) {
    const md = monthDay(p.birthday);
    if (!md || !p.name) continue;
    // The next occurrence: this year, or next year once it has passed.
    for (const y of [year, year + 1]) {
      const d = md.m === 2 && md.d === 29 && !isLeap(y) ? 28 : md.d;
      const at = Date.UTC(y, md.m - 1, d);
      if (at < start) continue;
      const offset = Math.round((at - start) / 86_400_000);
      if (offset === 0) todayNames.push(p.name);
      else if (offset <= DAYS) later.push({ name: p.name, date: `${md.m}/${d}`, offset });
      break;
    }
  }
  const byName = (a: string, b: string) => a.localeCompare(b);
  todayNames.sort(byName);
  later.sort((a, b) => a.offset - b.offset || byName(a.name, b.name));
  return { today: todayNames, upcoming: todayNames.length ? [] : later.map(({ name, date }) => ({ name, date })) };
}
