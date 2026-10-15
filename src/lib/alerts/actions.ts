"use server";

import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, toDateTimeLocalET, todayET } from "@/lib/dates";
import { FIELD_LABEL, isApprover, pendingCorrections } from "@/lib/field-day/corrections";
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
// once done (approved, task completed, checklist ticked…). Row-level security applies throughout.
// N-b (Fred 2026-10-14, "that defeats the importance of the alert, since anything is an alert"): the bell
// carries only what needs the person — tags, tasks, checklist items, the time clock (open day, corrections
// to approve), report reminders the office must follow up, portal requests, and driver's licences expiring.
// Workflow stages, today's visits and client follow-ups live on Today and the calendar, not in the bell.

export type AlertItem = { key: string; href: string; title: string; meta: string; urgent?: boolean };
export type AlertSection = { key: "clock" | "phones" | "tags" | "tasks" | "checklist" | "requests" | "licence"; title: string; items: AlertItem[] };
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

  // F22-a: check-in / check-out corrections waiting for one of the approvers (shown under Time clock).
  const corrections = (async (): Promise<AlertItem[]> => {
    if (!(await isApprover(db, user))) return [];
    const visitsT = getTable("visits");
    return (await pendingCorrections()).map((c) => ({
      key: `tc:${c.id}`,
      href: `${recordHref(visitsT, c.visit_id)}#corrections`,
      title: c.project,
      meta: `${tr("{who} asks to correct {field} to {when}", { who: c.employee, field: tr(FIELD_LABEL[c.field]), when: formatDateTime(c.requested_at) })} · ${formatDate(c.created_at)}`,
      urgent: true,
    }));
  })();

  // N-b: driver's licences expired or expiring within 30 days — mine, and (for people who manage employees) everyone's.
  const licence = (async (): Promise<AlertItem[]> => {
    if (!can("employees")) return [];
    const limit = addDays(today, 30);
    const mine = await myEmployees;
    const office = user.permissions.has("administrative.employees.view_all");
    let q = db.from("employees").select("id, title, dl_expiration, status").is("deleted_at", null).not("dl_expiration", "is", null).lte("dl_expiration", limit).neq("status", "Inactive");
    if (!office) {
      if (!mine.length) return [];
      q = q.in("id", mine);
    }
    const { data } = await q.order("dl_expiration").limit(MAX);
    const et = getTable("employees");
    return ((data ?? []) as { id: number; title: string | null; dl_expiration: string }[]).map((e) => ({
      key: `dl:${e.id}`,
      href: recordHref(et, e.id),
      title: mine.includes(e.id) ? tr("Your driver's licence") : (e.title ?? `#${e.id}`),
      meta: e.dl_expiration < today ? tr("Driver's licence expired on {date}", { date: formatDate(e.dl_expiration) }) : tr("Driver's licence expires on {date}", { date: formatDate(e.dl_expiration) }),
      urgent: e.dl_expiration < today,
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
  // P2: still clocked in past the reminder time for my group.
  const clock = (async (): Promise<AlertItem[]> => {
    const mine = await myClockToday(db, user);
    if (!mine?.day.openSince) return [];
    const settings = await loadFieldDay(db);
    const localNow = toDateTimeLocalET(new Date().toISOString()).slice(11, 16);
    if (!pastTime(localNow, settings.time_clock.reminder[mine.group])) return [];
    return [{ key: "clock:open", href: "/#clock", title: tr("Still clocked in"), meta: tr("Since {time} — clock out when you're done.", { time: clockTime(toDateTimeLocalET(mine.day.openSince).slice(11)) }), urgent: true }];
  })();

  // F18-c: administrators hear about technicians the 9 PM reminder could not reach (no usable phone).
  const phones = (async (): Promise<AlertItem[]> => {
    if (!user.isSysadmin) return [];
    const { data } = await db.from("automation_runs").select("detail").eq("automation_id", 900601).eq("event", "reminders").order("at", { ascending: false }).limit(1);
    const skipped = ((data?.[0] as { detail?: { skipped?: { employee_id: number; name: string; reason: string }[] } } | undefined)?.detail?.skipped ?? []).filter((s) => s.reason === "no_phone" || s.reason === "bad_phone");
    const seen = new Set<number>();
    return skipped
      .filter((s) => !seen.has(s.employee_id) && seen.add(s.employee_id))
      .map((s) => ({ key: `phone:${s.employee_id}`, href: `${recordHref(getTable("employees"), s.employee_id)}/edit`, title: s.name, meta: tr("No usable phone number for the report reminders. Fix it on the Employee card."), urgent: false }));
  })();

  // F6: customers' requests from the portal, for the office (everyone who sees all projects).
  const requests = (async (): Promise<AlertItem[]> => {
    if (!user.permissions.has("projects.projects.view_all")) return [];
    const { data } = await db
      .from("service_requests")
      .select("id, project_id, kind, description, created_at, projects(title)")
      .eq("status", "Requested")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX);
    const rows = (data ?? []) as unknown as { id: number; project_id: number; kind: string | null; description: string | null; created_at: string; projects: { title: string | null } | null }[];
    const projects = getTable("projects");
    return rows.map((r) => ({
      key: `request:${r.id}`,
      href: `${recordHref(projects, r.project_id)}/sub/service_requests/${r.id}/edit`,
      title: `${tr(r.kind ?? "Other")} · ${r.projects?.title ?? `#${r.project_id}`}`,
      meta: `${formatDate(r.created_at)} · ${(r.description ?? "").length > 80 ? `${(r.description ?? "").slice(0, 80)}…` : r.description ?? ""}`,
      urgent: Date.now() - new Date(r.created_at).getTime() > 2 * 24 * 3600_000,
    }));
  })();

  const [a, b, d, e, g, h, i, l] = await Promise.all([tags, corrections, tasks, checklist, clock, phones, requests, licence]);
  const sections: AlertSection[] = [
    { key: "clock" as const, title: tr("Time clock"), items: [...g, ...b] },
    { key: "licence" as const, title: tr("Driver's licences"), items: l },
    { key: "phones" as const, title: tr("Report reminders"), items: h },
    { key: "requests" as const, title: tr("Customer requests from the portal"), items: i },
    { key: "tags" as const, title: tr("Tagged you"), items: a },
    { key: "tasks" as const, title: tr("Your open tasks"), items: d },
    { key: "checklist" as const, title: tr("Checklist items for you"), items: e },
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
