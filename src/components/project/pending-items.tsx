import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { openPendingFor } from "@/lib/field-day/pending";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

// F17-d Open pending items on the project page: the return cards (F2-c) still open, with the
// report they came from and their open lines. Nothing to show → no card.

export async function PendingItems({ projectId, user }: { projectId: number; user: CurrentUser }) {
  const tasksT = getTable("tasks");
  if (!canOpen(user.permissions, tasksT, getTable)) return null;
  const tr = await getT();
  const db = await recordsDb();
  const items = await openPendingFor(db, projectId);
  if (!items.length) return null;
  const reportsT = getTable("job_reports");
  const lines = items.reduce((n, i) => n + i.items.length, 0);

  return (
    <section id="pending" className="mb-3.5 scroll-mt-20 rounded-2xl border border-warn-fg/30 bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-warn-fg">
        <TriangleAlert className="size-4" aria-hidden /> {tr("Open pending items")}
      </h2>
      <p className="mb-3 text-[13px] text-text-2">
        {items.length === 1 ? tr("1 return card still open from an earlier visit") : tr("{n} return cards still open from earlier visits", { n: items.length })}
        {lines ? ` · ${lines === 1 ? tr("1 item still to do") : tr("{m} items still to do", { m: lines })}` : ""}.
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.taskId} className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <Link href={recordHref(tasksT, i.taskId)} className="font-semibold hover:underline">
                {i.title}
              </Link>
              <span className="text-xs">
                {tr(i.status)}
                {i.priority ? ` · ${tr(i.priority)}` : ""}
                {i.due ? ` · ${tr("due {date}", { date: formatDate(i.due) })}` : ""}
              </span>
            </div>
            {i.items.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {i.items.map((line, n) => (
                  <li key={n}>{line}</li>
                ))}
              </ul>
            )}
            {i.reportId && (
              <Link href={recordHref(reportsT, i.reportId)} className="mt-1 inline-block text-xs underline underline-offset-2">
                {i.reportDate ? tr("From the Job Report of {date}", { date: formatDate(i.reportDate) }) : tr("From the Job Report")}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
