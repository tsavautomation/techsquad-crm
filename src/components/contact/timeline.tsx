"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardCheck, FileText, Flag, GitCommitHorizontal, Inbox, ListTodo, Mail, MessageSquareText, MessageSquareWarning, Paperclip, StickyNote } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { TimelineItem, TimelineKind } from "@/lib/records/timeline";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// F4 client timeline (SPEC §9.1 F4-c): calls / messages, notes, stage changes, visits, reports, tasks.
// F26-1 (SPEC §9.1 F26-a): Job Status changes, check-in / check-out times, tasks done, request lines,
// emails and other events from the project stream.

const ICON: Record<TimelineKind, typeof StickyNote> = { contact: MessageSquareText, note: StickyNote, stage: GitCommitHorizontal, status: Flag, visit: CalendarDays, report: ClipboardCheck, task: ListTodo, request: MessageSquareWarning, email: Mail, event: Inbox };
const FILTERS: { key: string; label: string; kinds: TimelineKind[] }[] = [
  { key: "all", label: "All", kinds: [] },
  { key: "contact", label: "Calls & messages", kinds: ["contact"] },
  { key: "email", label: "Emails", kinds: ["email", "event"] },
  { key: "request", label: "Requests", kinds: ["request"] },
  { key: "note", label: "Notes", kinds: ["note"] },
  { key: "stage", label: "Stages", kinds: ["stage", "status"] },
  { key: "field", label: "Visits & reports", kinds: ["visit", "report"] },
  { key: "task", label: "Tasks", kinds: ["task"] },
];
const SHOW = 25;

export function Timeline({ items }: { items: TimelineItem[] }) {
  const t = useT();
  const [filter, setFilter] = useState("all");
  const [more, setMore] = useState(false);
  const kinds = FILTERS.find((f) => f.key === filter)?.kinds ?? [];
  const list = kinds.length ? items.filter((i) => kinds.includes(i.kind)) : items;
  const present = new Set(items.map((i) => i.kind));

  if (!items.length) return <p className="text-sm text-muted-foreground">{t("Nothing yet. Calls, messages, notes, stage changes and visits will show here.")}</p>;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.filter((f) => !f.kinds.length || f.kinds.some((k) => present.has(k))).map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={cn("h-9 rounded-full border px-3 text-[13px]", filter === f.key && "border-primary bg-primary text-primary-foreground")}>
            {t(f.label)}
          </button>
        ))}
      </div>
      <ol className="relative ml-3 border-l">
        {(more ? list : list.slice(0, SHOW)).map((i) => {
          const Icon = ICON[i.kind] ?? FileText;
          const title = i.title.map((x) => t(x)).join(" · ");
          const times = i.times
            ? [i.times.onWay && t("On the way {time}", { time: i.times.onWay }), i.times.in && t("Checked in {time}", { time: i.times.in }), i.times.out && t("Checked out {time}", { time: i.times.out })].filter(Boolean)
            : [];
          return (
            <li key={i.key} className="relative pb-4 pl-6">
              <span className="absolute -left-[13px] flex size-[26px] items-center justify-center rounded-full border bg-card" style={i.color ? { borderColor: i.color } : undefined}>
                <Icon className="size-3.5 text-text-2" aria-hidden style={i.color ? { color: i.color } : undefined} />
              </span>
              <p className="text-sm font-semibold">
                {i.href ? (
                  <Link href={i.href} className="hover:underline">
                    {title}
                  </Link>
                ) : (
                  title
                )}
              </p>
              {i.project && <p className="text-xs text-text-2">{i.project}</p>}
              {i.detail && <p className="mt-0.5 line-clamp-4 text-sm whitespace-pre-line text-foreground/90">{i.detail}</p>}
              {times.length > 0 && <p className="mt-0.5 text-xs text-text-2">{times.join(" · ")}</p>}
              {i.files && i.files.length > 0 && (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {i.files.map((f, n) => (
                    <li key={n}>
                      {f.url ? (
                        <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs hover:bg-muted">
                          <Paperclip className="size-3" aria-hidden /> {f.name}
                        </a>
                      ) : (
                        <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed px-2.5 text-xs text-text-2">
                          <Paperclip className="size-3" aria-hidden /> {f.name}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {i.followUp && <p className="mt-0.5 text-xs text-warn-fg">{t("Follow up {date}", { date: formatDate(i.followUp) })}</p>}
              <p className="mt-0.5 text-xs text-muted-foreground">{[formatDateTime(i.at), i.who].filter(Boolean).join(" · ")}</p>
            </li>
          );
        })}
      </ol>
      {!more && list.length > SHOW && (
        <button type="button" onClick={() => setMore(true)} className="h-10 rounded-[10px] border px-4 text-sm">
          {t("Show {n} more", { n: list.length - SHOW })}
        </button>
      )}
    </div>
  );
}
