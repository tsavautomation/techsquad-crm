import Link from "next/link";
import type { CurrentUser } from "@/lib/auth/session";
import { fromDateTimeLocalET, todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { addDays } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { isOfficeUser } from "./today";

// The number tiles at the top of the dashboard (Portal design, docs/portal-features-merge.md §I).
// Each tile shows only when the person can open what it counts; a red tile needs attention.

type Tile = { href: string; value: number; label: string; alert?: boolean };

export async function DashboardKpis({ user, now }: { user: CurrentUser; now: number }) {
  const db = await recordsDb();
  const tr = await getT();
  const can = (t: string) => canOpen(user.permissions, getTable(t), getTable);
  const today = todayET();
  const from = fromDateTimeLocalET(`${today}T00:00`);
  const to = fromDateTimeLocalET(`${addDays(today, 1)}T00:00`);
  const tiles: Promise<Tile | null>[] = [];
  // Office people see the whole team's day; everyone else (technicians) sees only their own visits, and no plan renewals (Fred 2026-10-05).
  const office = isOfficeUser(user);
  const { data: meRows } = office ? { data: null } : await db.from("employee_names").select("id").ilike("email", user.email).is("deleted_at", null);
  const mine = office ? null : new Set(((meRows ?? []) as { id: number }[]).map((e) => e.id));
  type VisitRow = { id: number; starts_at: string; status: string | null; technician_id: number | null; visits_team: { target_id: number }[] };
  const isMine = (v: VisitRow) => !mine || (v.technician_id !== null && mine.has(v.technician_id)) || v.visits_team.some((t) => mine.has(t.target_id));
  const VISIT_COLS = "id, starts_at, status, technician_id, visits_team(target_id)";

  if (can("visits")) {
    tiles.push(
      (async () => {
        const { data } = await db.from("visits").select(VISIT_COLS).gte("starts_at", from).lt("starts_at", to).is("deleted_at", null).neq("status", "Cancelled");
        const rows = ((data ?? []) as unknown as VisitRow[]).filter(isMine);
        return { href: office ? "/schedule/calendar?view=list" : "/", value: rows.length, label: office ? "Visits today" : "My visits today" };
      })(),
      (async () => {
        const { data } = await db.from("visits").select(VISIT_COLS).eq("status", "On site").is("deleted_at", null);
        const n = ((data ?? []) as unknown as VisitRow[]).filter(isMine).length;
        return { href: "/schedule/calendar?view=list", value: n, label: "On site now" };
      })(),
      (async () => {
        // Still "Scheduled" 15 minutes after the start time.
        const { data } = await db.from("visits").select(VISIT_COLS).gte("starts_at", from).lt("starts_at", new Date(now - 15 * 60_000).toISOString()).eq("status", "Scheduled").is("deleted_at", null);
        const n = ((data ?? []) as unknown as VisitRow[]).filter(isMine).length;
        return { href: "/schedule/calendar?view=list", value: n, label: "Late (not started)", alert: n > 0 };
      })(),
    );
  }
  if (can("tasks")) {
    tiles.push(
      (async () => {
        const { data: emp } = await db.from("employee_names").select("id").ilike("email", user.email).is("deleted_at", null);
        const ids = ((emp ?? []) as { id: number }[]).map((e) => e.id);
        if (!ids.length) return null;
        const { count } = await db.from("tasks").select("id", { count: "exact", head: true }).in("member_id", ids).neq("status", "Completed").is("deleted_at", null).is("archived_at", null);
        return { href: "/administrative/tasks", value: count ?? 0, label: "My open tasks" };
      })(),
    );
  }
  tiles.push(
    (async () => {
      const { data } = await db.rpc("my_workflow_queue");
      return { href: "/#assigned", value: ((data ?? []) as unknown[]).length, label: "Waiting for me" };
    })(),
  );
  if (office && can("projects")) {
    tiles.push(
      (async () => {
        const { count } = await db.from("projects").select("id", { count: "exact", head: true }).in("maintenance_status", ["Renewal Alert", "Expired"]).is("deleted_at", null).is("archived_at", null);
        const n = count ?? 0;
        return { href: "/projects/projects", value: n, label: "Plan renewals", alert: n > 0 };
      })(),
    );
  }

  const shown = (await Promise.all(tiles)).filter((t): t is Tile => t !== null);
  if (!shown.length) return null;
  return (
    <div className="mb-[18px] grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {shown.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className={cn(
            "rounded-2xl border bg-card px-4 py-3.5 shadow-card transition hover:-translate-y-0.5 hover:border-info-border hover:shadow-[0_8px_20px_rgb(16_24_40/0.12)]",
            t.alert && "border-bad-border bg-gradient-to-b from-bad-bg to-card",
          )}
        >
          <b className={cn("block text-[28px] leading-tight font-semibold tracking-tight", t.alert && "text-bad-fg")}>{t.value}</b>
          <span className="text-xs text-text-2">{tr(t.label)}</span>
        </Link>
      ))}
    </div>
  );
}
