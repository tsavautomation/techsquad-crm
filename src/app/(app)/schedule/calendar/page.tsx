import { notFound } from "next/navigation";
import { Calendar } from "@/components/schedule/calendar";
import { requireUser } from "@/lib/auth/session";
import { todayET } from "@/lib/dates";
import { loadWeek } from "@/lib/schedule/week";
import { weekStartOf } from "@/lib/schedule/dates";
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
  const view = sp.view === "team" || sp.view === "list" || sp.view === "day" ? sp.view : "week";
  const tech = sp.tech && /^\d+$/.test(sp.tech) ? Number(sp.tech) : null;
  // Day view (F15-e): one day, a column per technician; the week loaded is the one holding that day.
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : todayET();
  const [{ weekStart, visits, people }, orphans] = await Promise.all([
    loadWeek(view === "day" ? weekStartOf(day) : sp.week),
    // F15: visits from Google Calendar still waiting for their project.
    (await recordsDb()).from("visits").select("id", { count: "exact", head: true }).is("project_id", null).is("deleted_at", null).not("google_event_id", "is", null).then((r) => r.count ?? 0),
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
      />
    </div>
  );
}
