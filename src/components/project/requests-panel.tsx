import Link from "next/link";
import { MessageSquareWarning, Pencil, Plus } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { isRecipient, loadProjectRequests, logAck } from "@/lib/requests/load";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { RequestLineActions } from "./request-line-actions";

// F26-1 Project requests (SPEC §9.1 F26-a / F26-c): the RFI / change order / other lines on a project,
// Open first, each with who asked, who closed it and the shared-alert log (read / acknowledged / cleared).
// Opening the page as one of the alert's recipients logs "read".

const TYPE_COLOR = new Map((getTable("project_requests").fields.find((f) => f.name === "type")?.options ?? []).map((o) => [o.value, o.color ?? "#6b7280"]));
const ACTION_LABEL = { read: "Read", acknowledged: "Acknowledged", cleared: "Cleared" } as const;

export async function RequestsPanel({ projectId, user }: { projectId: number; user: CurrentUser }) {
  const t = getTable("project_requests");
  if (!canOpen(user.permissions, t, getTable)) return null;
  const tr = await getT();
  const db = await recordsDb();
  const recipient = (await isRecipient(db, user)) || user.isSysadmin;
  if (recipient) {
    const { data } = await db.from("project_requests").select("id").eq("project_id", projectId).eq("status", "Open").is("deleted_at", null);
    await logAck(db, user.id, ((data ?? []) as { id: number }[]).map((r) => r.id), "read");
  }
  const lines = await loadProjectRequests(db, projectId);
  const canModify = canDo(user.permissions, t, "modify", getTable);
  const base = recordHref(getTable("projects"), projectId);
  const open = lines.filter((l) => l.status === "Open").length;
  if (!lines.length && !canModify) return null;

  return (
    <section id="requests" className={cn("mb-3.5 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card", open > 0 && "border-warn-fg/30")}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className={cn("flex items-center gap-2 text-[15px] font-semibold tracking-tight", open > 0 && "text-warn-fg")}>
          <MessageSquareWarning className="size-4" aria-hidden /> {tr("Project requests")}
          {open > 0 && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs">{open}</span>}
        </h2>
        {canModify && (
          <Link href={`${base}/sub/project_requests/new`} className="inline-flex h-9 items-center gap-1 rounded-[10px] border px-3 text-[13px] font-medium hover:bg-muted">
            <Plus className="size-4" aria-hidden /> {tr("Add request")}
          </Link>
        )}
      </div>
      <p className="mb-3 text-[13px] text-text-2">{tr("RFIs, change orders and other asks that reached the office. One clear clears the alert for everyone.")}</p>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr("No requests yet.")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lines.map((l) => {
            const done = l.status === "Done";
            return (
              <li key={l.id} className={cn("rounded-xl border px-3 py-2 text-sm", done ? "bg-muted/40" : "border-warn-fg/30 bg-warn-bg/40")}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: TYPE_COLOR.get(l.type) ?? "#6b7280" }}>
                      {tr(l.type)}
                    </span>
                    <span className="font-medium">{formatDate(l.date)}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className={cn("rounded-full px-2 py-0.5 font-medium", done ? "bg-ok-bg text-ok-fg" : "bg-warn-bg text-warn-fg")}>{tr(l.status)}</span>
                    {canModify && (
                      <Link href={`${base}/sub/project_requests/${l.id}/edit`} aria-label={tr("Edit request")} className="inline-flex size-8 items-center justify-center rounded border hover:bg-muted">
                        <Pencil className="size-3.5" aria-hidden />
                      </Link>
                    )}
                  </span>
                </div>
                {l.description && <p className="mt-1 whitespace-pre-line">{l.description}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {l.who ? tr("Added by {who} on {when}", { who: l.who, when: formatDateTime(l.created_at) }) : tr("Added {when}", { when: formatDateTime(l.created_at) })}
                  {done && l.closed_at ? ` · ${l.closedBy ? tr("Done by {who} on {when}", { who: l.closedBy, when: formatDateTime(l.closed_at) }) : tr("Done {when}", { when: formatDateTime(l.closed_at) })}` : ""}
                </p>
                {l.log.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {l.log.map((a) => `${tr(ACTION_LABEL[a.action])}: ${a.who} ${formatDateTime(a.at)}`).join(" · ")}
                  </p>
                )}
                {(canModify || (recipient && !done && !l.cleared)) && (
                  <RequestLineActions id={l.id} done={done} canModify={canModify} canAck={recipient && !done && !l.cleared} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
