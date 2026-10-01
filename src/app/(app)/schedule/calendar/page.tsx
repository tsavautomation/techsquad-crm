import { notFound } from "next/navigation";
import { Calendar } from "@/components/schedule/calendar";
import { requireUser } from "@/lib/auth/session";
import { todayET } from "@/lib/dates";
import { loadWeek } from "@/lib/schedule/week";
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
  const sp = (await props.searchParams) as { week?: string; view?: string; tech?: string };
  const view = sp.view === "team" || sp.view === "list" ? sp.view : "week";
  const tech = sp.tech && /^\d+$/.test(sp.tech) ? Number(sp.tech) : null;
  const { weekStart, visits, people } = await loadWeek(sp.week);

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="mb-3 text-2xl font-semibold">{tr("Calendar")}</h1>
      <Calendar
        weekStart={weekStart}
        today={todayET()}
        view={view}
        tech={tech}
        visits={visits}
        people={people}
        canEdit={canDo(user.permissions, t, "modify", getTable)}
        canCreate={canDo(user.permissions, t, "create", getTable)}
      />
    </div>
  );
}
