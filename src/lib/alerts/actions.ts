"use server";

import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, fromDateTimeLocalET, toDateTimeLocalET, todayET } from "@/lib/dates";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { recordsDb } from "@/lib/records/data";
import { addDays, clock as clockTime } from "@/lib/schedule/dates";
import { pastTime } from "@/lib/time-clock/clock";
import { myClockToday } from "@/lib/time-clock/record";
import { getTable, REGISTRY } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

// The alerts bell in the top bar: what is waiting for the signed-in person, each linking to its record.
// Tags in notes stay until the record is opened (or "Mark tags read"); the rest are live: they drop out
// once done (approved, task completed, checklist ticked, visit done…). Row-level security applies throughout.

export type AlertItem = { key: string; href: string; title: string; meta: string; urgent?: boolean };
export type AlertSection = { key: "clock" | "tags" | "approvals" | "visits" | "tasks" | "checklist" | "followups"; title: string; items: AlertItem[] };
export type Alerts = { count: number; urgent: boolean; sections: AlertSection[] };

const MAX = 20;
const known = new Set(REGISTRY.map((t) => t.name));

export async function alertsAction(): Promise<Alerts> {
  const user = await requireUser();
  const db = await recordsDb();
  const tr = await getT();
  const can = (t: string) => known.has(t) && canOpen(user.permissions, getTable(t), getTable);
  const today = todayET();

  /** Titles of records the person can see (others drop out). */
  async function titles(pairs: { table: string; id: number }[]) {
    const out = new Map<string, string>();
    const byTable = Map.groupBy(
      pairs.filter((p) => can(p.table)),
      (p) => p.table,
    );
    await Promise.all(
      [...byTable.entries()].map(async ([table, list]) => {
        const { data } = await db
          .from(table)
          .select("id, title")
          .in("id", [...new Set(list.map((p) => p.id))])
          .is("deleted_at", null);
        for (const r of (data ?? []) as { id: number; title: string | null }[]) out.set(`${table}:${r.id}`, r.title || `${tr(getTable(table).itemLabel)} #${r.id}`);
      }),
    );
    return out;
  }
  const link = (table: string, id: number) => {
    const t = getTable(table);
    return t.tab || t.module === "utility" ? recordHref(t, id) : null;
  };

  const myEmployees = (async () => {
    const { data } = await db.from("employee_names").select("id").ilike("email", user.email).is("deleted_at", null);
    return ((data ?? []) as { id: number }[]).map((e) => e.id);
  })();

  const tags = (async (): Promise<AlertItem[]> => {
    const { data } = await db
      .from("record_mentions")
      .select("id, table_name, record_id, created_at, created_by, record_notes(body)")
      .eq("user_id", user.id)
      .is("seen_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX);
    const rows = (data ?? []) as unknown as { id: number; table_name: string; record_id: number; created_at: string; created_by: string | null; record_notes: { body: string } | null }[];
    const [names, t] = await Promise.all([
      (async () => {
        const ids = [...new Set(rows.map((r) => r.created_by).filter((v): v is string => Boolean(v)))];
        const { data: p } = ids.length ? await db.from("profiles").select("id, first_name, last_name").in("id", ids) : { data: [] };
        return new Map(((p ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((x) => [x.id, [x.first_name, x.last_name].filter(Boolean).join(" ")]));
      })(),
      titles(rows.map((r) => ({ table: r.table_name, id: r.record_id }))),
    ]);
    return rows
      .filter((r) => t.has(`${r.table_name}:${r.record_id}`) && link(r.table_name, r.record_id))
      .map((r) => {
        const body = (r.record_notes?.body ?? "").replace(/\s+/g, " ");
        return {
          key: `tag:${r.id}`,
          href: `${link(r.table_name, r.record_id)}#notes`,
          title: t.get(`${r.table_name}:${r.record_id}`)!,
          meta: `${tr("{who} tagged you", { who: (r.created_by && names.get(r.created_by)) || tr("Someone") })} · ${formatDateTime(r.created_at)}${body ? ` · “${body.length > 70 ? `${body.slice(0, 70)}…` : body}”` : ""}`,
          urgent: true,
        };
      });
  })();

  const approvals = (async (): Promise<AlertItem[]> => {
    const { data } = await db.rpc("my_workflow_queue");
    const rows = ((data ?? []) as { table_name: string; record_id: number; level_title: string; entered_at: string }[]).slice(0, MAX);
    const t = await titles(rows.map((r) => ({ table: r.table_name, id: r.record_id })));
    return rows
      .filter((r) => t.has(`${r.table_name}:${r.record_id}`) && link(r.table_name, r.record_id))
      .map((r) => ({
        key: `wf:${r.table_name}:${r.record_id}`,
        href: link(r.table_name, r.record_id)!,
        title: t.get(`${r.table_name}:${r.record_id}`)!,
        meta: `${tr(r.level_title)} · ${tr("since {date}", { date: formatDate(r.entered_at) })}`,
      }));
  })();

  const visits = (async (): Promise<AlertItem[]> => {
    const emp = await myEmployees;
    if (!emp.length || !can("visits")) return [];
    const from = fromDateTimeLocalET(`${today}T00:00`);
    const to = fromDateTimeLocalET(`${addDays(today, 1)}T00:00`);
    const { data: team } = await db.from("visits_team").select("record_id").in("target_id", emp);
    const along = ((team ?? []) as { record_id: number }[]).map((r) => r.record_id);
    let q = db.from("visits").select("id, title, starts_at, status").gte("starts_at", from).lt("starts_at", to).is("deleted_at", null).not("status", "in", "(Done,Cancelled)");
    q = along.length ? q.or(`technician_id.in.(${emp.join(",")}),id.in.(${along.join(",")})`) : q.in("technician_id", emp);
    const { data } = await q.order("starts_at").limit(MAX);
    return ((data ?? []) as { id: number; title: string | null; starts_at: string; status: string }[]).map((v) => ({
      key: `visit:${v.id}`,
      href: recordHref(getTable("visits"), v.id),
      title: v.title || tr("Visit #{id}", { id: v.id }),
      meta: `${formatDateTime(v.starts_at).split(" ").slice(1).join(" ")} · ${tr(v.status)}`,
    }));
  })();

  const tasks = (async (): Promise<AlertItem[]> => {
    const emp = await myEmployees;
    if (!emp.length || !can("tasks")) return [];
    const { data } = await db
      .from("tasks")
      .select("id, title, status, due_date")
      .in("member_id", emp)
      .neq("status", "Completed")
      .is("deleted_at", null)
      .is("archived_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(MAX);
    return ((data ?? []) as { id: number; title: string | null; status: string | null; due_date: string | null }[]).map((r) => {
      const late = Boolean(r.due_date && r.due_date < today);
      return {
        key: `task:${r.id}`,
        href: recordHref(getTable("tasks"), r.id),
        title: r.title || tr("Task #{id}", { id: r.id }),
        meta: [r.status && tr(r.status), r.due_date && (late ? tr("overdue since {date}", { date: formatDate(r.due_date) }) : r.due_date === today ? tr("due today") : tr("due {date}", { date: formatDate(r.due_date) }))].filter(Boolean).join(" · "),
        urgent: late,
      };
    });
  })();

  const checklist = (async (): Promise<AlertItem[]> => {
    const { data } = await db
      .from("record_checklist_items")
      .select("id, table_name, record_id, item, due_date")
      .eq("assigned_to", user.id)
      .is("completed_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(MAX);
    const rows = (data ?? []) as { id: number; table_name: string; record_id: number; item: string; due_date: string | null }[];
    const t = await titles(rows.map((r) => ({ table: r.table_name, id: r.record_id })));
    return rows
      .filter((r) => t.has(`${r.table_name}:${r.record_id}`) && link(r.table_name, r.record_id))
      .map((r) => ({
        key: `check:${r.id}`,
        href: `${link(r.table_name, r.record_id)}#checklist`,
        title: r.item,
        meta: [t.get(`${r.table_name}:${r.record_id}`), r.due_date && tr("due {date}", { date: formatDate(r.due_date) })].filter(Boolean).join(" · "),
        urgent: Boolean(r.due_date && r.due_date < today),
      }));
  })();

  // Follow-up dates on my own notes, from a week ago up to today.
  const followups = (async (): Promise<AlertItem[]> => {
    const { data } = await db
      .from("record_notes")
      .select("id, table_name, record_id, body, follow_up_date")
      .eq("created_by", user.id)
      .gte("follow_up_date", addDays(today, -7))
      .lte("follow_up_date", today)
      .order("follow_up_date", { ascending: false })
      .limit(MAX);
    const rows = (data ?? []) as { id: number; table_name: string; record_id: number; body: string; follow_up_date: string }[];
    const t = await titles(rows.map((r) => ({ table: r.table_name, id: r.record_id })));
    return rows
      .filter((r) => t.has(`${r.table_name}:${r.record_id}`) && link(r.table_name, r.record_id))
      .map((r) => ({
        key: `follow:${r.id}`,
        href: `${link(r.table_name, r.record_id)}#notes`,
        title: t.get(`${r.table_name}:${r.record_id}`)!,
        meta: `${r.follow_up_date === today ? tr("Follow up today") : tr("Follow up since {date}", { date: formatDate(r.follow_up_date) })} · “${r.body.length > 60 ? `${r.body.slice(0, 60)}…` : r.body}”`,
        urgent: r.follow_up_date < today,
      }));
  })();

  // P2: still clocked in past the reminder time for my group.
  const clock = (async (): Promise<AlertItem[]> => {
    const mine = await myClockToday(db, user);
    if (!mine?.day.openSince) return [];
    const settings = await loadFieldDay(db);
    const localNow = toDateTimeLocalET(new Date().toISOString()).slice(11, 16);
    if (!pastTime(localNow, settings.time_clock.reminder[mine.group])) return [];
    return [{ key: "clock:open", href: "/#clock", title: tr("Still clocked in"), meta: tr("Since {time} — clock out when you're done.", { time: clockTime(toDateTimeLocalET(mine.day.openSince).slice(11)) }), urgent: true }];
  })();

  const [a, b, c, d, e, f, g] = await Promise.all([tags, approvals, visits, tasks, checklist, followups, clock]);
  const sections: AlertSection[] = [
    { key: "clock" as const, title: tr("Time clock"), items: g },
    { key: "tags" as const, title: tr("Tagged you"), items: a },
    { key: "approvals" as const, title: tr("Waiting for your approval"), items: b },
    { key: "visits" as const, title: tr("Your visits today"), items: c },
    { key: "tasks" as const, title: tr("Your open tasks"), items: d },
    { key: "checklist" as const, title: tr("Checklist items for you"), items: e },
    { key: "followups" as const, title: tr("Follow-ups"), items: f },
  ].filter((s) => s.items.length);
  const all = sections.flatMap((s) => s.items);
  return { count: all.length, urgent: all.some((i) => i.urgent), sections };
}

/** "Mark tags read": clears every tag from the bell without opening the records. */
export async function markTagsSeenAction(): Promise<void> {
  const user = await requireUser();
  const db = await recordsDb();
  await db.from("record_mentions").update({ seen_at: new Date().toISOString() }).eq("user_id", user.id).is("seen_at", null);
}
