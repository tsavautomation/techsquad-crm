import { visibleModules } from "@/config/modules";
import { requireUser } from "@/lib/auth/session";
import { TIME_ZONE } from "@/lib/dates";
import { DashboardKpis } from "@/components/dashboard/kpis";
import { TodaySections } from "@/components/dashboard/today";
import { DashboardWidgets } from "@/components/dashboard/widgets";

/** Greeting by the Eastern-time hour, as in the Portal design. */
function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(now));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export const metadata = { title: "Today" };

/** Today (the Portal design's "Hoje"): greeting, number tiles, what needs attention. */
export default async function DashboardPage() {
  const user = await requireUser();
  const modules = visibleModules(user.permissions);
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric" }).format(now);

  return (
    <div className="mx-auto max-w-[960px]">
      <h1 className="text-[21px] leading-tight font-semibold tracking-tight md:text-2xl">
        {greeting(now)}
        {user.firstName ? `, ${user.firstName}` : ""}
      </h1>
      <p className="mb-5 text-[12.5px] text-muted-foreground">{date}</p>
      {modules.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">You don&apos;t have access to any modules yet. Ask an administrator to add you to a group.</p>
      ) : (
        <>
          <DashboardKpis user={user} now={now.getTime()} />
          <div className="grid gap-3.5">
            <TodaySections user={user} now={now.getTime()} />
            <div id="assigned">
              <DashboardWidgets user={user} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
