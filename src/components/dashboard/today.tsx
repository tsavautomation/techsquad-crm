import Link from "next/link";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, fromDateTimeLocalET, todayET, toDateTimeLocalET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { addDays, clock } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { QuickTask } from "./quick-task";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/core";

// "Today" sections from the Portal design (docs/portal-features-merge.md §I), built on what exists now.
// Review requests and follow-ups from the contact log arrive with F4.

type Row = { href: string; title: string; meta: string; action?: { href: string; label: string }; tone?: "bad" | "warn" };
type Section = { id: string; title: string; rows: Row[] };

const LIMIT = 8;

function SectionCard({ s, tr }: { s: Section; tr: T }) {
  return (
    <section id={s.id} className="scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-2 text-[15px] font-semibold tracking-tight">
        {s.title} <span className="font-normal text-muted-foreground">({s.rows.length})</span>
      </h2>
      <ul className="-mx-2 divide-y">
        {s.rows.slice(0, LIMIT).map((r) => (
          <li key={r.href + r.meta} className="flex items-center gap-2 px-2 py-2">
            <Link href={r.href} className="min-w-0 flex-1 rounded-lg hover:underline">
              <span className="block truncate text-[14.5px] font-semibold">{r.title}</span>
              <span className={r.tone === "bad" ? "text-[12.5px] text-bad-fg" : r.tone === "warn" ? "text-[12.5px] text-warn-fg" : "text-[12.5px] text-text-2"}>{r.meta}</span>
            </Link>
            {r.action && (
              <Link href={r.action.href} className="inline-flex h-9 shrink-0 items-center rounded-[10px] bg-ok-bg px-3 text-[13px] font-semibold text-ok-fg hover:brightness-95">
                {r.action.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {s.rows.length > LIMIT && <p className="mt-1 text-[12.5px] text-muted-foreground">{tr("+ {n} more", { n: s.rows.length - LIMIT })}</p>}
    </section>
  );
}

export async function TodaySections({ user, now }: { user: CurrentUser; now: number }) {
  const db = await recordsDb();
  const tr = await getT();
  const can = (t: string) => canOpen(user.permissions, getTable(t), getTable);
  const today = todayET();
  const dayStart = fromDateTimeLocalET(`${today}T00:00`);
  const in14 = fromDateTimeLocalET(`${addDays(today, 15)}T00:00`);
  const in30 = addDays(today, 30);
  const visitsT = getTable("visits");
  const newVisit = (projectId: number) => `${"/schedule/visits/new"}?project_id=${projectId}&back=/`;
  const jobs: Promise<Section | null>[] = [];

  // Upcoming visits (today → 14 days) with their project, used by several sections.
  const upcoming = can("visits")
    ? Promise.resolve(db
        .from("visits")
        .select("id, starts_at, status, technician_id, project_id, projects(title, job_address, financial_status), employees:technician_id(title, phone)")
        .gte("starts_at", dayStart)
        .lt("starts_at", in14)
        .neq("status", "Cancelled")
        .is("deleted_at", null)
        .order("starts_at")
        .then(({ data }) => (data ?? []) as unknown as { id: number; starts_at: string; status: string; project_id: number | null; projects: { title: string | null; job_address: { street?: string } | null; financial_status: string | null } | null; employees: { title: string | null; phone: string | null } | null }[]))
    : Promise.resolve([]);

  const when = (iso: string) => {
    const l = toDateTimeLocalET(iso);
    return `${formatDate(l.slice(0, 10))} ${clock(l.slice(11))}`;
  };

  if (can("visits")) {
    jobs.push(
      upcoming.then((v) => ({
        id: "on-site",
        title: tr("On site now"),
        rows: v.filter((x) => x.status === "On site").map((x) => ({ href: recordHref(visitsT, x.id), title: x.projects?.title ?? tr("Visit #{id}", { id: x.id }), meta: tr("{who} · started {when}", { who: x.employees?.title ?? tr("No technician"), when: when(x.starts_at) }) })),
      })),
      upcoming.then((v) => ({
        id: "late",
        title: tr("Late (not started)"),
        rows: v
          .filter((x) => x.status === "Scheduled" && new Date(x.starts_at).getTime() + 15 * 60_000 < now && x.starts_at >= dayStart)
          .map((x) => ({
            href: recordHref(visitsT, x.id),
            title: x.projects?.title ?? tr("Visit #{id}", { id: x.id }),
            meta: tr("Should have started {when} · {who}", { when: when(x.starts_at), who: x.employees?.title ?? tr("no technician") }),
            tone: "bad" as const,
            action: x.employees?.phone ? { href: `tel:${x.employees.phone.replace(/[^\d+]/g, "")}`, label: tr("Call {name}", { name: x.employees.title?.split(" ")[0] ?? "" }) } : undefined,
          })),
      })),
      upcoming.then((v) => ({
        id: "delinquent",
        title: tr("Delinquent clients with visits in the next 14 days"),
        rows: v.filter((x) => x.projects?.financial_status === "Delinquent").map((x) => ({ href: recordHref(visitsT, x.id), title: x.projects?.title ?? tr("Visit #{id}", { id: x.id }), meta: tr("{when} · check with accounting before going", { when: when(x.starts_at) }), tone: "bad" as const })),
      })),
      upcoming.then((v) => ({
        id: "no-address",
        title: tr("Visits without an address"),
        rows: v.filter((x) => x.project_id && !x.projects?.job_address?.street).map((x) => ({ href: `/projects/projects/${x.project_id}`, title: x.projects?.title ?? tr("Project #{id}", { id: x.project_id }), meta: tr("{when} · add the job address so maps work", { when: when(x.starts_at) }), tone: "warn" as const })),
      })),
    );
  }

  if (can("projects")) {
    jobs.push(
      (async () => {
        if (!can("visits")) return null;
        const { data: approved } = await db.from("projects").select("id, title").eq("job_status", "Proposal Approved").is("deleted_at", null).is("archived_at", null);
        const ids = ((approved ?? []) as { id: number }[]).map((p) => p.id);
        if (!ids.length) return null;
        const { data: booked } = await db.from("visits").select("project_id").in("project_id", ids).gte("starts_at", dayStart).neq("status", "Cancelled").is("deleted_at", null);
        const has = new Set(((booked ?? []) as { project_id: number }[]).map((b) => b.project_id));
        const canBook = canDo(user.permissions, visitsT, "create", getTable);
        return {
          id: "follow-ups",
          title: tr("Approved, no visit scheduled"),
          rows: ((approved ?? []) as { id: number; title: string | null }[])
            .filter((p) => !has.has(p.id))
            .map((p) => ({ href: `/projects/projects/${p.id}`, title: p.title ?? tr("Project #{id}", { id: p.id }), meta: tr("Proposal approved and nothing on the calendar"), action: canBook ? { href: newVisit(p.id), label: tr("Schedule visit") } : undefined })),
        };
      })(),
      (async () => {
        const { data } = await db.from("projects").select("id, title, maintenance_status, maintenance_type, maintenance_amount").in("maintenance_status", ["Expired", "Renewal Alert"]).is("deleted_at", null).is("archived_at", null).order("maintenance_status");
        const canBook = can("visits") && canDo(user.permissions, visitsT, "create", getTable);
        const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
        return {
          id: "renewals",
          title: tr("Maintenance plan renewals"),
          rows: ((data ?? []) as { id: number; title: string | null; maintenance_status: string; maintenance_type: string | null; maintenance_amount: number | null }[]).map((p) => ({
            href: `/projects/projects/${p.id}`,
            title: p.title ?? tr("Project #{id}", { id: p.id }),
            meta: `${tr(p.maintenance_status === "Expired" ? "Plan expired, offer renewal" : "Renewal due soon")} · ${p.maintenance_type ? tr(p.maintenance_type) : tr("plan")}${p.maintenance_amount ? ` · ${money.format(Number(p.maintenance_amount))}` : ""}`,
            tone: p.maintenance_status === "Expired" ? ("bad" as const) : ("warn" as const),
            action: canBook ? { href: newVisit(p.id), label: tr("Schedule visit") } : undefined,
          })),
        };
      })(),
    );
  }

  // F2 return cards: unfinished visits waiting for a return to be scheduled (office only).
  if (can("tasks") && can("visits") && canDo(user.permissions, visitsT, "create", getTable)) {
    jobs.push(
      (async () => {
        const { data } = await db
          .from("tasks")
          .select("id, title, due_date, priority, details, project_id, projects(title)")
          .contains("labels", ["Return"])
          .is("visit_id", null)
          .neq("status", "Completed")
          .is("deleted_at", null)
          .is("archived_at", null)
          .order("due_date");
        const tasksT = getTable("tasks");
        return {
          id: "returns",
          title: tr("Returns needed"),
          rows: ((data ?? []) as unknown as { id: number; due_date: string | null; priority: string | null; details: string | null; projects: { title: string | null } | null }[]).map((r) => ({
            href: recordHref(tasksT, r.id),
            title: r.projects?.title ?? tr("Task #{id}", { id: r.id }),
            meta: [r.priority === "Urgent" ? tr("2nd visit in a row not finished") : null, r.due_date ? tr("due {date}", { date: formatDate(r.due_date) }) : null].filter(Boolean).join(" · "),
            tone: r.priority === "Urgent" || (r.due_date && r.due_date < today) ? ("bad" as const) : ("warn" as const),
            action: { href: recordHref(tasksT, r.id), label: tr("Schedule") },
          })),
        };
      })(),
    );
  }

  // Documents expiring in the next 30 days (or already expired).
  jobs.push(
    (async () => {
      const rows: (Row & { date: string })[] = [];
      const add = async (table: string, col: string, what: string) => {
        if (!can(table)) return;
        const { data } = await db.from(table).select(`id, title, ${col}`).lte(col, in30).is("deleted_at", null).is("archived_at", null);
        for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
          const d = String(r[col]);
          rows.push({ date: d, href: recordHref(getTable(table), r.id as number), title: String(r.title ?? `#${r.id}`), meta: tr(d < today ? "{what} expired {date}" : "{what} expires {date}", { what: tr(what), date: formatDate(d) }), tone: d < today ? "bad" : "warn" });
        }
      };
      await Promise.all([
        add("buildings", "coi_expiration", "COI"),
        add("permits", "expiration_date", "Permit"),
        add("employees", "dl_expiration", "Driver's licence"),
        add("employees", "workers_comp_expiration", "Workers' comp exemption"),
      ]);
      // Long-expired documents are old news; show the last 60 days and what's coming.
      const recent = addDays(today, -60);
      return { id: "documents", title: tr("Documents expiring (30 days)"), rows: rows.filter((r) => r.date >= recent).sort((a, b) => a.date.localeCompare(b.date)) };
    })(),
  );

  const sections = (await Promise.all(jobs)).filter((s): s is Section => Boolean(s && s.rows.length));
  const tasksTable = getTable("tasks");
  const showTaskBox = can("tasks") && canDo(user.permissions, tasksTable, "create", getTable);
  const { data: me } = showTaskBox ? await db.from("employees").select("id").ilike("email", user.email).is("deleted_at", null).limit(1) : { data: null };

  return (
    <>
      {showTaskBox && <QuickTask employeeId={((me ?? []) as { id: number }[])[0]?.id ?? null} today={today} />}
      {sections.map((s) => (
        <SectionCard key={s.id} s={s} tr={tr} />
      ))}
    </>
  );
}
