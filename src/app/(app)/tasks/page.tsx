import { notFound } from "next/navigation";
import { TaskBoard, type BoardCard, type BoardColumn } from "@/components/tasks/board";
import { requireUser } from "@/lib/auth/session";
import { formatDate, todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { departmentOfCategory, DEPARTMENTS, type Department } from "@/lib/time-clock/period";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Tasks") };
}

type Row = {
  id: number;
  details: string | null;
  member_id: number | null;
  due_date: string | null;
  priority: string | null;
  status: string | null;
  labels: string[] | null;
  private: boolean;
  ai_done_report_id: number | null;
  ai_done_quote: string | null;
  ai_done_at: string | null;
  projects: { title: string | null; category: string | null; contacts: { title: string | null } | null } | null;
};

/** Tasks board (Portal "Tarefas"): the Administrative › Tasks records as columns by status. J-y: client and department filters. */
export default async function TasksPage(props: PageProps<"/tasks">) {
  const tr = await getT();
  const user = await requireUser();
  const t = getTable("tasks");
  if (!canOpen(user.permissions, t, getTable)) notFound();
  const { who = "", label = "", client = "", dept: deptParam = "" } = (await props.searchParams) as { who?: string; label?: string; client?: string; dept?: string };
  const dept: Department | "" = (DEPARTMENTS as readonly string[]).includes(deptParam) ? (deptParam as Department) : "";
  const db = await recordsDb();

  const { data: meRow } = await db.from("employee_names").select("id").ilike("email", user.email).is("deleted_at", null).limit(1);
  const me = ((meRow ?? []) as { id: number }[])[0]?.id ?? null;
  const filterId = who === "me" ? me : /^\d+$/.test(who) ? Number(who) : null;

  let q = db
    .from("tasks")
    .select("id, details, member_id, due_date, priority, status, labels, private, ai_done_report_id, ai_done_quote, ai_done_at, projects(title, category, contacts:job_owner_id(title))")
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(500);
  if (filterId) q = q.eq("member_id", filterId);
  const labelOptions = (t.fields.find((f) => f.name === "labels")?.options ?? []).filter((o) => !o.retired);
  if (labelOptions.some((o) => o.value === label)) q = q.contains("labels", [label]);
  const [{ data }, { data: emp }] = await Promise.all([q, db.from("employee_names").select("id, title").is("deleted_at", null).order("title")]);
  const all = (data ?? []) as unknown as Row[];
  // J-y: the client is the project's owner contact; the department is the project's Category.
  const clients = [...new Set(all.map((r) => r.projects?.contacts?.title?.trim()).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b));
  const rows = all.filter((r) => (!client || r.projects?.contacts?.title?.trim() === client) && (!dept || departmentOfCategory(r.projects?.category) === dept));
  const names = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));

  // Checklist progress and notes per task (record checklist items, record notes).
  const ids = rows.map((r) => r.id);
  const [{ data: chk }, { data: notes }] = ids.length
    ? await Promise.all([
        db.from("record_checklist_items").select("record_id, completed_at").eq("table_name", "tasks").in("record_id", ids),
        db.from("record_notes").select("record_id").eq("table_name", "tasks").in("record_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const noteCount = new Map<number, number>();
  for (const n of (notes ?? []) as { record_id: number }[]) noteCount.set(n.record_id, (noteCount.get(n.record_id) ?? 0) + 1);
  const progress = new Map<number, { done: number; total: number }>();
  for (const c of (chk ?? []) as { record_id: number; completed_at: string | null }[]) {
    const p = progress.get(c.record_id) ?? { done: 0, total: 0 };
    p.total++;
    if (c.completed_at) p.done++;
    progress.set(c.record_id, p);
  }
  // J-z: the date of each report the AI pointed at.
  const reportIds = [...new Set(rows.map((r) => r.ai_done_report_id).filter((x): x is number => x !== null))];
  const { data: reportRows } = reportIds.length ? await db.from("job_reports").select("id, date").in("id", reportIds) : { data: [] };
  const reportDate = new Map(((reportRows ?? []) as { id: number; date: string | null }[]).map((r) => [r.id, r.date]));

  const statusField = t.fields.find((f) => f.name === "status")!;
  const columns: BoardColumn[] = (statusField.options ?? []).filter((o) => !o.retired).map((o) => ({ value: o.value, label: o.label, color: o.color ?? "#94a3b8" }));
  const first = columns[0]?.value ?? "Pending";
  const cards: BoardCard[] = rows.map((r) => ({
    id: r.id,
    details: r.details ?? "",
    member: r.member_id ? (names.get(r.member_id) ?? null) : null,
    memberId: r.member_id,
    due: r.due_date,
    priority: r.priority,
    status: columns.some((c) => c.value === r.status) ? r.status! : first,
    checklist: progress.get(r.id) ?? { done: 0, total: 0 },
    labels: (r.labels ?? []).map((v) => labelOptions.find((o) => o.value === v) ?? { value: v, label: v }).map((o) => ({ label: o.label, color: ("color" in o && o.color) || "#64748b" })),
    project: r.projects?.title ?? null,
    notes: noteCount.get(r.id) ?? 0,
    private: r.private,
    aiDone: r.ai_done_at && r.ai_done_report_id && r.status !== "Completed" ? { reportId: r.ai_done_report_id, reportDate: reportDate.get(r.ai_done_report_id) ? formatDate(reportDate.get(r.ai_done_report_id)!) : null, quote: r.ai_done_quote ?? "" } : null,
  }));
  const people = [...new Set(all.map((r) => r.member_id).filter((x): x is number => x !== null))].map((id) => ({ id, name: names.get(id) ?? `#${id}` })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Tasks")}</h1>
      <p className="mb-4 text-xs text-muted-foreground">{tr("Team board by status. Drag a card (or use Move to…) to change its status; open it for details, checklist and notes.")}</p>
      <TaskBoard
        columns={columns}
        cards={cards}
        people={people}
        today={todayET()}
        canEdit={canDo(user.permissions, t, "modify", getTable)}
        canCreate={canDo(user.permissions, t, "create", getTable)}
        me={me}
        who={who}
        label={label}
        labels={labelOptions.map((o) => ({ value: o.value, label: o.label }))}
        client={client}
        clients={clients}
        dept={dept}
        departments={DEPARTMENTS.map((d) => ({ value: d, label: d === "LOW VOLTAGE" ? "Low Voltage" : "Electrical" }))}
      />
    </div>
  );
}
