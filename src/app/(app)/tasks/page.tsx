import { notFound } from "next/navigation";
import { TaskBoard, type BoardCard, type BoardColumn } from "@/components/tasks/board";
import { requireUser } from "@/lib/auth/session";
import { todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Tasks") };
}

type Row = { id: number; details: string | null; member_id: number | null; due_date: string | null; priority: string | null; status: string | null };

/** Tasks board (Portal "Tarefas"): the Administrative › Tasks records as columns by status. */
export default async function TasksPage(props: PageProps<"/tasks">) {
  const tr = await getT();
  const user = await requireUser();
  const t = getTable("tasks");
  if (!canOpen(user.permissions, t, getTable)) notFound();
  const { who = "" } = (await props.searchParams) as { who?: string };
  const db = await recordsDb();

  const { data: meRow } = await db.from("employees").select("id").ilike("email", user.email).is("deleted_at", null).limit(1);
  const me = ((meRow ?? []) as { id: number }[])[0]?.id ?? null;
  const filterId = who === "me" ? me : /^\d+$/.test(who) ? Number(who) : null;

  let q = db.from("tasks").select("id, details, member_id, due_date, priority, status").is("deleted_at", null).is("archived_at", null).order("due_date", { ascending: true, nullsFirst: false }).limit(500);
  if (filterId) q = q.eq("member_id", filterId);
  const [{ data }, { data: emp }] = await Promise.all([q, db.from("employees").select("id, title").is("deleted_at", null).order("title")]);
  const rows = (data ?? []) as Row[];
  const names = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));

  // Checklist progress per task (record checklist items).
  const ids = rows.map((r) => r.id);
  const { data: chk } = ids.length ? await db.from("record_checklist_items").select("record_id, completed_at").eq("table_name", "tasks").in("record_id", ids) : { data: [] };
  const progress = new Map<number, { done: number; total: number }>();
  for (const c of (chk ?? []) as { record_id: number; completed_at: string | null }[]) {
    const p = progress.get(c.record_id) ?? { done: 0, total: 0 };
    p.total++;
    if (c.completed_at) p.done++;
    progress.set(c.record_id, p);
  }

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
  }));
  const people = [...new Set(rows.map((r) => r.member_id).filter((x): x is number => x !== null))].map((id) => ({ id, name: names.get(id) ?? `#${id}` })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Tasks")}</h1>
      <p className="mb-4 text-[12.5px] text-muted-foreground">Team board by status. Drag a card to move it; open it for details, checklist and notes.</p>
      <TaskBoard
        columns={columns}
        cards={cards}
        people={people}
        today={todayET()}
        canEdit={canDo(user.permissions, t, "modify", getTable)}
        canCreate={canDo(user.permissions, t, "create", getTable)}
        me={me}
        who={who}
      />
    </div>
  );
}
