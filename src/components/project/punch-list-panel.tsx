import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { recordHref, tableHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

// F21-d (Fred 2026-10-07): the project's open Punch List items in a card of their own near the top of
// the project page, instead of a count lost in "Related records" at the bottom.

const CLOSED = new Set(["Completed", "Canceled", "Expired"]);

export async function PunchListPanel({ projectId, user }: { projectId: number; user: CurrentUser }) {
  const t = getTable("punch_list_items");
  if (!canOpen(user.permissions, t, getTable)) return null;
  const tr = await getT();
  const db = await recordsDb();
  const { data } = await db.from(t.name).select("id, title, status, priority, due_date, type").eq("project_id", projectId).is("deleted_at", null).is("archived_at", null).order("due_date", { ascending: true, nullsFirst: false }).order("id");
  const rows = ((data ?? []) as { id: number; title: string | null; status: string | null; priority: string | null; due_date: string | null; type: string | null }[]).filter((r) => !CLOSED.has(r.status ?? ""));
  const canAdd = canDo(user.permissions, t, "create", getTable);
  const projectHref = recordHref(getTable("projects"), projectId);
  const newHref = `${tableHref(t)}/new?project_id=${projectId}&back=${encodeURIComponent(projectHref)}`;
  const allHref = `${tableHref(t)}?f.project_id=${projectId}`;
  const option = (field: string, value: string | null) => t.fields.find((f) => f.name === field)?.options?.find((o) => o.value === value);

  return (
    <section id="punch-list" className="mb-3.5 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <ListChecks className="size-4" aria-hidden /> {tr("Punch List")} <span className="font-normal text-muted-foreground">({rows.length})</span>
        </h2>
        <div className="flex items-center gap-3 text-[13px]">
          <Link href={allHref} className="text-text-2 underline underline-offset-2">
            {tr("See all")}
          </Link>
          {canAdd && (
            <Link href={newHref} className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 font-semibold hover:bg-muted">
              <Plus className="size-4" aria-hidden /> {tr("New Item")}
            </Link>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr("No open punch list items.")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.map((r) => {
            const status = option("status", r.status);
            const priority = option("priority", r.priority);
            return (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
                <Link href={recordHref(t, r.id)} className="min-w-0 flex-1 font-medium hover:underline">
                  {r.title || `#${r.id}`}
                </Link>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-text-2">
                  {r.type && <span>{tr(r.type)}</span>}
                  {priority && (
                    <span className="rounded-full px-2 py-0.5 font-medium" style={priority.color ? { background: `${priority.color}22`, color: priority.color } : undefined}>
                      {tr(priority.label)}
                    </span>
                  )}
                  {status && (
                    <span className="rounded-full px-2 py-0.5 font-medium" style={status.color ? { background: `${status.color}22`, color: status.color } : undefined}>
                      {tr(status.label)}
                    </span>
                  )}
                  {!status && r.status && <span>{tr(r.status)}</span>}
                  {r.due_date && <span>{tr("due {date}", { date: formatDate(r.due_date) })}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
