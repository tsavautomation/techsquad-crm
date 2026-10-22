"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/dates";
import { updateWaTaskAction } from "@/lib/whatsapp/actions";
import type { WaTask } from "@/lib/whatsapp/load";
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL, STATUSES, telHref, tone, type Tone } from "@/lib/whatsapp/triage-engine";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// F28 WhatsApp board. Computers: one column per category (service calls, follow-ups, quotes, scheduling, FYI),
// urgent first in each. Phones: one list, urgent first. Every card is coloured by what it needs from us
// (red urgent, yellow follow-up, green nothing, grey finished) and carries the status and the person on it.
// The page refreshes itself every 20 seconds while it is on screen, so the whole team sees the same board.

const REFRESH_MS = 20_000;

const TONE: Record<Tone, string> = {
  bad: "border-l-bad-fg bg-bad-bg/60",
  warn: "border-l-warn-fg bg-warn-bg/60",
  ok: "border-l-ok-fg bg-ok-bg/60",
  muted: "border-l-border bg-muted/60 text-muted-foreground",
};

export function WaBoard({ tasks, people }: { tasks: WaTask[]; people: string[] }) {
  const t = useT();
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  if (!tasks.length) return <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{t("No WhatsApp messages in this period.")}</p>;

  return (
    <>
      {/* Phones: one list, urgent first. */}
      <ul className="grid gap-3 md:hidden">
        {tasks.map((task) => (
          <li key={task.id}>
            <Card task={task} people={people} showCategory />
          </li>
        ))}
      </ul>

      {/* Computers: a column per category. */}
      <div className="hidden gap-3 overflow-x-auto pb-2 md:flex">
        {CATEGORIES.map((c) => {
          const list = tasks.filter((x) => x.category === c);
          return (
            <section key={c} className="flex w-[290px] shrink-0 flex-col gap-2 rounded-2xl bg-muted/60 p-2" aria-label={t(CATEGORY_LABEL[c])}>
              <h2 className="flex items-baseline justify-between px-1 pt-1 text-[13px] font-semibold tracking-tight">
                <span>
                  <span aria-hidden>{CATEGORY_ICON[c]}</span> {t(CATEGORY_LABEL[c])}
                </span>
                <span className="text-xs font-normal text-text-2 tabular-nums">{list.length}</span>
              </h2>
              {list.map((task) => (
                <Card key={task.id} task={task} people={people} />
              ))}
            </section>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-text-2">{t("Refreshes every 20 seconds.")}</p>
    </>
  );
}

function Card({ task, people, showCategory }: { task: WaTask; people: string[]; showCategory?: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(task.status);
  const [who, setWho] = useState(task.assigned_to ?? "");
  const tn = tone({ category: task.category, priority: task.priority, status });

  const save = (patch: { status?: string; assigned_to?: string | null }) =>
    start(async () => {
      const r = await updateWaTaskAction(task.id, patch);
      if (!r.ok) toast.error(r.message);
    });

  const select = "h-11 min-w-0 flex-1 rounded-lg border bg-card px-2 text-[16px] md:h-9 md:text-[13px]";

  return (
    <article className={cn("rounded-2xl border border-l-4 px-3.5 py-3 shadow-card", TONE[tn], pending && "opacity-70")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold tracking-tight">{task.customer ?? task.chat}</p>
          <p className="text-xs text-text-2 tabular-nums">
            {formatDateTime(task.occurred_at)}
            {task.chat !== (task.customer ?? task.chat) && <> · {task.chat}</>}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {showCategory && (
            <span className="rounded-md bg-card px-1.5 py-0.5 text-[11px] font-medium">
              <span aria-hidden>{CATEGORY_ICON[task.category]}</span> {t(CATEGORY_LABEL[task.category])}
            </span>
          )}
          {task.priority === "urgent" && status !== "done" && status !== "dismissed" && <span className="rounded-md bg-bad-fg px-1.5 py-0.5 text-[11px] font-semibold text-white uppercase">{t(PRIORITY_LABEL.urgent)}</span>}
        </div>
      </div>

      <p className="mt-1.5 text-[14px] leading-snug">{task.summary}</p>
      {(task.system || task.phone) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {task.system && <span className="text-text-2">{task.system}</span>}
          {task.phone && (
            <a href={telHref(task.phone)} className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline md:min-h-0">
              <Phone className="size-3.5" aria-hidden />
              {task.phone}
            </a>
          )}
        </p>
      )}
      {task.triage === "fallback" && <p className="mt-1 text-xs text-warn-fg">{t("AI could not read this message: {reason}", { reason: task.triage_error ?? "?" })}</p>}

      <details className="mt-1.5 text-[13px]">
        <summary className="cursor-pointer text-text-2 hover:underline">{t("Details and the original message")}</summary>
        {task.details && <p className="mt-1">{task.details}</p>}
        <blockquote className="mt-1 rounded-lg bg-card/80 px-3 py-2 whitespace-pre-wrap">
          <span className="text-xs text-text-2">{task.sender ?? task.chat}: </span>
          {task.body}
        </blockquote>
      </details>

      <div className="mt-2 flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] text-text-2">
          {t("Status")}
          <select
            className={select}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              save({ status: e.target.value });
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(STATUS_LABEL[s])}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] text-text-2">
          {t("Assigned to")}
          <select
            className={select}
            value={who}
            onChange={(e) => {
              setWho(e.target.value);
              save({ assigned_to: e.target.value || null });
            }}
          >
            <option value="">{t("Nobody")}</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}
