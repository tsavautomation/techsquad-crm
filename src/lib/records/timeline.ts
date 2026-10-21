import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDateTimeLocalET, toDateTimeLocalET } from "@/lib/dates";
import { downloadUrls } from "@/lib/files/onedrive";
import { fieldChanges, type AuditRow } from "@/lib/requests/engine";
import { clock } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";

// F4 client timeline (docs/portal-features-merge.md §G, SPEC §9.1 F4-c): one list of everything that
// happened with a client or project — calls / texts / emails logged, notes, stage changes, visits,
// job reports and tasks. Each source is read with the user's own permissions (RLS).
// F26-1 (SPEC §9.1 F26-a): the project Timeline also shows check-in / check-out times on visits, Job Status
// changes from the audit log, tasks done, the project's request lines and the project_events stream
// (emails from F26-2 land there).

/** Names for the people on visits and reports, from the view every signed-in person may read. */
async function employeeNames(db: SupabaseClient, ids: (number | null)[]): Promise<Map<number, string>> {
  const wanted = [...new Set(ids.filter((x): x is number => x !== null))];
  if (!wanted.length) return new Map();
  const { data } = await db.from("employee_names").select("id, title").in("id", wanted);
  return new Map(((data ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
}

export type TimelineKind = "contact" | "note" | "stage" | "status" | "visit" | "report" | "task" | "request" | "email" | "event";
/** `title` parts are joined on screen, each through the screen language (stored values translate as options). */
export type TimelineItem = {
  key: string;
  at: string;
  kind: TimelineKind;
  title: string[];
  detail?: string;
  followUp?: string;
  who?: string;
  href?: string;
  project?: string;
  color?: string;
  /** Visits: the clock times (Eastern) of the day's steps. */
  times?: { onWay?: string; in?: string; out?: string };
  /** Files linked from the event (OneDrive, F26-2). */
  files?: { name: string; url: string; itemId?: string }[];
};

const timeOf = (iso: string | null) => (iso ? clock(toDateTimeLocalET(iso).slice(11, 16)) : undefined);

const LIMIT = 150;
// A date-only entry (an interaction's Date, a report's Date) keeps its real time when it was entered
// that same day (Eastern), otherwise it sorts at noon Eastern on that day.
const when = (d: string | null, created: string) => (!d || toDateTimeLocalET(created).slice(0, 10) === d ? created : fromDateTimeLocalET(`${d}T12:00`));

async function names(db: SupabaseClient, ids: (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const out = new Map<string, string>();
  if (!list.length) return out;
  const { data } = await db.from("profiles").select("id, first_name, last_name, email").in("id", list);
  for (const p of (data ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string }[]) out.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email);
  return out;
}

type Interaction = { id: number; type: string | null; date: string | null; result: string | null; notes: string | null; template: string | null; follow_up_date: string | null; created_at: string; created_by: string | null; contact_id: number; project_id: number | null; contacts: { title: string | null } | null };

/** Timeline of a project, or of a contact (their interactions + everything on the projects they own). */
export async function loadTimeline(db: SupabaseClient, perms: ReadonlySet<string>, table: "projects" | "contacts", id: number): Promise<TimelineItem[]> {
  const can = (t: string) => canOpen(perms, getTable(t), getTable);
  const items: TimelineItem[] = [];
  const who: (string | null)[] = [];
  const pending: { item: TimelineItem; by: string | null }[] = [];
  const push = (item: TimelineItem, by: string | null = null) => {
    pending.push({ item, by });
    who.push(by);
  };

  // Which projects belong here, and their names (shown on a contact's timeline).
  let projectIds: number[] = [];
  const projectName = new Map<number, string>();
  if (table === "projects") projectIds = [id];
  else if (can("projects")) {
    const { data } = await db.from("projects").select("id, title").eq("job_owner_id", id).is("deleted_at", null);
    for (const p of (data ?? []) as { id: number; title: string | null }[]) projectName.set(p.id, p.title ?? `#${p.id}`);
    projectIds = [...projectName.keys()];
  }
  const onProject = (pid: number | null) => (table === "contacts" && pid ? projectName.get(pid) : undefined);
  const jobs: PromiseLike<unknown>[] = [];

  // Calls, texts and emails logged (Interactions).
  if (can("contact_interactions")) {
    let q = db.from("contact_interactions").select("id, type, date, result, notes, template, follow_up_date, created_at, created_by, contact_id, project_id, contacts(title)").is("deleted_at", null).order("created_at", { ascending: false }).limit(LIMIT);
    q = table === "projects" ? q.eq("project_id", id) : q.eq("contact_id", id);
    jobs.push(
      q.then(({ data }) => {
        for (const r of (data ?? []) as unknown as Interaction[]) {
          const at = when(r.date, r.created_at);
          push(
            {
              key: `i${r.id}`,
              at,
              kind: "contact",
              title: [r.type ?? "Interaction", table === "projects" ? r.contacts?.title : null, r.result].filter((x): x is string => Boolean(x)),
              detail: r.notes ?? undefined,
              followUp: r.follow_up_date ?? undefined,
              href: `${recordHref(getTable("contacts"), r.contact_id)}/sub/contact_interactions/${r.id}/edit`,
              project: onProject(r.project_id),
            },
            r.created_by,
          );
        }
      }),
    );
  }

  // Notes on the record itself.
  jobs.push(
    db
      .from("record_notes")
      .select("id, body, created_at, created_by")
      .eq("table_name", table)
      .eq("record_id", id)
      .order("created_at", { ascending: false })
      .limit(LIMIT)
      .then(({ data }) => {
        for (const n of (data ?? []) as { id: number; body: string; created_at: string; created_by: string | null }[]) push({ key: `n${n.id}`, at: n.created_at, kind: "note", title: ["Note"], detail: n.body }, n.created_by);
      }),
  );

  if (projectIds.length) {
    // Stage changes (workflow).
    jobs.push(
      Promise.all([
        db.from("workflow_events").select("id, record_id, to_level_id, outcome, comment, at, actor").eq("table_name", "projects").in("record_id", projectIds).order("at", { ascending: false }).limit(LIMIT),
        db.from("workflow_levels").select("id, title, color"),
      ]).then(([{ data }, { data: lv }]) => {
        const levels = new Map(((lv ?? []) as { id: number; title: string; color: string }[]).map((l) => [l.id, l]));
        for (const e of (data ?? []) as { id: number; record_id: number; to_level_id: number | null; outcome: string; comment: string | null; at: string; actor: string | null }[]) {
          const to = e.to_level_id ? levels.get(e.to_level_id) : undefined;
          push({ key: `w${e.id}`, at: e.at, kind: "stage", title: to ? ["Stage", to.title] : [e.outcome], detail: e.comment ?? undefined, color: to?.color, project: onProject(e.record_id) }, e.actor);
        }
      }),
    );
    if (can("visits")) {
      const vt = getTable("visits");
      jobs.push(
        db
          .from("visits")
          .select("id, project_id, starts_at, status, service_type, technician_id, on_way_at, checked_in_at, checked_out_at, visits_team(target_id)")
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("starts_at", { ascending: false })
          .limit(LIMIT)
          .then(async ({ data }) => {
            // Titled with the people who went and the date (Fred 2026-10-05: "Technician and Date as title, not Visit done").
            const rows = (data ?? []) as unknown as { id: number; project_id: number; starts_at: string; status: string | null; service_type: string | null; technician_id: number | null; on_way_at: string | null; checked_in_at: string | null; checked_out_at: string | null; visits_team: { target_id: number }[] }[];
            const names = await employeeNames(db, rows.flatMap((v) => [v.technician_id, ...v.visits_team.map((t) => t.target_id)]));
            for (const v of rows) {
              const people = [v.technician_id, ...v.visits_team.map((t) => t.target_id)].filter((x): x is number => x !== null).map((id) => names.get(id)).filter((x): x is string => Boolean(x));
              const title = people.length ? [people.join(", ")] : ["Visit"];
              if (v.status && v.status !== "Done") title.push(v.status);
              const times = v.on_way_at || v.checked_in_at || v.checked_out_at ? { onWay: timeOf(v.on_way_at), in: timeOf(v.checked_in_at), out: timeOf(v.checked_out_at) } : undefined;
              push({ key: `v${v.id}`, at: v.starts_at, kind: "visit", title, detail: v.service_type ?? undefined, href: recordHref(vt, v.id), project: onProject(v.project_id), times });
            }
          }),
      );
    }
    if (can("job_reports")) {
      const rt = getTable("job_reports");
      jobs.push(
        db
          .from("job_reports")
          .select("id, project_id, date, result, created_at, created_by, job_reports_team(target_id)")
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(LIMIT)
          .then(async ({ data }) => {
            // Titled with the team and the date; the result follows when the report has one.
            const rows = (data ?? []) as unknown as { id: number; project_id: number; date: string | null; result: string | null; created_at: string; created_by: string | null; job_reports_team: { target_id: number }[] }[];
            const names = await employeeNames(db, rows.flatMap((r) => r.job_reports_team.map((t) => t.target_id)));
            for (const r of rows) {
              const people = r.job_reports_team.map((t) => names.get(t.target_id)).filter((x): x is string => Boolean(x));
              const title = people.length ? [people.join(", ")] : ["Job Report"];
              if (r.result) title.push(r.result);
              push({ key: `r${r.id}`, at: when(r.date, r.created_at), kind: "report", title, href: recordHref(rt, r.id), project: onProject(r.project_id) }, people.length ? null : r.created_by);
            }
          }),
      );
    }
    if (can("tasks")) {
      const tt = getTable("tasks");
      jobs.push(
        db
          .from("tasks")
          .select("id, project_id, details, status, created_at, created_by")
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(LIMIT)
          .then(async ({ data }) => {
            const rows = (data ?? []) as { id: number; project_id: number; details: string | null; status: string | null; created_at: string; created_by: string | null }[];
            const firstLine = (r: { details: string | null }) => (r.details ?? "").split("\n")[0].slice(0, 160) || undefined;
            for (const r of rows) push({ key: `t${r.id}`, at: r.created_at, kind: "task", title: ["Task", r.status ?? "Pending"], detail: firstLine(r), href: recordHref(tt, r.id), project: onProject(r.project_id) }, r.created_by);
            // Tasks done: the moment the status became Completed, from the audit log (people without the History permission see none).
            const done = rows.filter((r) => r.status === "Completed");
            if (!done.length) return;
            const byId = new Map(done.map((r) => [r.id, r]));
            const { data: log } = await db.from("audit_log").select("id, record_id, action, at, actor, changes").eq("table_name", "tasks").in("record_id", done.map((r) => r.id)).order("at", { ascending: false }).limit(LIMIT);
            for (const c of fieldChanges((log ?? []) as AuditRow[], "status").filter((c) => c.to === "Completed")) {
              const r = byId.get(c.recordId)!;
              push({ key: `td${c.auditId}`, at: c.at, kind: "task", title: ["Task done"], detail: firstLine(r), href: recordHref(tt, r.id), project: onProject(r.project_id), color: "#16a34a" }, c.actor);
            }
          }),
      );
    }

    // Job Status changes (and the project's creation), from the audit log.
    const statusColor = new Map((getTable("projects").fields.find((f) => f.name === "job_status")?.options ?? []).map((o) => [o.value, o.color]));
    jobs.push(
      db
        .from("audit_log")
        .select("id, record_id, action, at, actor, changes")
        .eq("table_name", "projects")
        .in("record_id", projectIds)
        .or('action.eq.create,changes.cs.{"job_status":[]}')
        .order("at", { ascending: false })
        .limit(LIMIT)
        .then(({ data }) => {
          const rows = (data ?? []) as AuditRow[];
          for (const r of rows) if (r.action === "create") push({ key: `pc${r.id}`, at: r.at, kind: "status", title: ["Project created"], project: onProject(r.record_id) }, r.actor);
          for (const c of fieldChanges(rows, "job_status")) push({ key: `ps${c.auditId}`, at: c.at, kind: "status", title: ["Job Status", c.to!], color: statusColor.get(c.to!), project: onProject(c.recordId) }, c.actor);
        }),
    );

    // Request lines (F26-1): when they came in, and when they were closed.
    const projectsT = getTable("projects");
    jobs.push(
      db
        .from("project_requests")
        .select("id, project_id, date, type, description, status, closed_by, closed_at, created_at, created_by")
        .in("project_id", projectIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(LIMIT)
        .then(({ data }) => {
          for (const r of (data ?? []) as { id: number; project_id: number; date: string; type: string; description: string | null; status: string; closed_by: string | null; closed_at: string | null; created_at: string; created_by: string | null }[]) {
            const href = `${recordHref(projectsT, r.project_id)}#requests`;
            push({ key: `q${r.id}`, at: when(r.date, r.created_at), kind: "request", title: ["Request", r.type], detail: r.description ?? undefined, href, project: onProject(r.project_id), color: "#d97706" }, r.created_by);
            if (r.status === "Done" && r.closed_at) push({ key: `qd${r.id}`, at: r.closed_at, kind: "request", title: ["Request done", r.type], href, project: onProject(r.project_id), color: "#16a34a" }, r.closed_by);
          }
        }),
    );

    // The events stream (emails and other messages that have no record of their own).
    jobs.push(
      db
        .from("project_events")
        .select("id, project_id, channel, occurred_at, actor, actor_user, title, body, attachments")
        .in("project_id", projectIds)
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false })
        .limit(LIMIT)
        .then(({ data }) => {
          for (const e of (data ?? []) as { id: number; project_id: number; channel: string; occurred_at: string; actor: string | null; actor_user: string | null; title: string; body: string | null; attachments: { name: string; url?: string; item_id?: string | null }[] | null }[]) {
            const item: TimelineItem = { key: `e${e.id}`, at: e.occurred_at, kind: e.channel === "email" ? "email" : "event", title: [e.title], detail: e.body ?? undefined, project: onProject(e.project_id), files: (e.attachments ?? []).filter((f) => f?.name).map((f) => ({ name: f.name, url: f.url ?? "", itemId: f.item_id ?? undefined })) };
            if (e.actor && !e.actor_user) item.who = e.actor;
            push(item, e.actor_user);
          }
        }),
    );
  }

  await Promise.all(jobs);
  // F26-2: OneDrive links for the emails' files (short-lived download links; none when OneDrive is off).
  const itemIds = [...new Set(pending.flatMap((p) => (p.item.files ?? []).map((f) => f.itemId).filter((x): x is string => Boolean(x))))];
  if (itemIds.length) {
    const urls = await downloadUrls(itemIds).catch(() => new Map<string, string>());
    for (const p of pending) for (const f of p.item.files ?? []) if (f.itemId && !f.url) f.url = urls.get(f.itemId) ?? "";
  }
  const by = await names(db, who);
  for (const { item, by: uid } of pending) items.push({ ...item, at: new Date(item.at).toISOString(), ...(uid ? { who: by.get(uid) } : {}) });
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, LIMIT);
}
