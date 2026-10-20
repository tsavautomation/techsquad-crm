import { notFound } from "next/navigation";
import { Calendar } from "@/components/schedule/calendar";
import { requireUser } from "@/lib/auth/session";
import { formatDate, fromDateTimeLocalET, toDateTimeLocalET, todayET } from "@/lib/dates";
import { loadWeek } from "@/lib/schedule/week";
import { addDays, weekStartOf } from "@/lib/schedule/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Calendar") };
}

/** Schedule › Calendar (F1): week / team / list of visits. */
export default async function CalendarPage(props: PageProps<"/schedule/calendar">) {
  const tr = await getT();
  const user = await requireUser();
  const t = getTable("visits");
  if (!canOpen(user.permissions, t, getTable)) notFound();
  const sp = (await props.searchParams) as { week?: string; view?: string; tech?: string; day?: string };
  // F25-a (Fred 2026-10-20): Schedule opens on today's Day view; a week link keeps the Week view.
  const view = sp.view === "team" || sp.view === "list" || sp.view === "day" || sp.view === "week" ? sp.view : sp.week ? "week" : "day";
  const tech = sp.tech && /^\d+$/.test(sp.tech) ? Number(sp.tech) : null;
  // Day view (F15-e): one day, a column per technician; the week loaded is the one holding that day.
  const today = todayET();
  let day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const db = await recordsDb();
  let note: string | null = null;
  if (view === "day" && !sp.day) {
    // F25-a: an empty day (a Saturday, a holiday) jumps to the next day that has a visit.
    const { count } = await db.from("visits").select("id", { count: "exact", head: true }).gte("starts_at", fromDateTimeLocalET(`${today}T00:00`)).lt("starts_at", fromDateTimeLocalET(`${addDays(today, 1)}T00:00`)).neq("status", "Cancelled").is("deleted_at", null).is("archived_at", null);
    if (!count) {
      const { data: next } = await db.from("visits").select("starts_at").gte("starts_at", fromDateTimeLocalET(`${addDays(today, 1)}T00:00`)).neq("status", "Cancelled").is("deleted_at", null).is("archived_at", null).order("starts_at").limit(1);
      const first = (next ?? [])[0] as { starts_at: string } | undefined;
      if (first) {
        day = toDateTimeLocalET(first.starts_at).slice(0, 10);
        note = tr("No visits today: showing {date}, the next day with visits.", { date: formatDate(day) });
      }
    }
  }
  const [{ weekStart, visits, people }, orphans] = await Promise.all([
    loadWeek(view === "day" ? weekStartOf(day) : sp.week),
    // F15: visits from Google Calendar still waiting for their project.
    db.from("visits").select("id", { count: "exact", head: true }).is("project_id", null).is("deleted_at", null).not("google_event_id", "is", null).then((r) => r.count ?? 0),
  ]);

  return (
    <div className="mx-auto max-w-[1600px]">
      <h1 className="mb-3 text-2xl font-semibold">{tr("Calendar")}</h1>
      <Calendar
        weekStart={weekStart}
        today={todayET()}
        view={view}
        day={day}
        tech={tech}
        visits={visits}
        people={people}
        canEdit={canDo(user.permissions, t, "modify", getTable)}
        canCreate={canDo(user.permissions, t, "create", getTable)}
        orphans={orphans}
        note={note}
      />
    </div>
  );
}
