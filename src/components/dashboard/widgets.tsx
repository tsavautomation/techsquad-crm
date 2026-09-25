import Link from "next/link";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable, REGISTRY } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import type { TableDef } from "@/registry/types";

// Dashboard widgets (PLAN M12): My Assigned (workflow stages I may act on), My Tasks (tasks whose
// Member is the employee with my email) and Recently Modified. Row-level security decides what
// each person sees; `module` narrows a module's own dashboard to its tables.

type Item = { href: string; title: string; meta: string; color?: string | null };

const known = new Set(REGISTRY.map((t) => t.name));

async function titlesFor(pairs: { table: string; id: number }[]): Promise<Map<string, string | null>> {
  const db = await recordsDb();
  const out = new Map<string, string | null>();
  const byTable = Map.groupBy(pairs, (p) => p.table);
  await Promise.all(
    [...byTable.entries()].map(async ([table, list]) => {
      const { data } = await db.from(table).select("id, title").in("id", [...new Set(list.map((p) => p.id))]).is("deleted_at", null);
      for (const r of (data ?? []) as { id: number; title: string | null }[]) out.set(`${table}:${r.id}`, r.title);
    }),
  );
  return out;
}

function inModule(table: string, module?: string) {
  return known.has(table) && (!module || getTable(table).module === module);
}

async function myAssigned(user: CurrentUser, module?: string): Promise<Item[]> {
  const db = await recordsDb();
  const { data } = await db.rpc("my_workflow_queue");
  const rows = ((data ?? []) as { table_name: string; record_id: number; level_title: string; level_color: string | null; entered_at: string }[]).filter(
    (r) => inModule(r.table_name, module) && canOpen(user.permissions, getTable(r.table_name), getTable),
  );
  const titles = await titlesFor(rows.map((r) => ({ table: r.table_name, id: r.record_id })));
  return rows
    .filter((r) => titles.has(`${r.table_name}:${r.record_id}`))
    .slice(0, 15)
    .map((r) => {
      const t = getTable(r.table_name);
      return {
        href: recordHref(t, r.record_id),
        title: titles.get(`${r.table_name}:${r.record_id}`) || `${t.itemLabel} #${r.record_id}`,
        meta: `${r.level_title} · since ${formatDate(r.entered_at)}`,
        color: r.level_color,
      };
    });
}

async function myTasks(user: CurrentUser): Promise<Item[]> {
  const db = await recordsDb();
  const { data: emp } = await db.from("employees").select("id").ilike("email", user.email).is("deleted_at", null);
  const ids = ((emp ?? []) as { id: number }[]).map((e) => e.id);
  if (!ids.length) return [];
  const { data } = await db
    .from("tasks")
    .select("id, title, status, due_date")
    .in("member_id", ids)
    .neq("status", "Completed")
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(15);
  const t = getTable("tasks");
  const status = t.fields.find((f) => f.name === "status");
  return ((data ?? []) as { id: number; title: string | null; status: string | null; due_date: string | null }[]).map((r) => ({
    href: recordHref(t, r.id),
    title: r.title || `${t.itemLabel} #${r.id}`,
    meta: [r.status, r.due_date && `due ${formatDate(r.due_date)}`].filter(Boolean).join(" · "),
    color: status?.options?.find((o) => o.value === r.status)?.color,
  }));
}

async function recentlyModified(user: CurrentUser, module?: string): Promise<Item[]> {
  const db = await recordsDb();
  const tables = REGISTRY.filter((t) => (t.tab || t.module === "utility") && (!module || t.module === module) && canOpen(user.permissions, t, getTable)).map((t) => t.name);
  if (!tables.length) return [];
  const { data } = await db.from("audit_log").select("table_name, record_id, at").in("table_name", tables).order("id", { ascending: false }).limit(80);
  const seen = new Set<string>();
  const rows = ((data ?? []) as { table_name: string; record_id: number; at: string }[]).filter((r) => {
    const k = `${r.table_name}:${r.record_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const titles = await titlesFor(rows.map((r) => ({ table: r.table_name, id: r.record_id })));
  return rows
    .filter((r) => titles.has(`${r.table_name}:${r.record_id}`)) // deleted records drop out
    .slice(0, 10)
    .map((r) => {
      const t: TableDef = getTable(r.table_name);
      return { href: recordHref(t, r.record_id), title: titles.get(`${r.table_name}:${r.record_id}`) || `${t.itemLabel} #${r.record_id}`, meta: `${t.itemLabel} · ${formatDateTime(r.at)}` };
    });
}

function Widget({ title, empty, items }: { title: string; empty: string; items: Item[] }) {
  return (
    <section className="rounded-xl border">
      <h2 className="border-b px-4 py-3 text-base font-semibold">{title}</h2>
      {!items.length ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {items.map((i) => (
            <li key={i.href}>
              <Link href={i.href} className="flex min-h-12 flex-col justify-center px-4 py-2 hover:bg-muted/50 active:bg-muted">
                <span className="text-sm font-medium">{i.title}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {i.color && <span className="inline-block size-2 rounded-full" style={{ backgroundColor: i.color }} aria-hidden />}
                  {i.meta}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export async function DashboardWidgets({ user, module }: { user: CurrentUser; module?: string }) {
  const showTasks = !module || module === getTable("tasks").module;
  const [assigned, tasks, recent] = await Promise.all([myAssigned(user, module), showTasks ? myTasks(user) : Promise.resolve(null), recentlyModified(user, module)]);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Widget title="My Assigned" empty="Nothing waiting for you." items={assigned} />
      {tasks && <Widget title="My Tasks" empty="No open tasks assigned to you." items={tasks} />}
      <Widget title="Recently Modified" empty="No recent changes." items={recent} />
    </div>
  );
}
