import { todayET } from "@/lib/dates";
import { upcomingBirthdays } from "@/lib/engine/birthdays";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";

// BD-a: a small strip on Today — whose birthday it is, or whose is coming in the next 7 days.
// Reads employee_names (month-day only, readable by everyone); active people with a date.

export async function Birthdays({ now }: { now: number }) {
  const db = await recordsDb();
  const { data } = await db
    .from("employee_names")
    .select("title, birthday_md")
    .is("deleted_at", null)
    .is("archived_at", null)
    .neq("status", "Inactive")
    .not("birthday_md", "is", null);
  const people = ((data ?? []) as { title: string | null; birthday_md: string | null }[]).map((e) => ({ name: e.title ?? "", birthday: e.birthday_md }));
  const b = upcomingBirthdays(people, todayET(new Date(now)));
  if (!b.today.length && !b.upcoming.length) return null;
  const tr = await getT();
  const text = b.today.length
    ? tr("🎂 Today is {names}'s birthday!", { names: b.today.join(", ") })
    : tr("🎂 Upcoming birthdays: {list}", { list: b.upcoming.map((u) => `${u.name} – ${u.date}`).join(", ") });
  return (
    <p className="mb-3.5 rounded-2xl border border-info-fg/20 bg-info-bg px-4 py-2.5 text-[13px] leading-snug text-info-fg" role="status">
      {text}
    </p>
  );
}
