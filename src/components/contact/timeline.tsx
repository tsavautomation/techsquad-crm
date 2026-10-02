"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardCheck, FileText, GitCommitHorizontal, ListTodo, MessageSquareText, StickyNote } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { TimelineItem, TimelineKind } from "@/lib/records/timeline";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// F4 client timeline (SPEC §9.1 F4-c): calls / messages, notes, stage changes, visits, reports, tasks.

const ICON: Record<TimelineKind, typeof StickyNote> = { contact: MessageSquareText, note: StickyNote, stage: GitCommitHorizontal, visit: CalendarDays, report: ClipboardCheck, task: ListTodo };
const FILTERS: { key: string; label: string; kinds: TimelineKind[] }[] = [
  { key: "all", label: "All", kinds: [] },
  { key: "contact", label: "Calls & messages", kinds: ["contact"] },
  { key: "note", label: "Notes", kinds: ["note"] },
  { key: "stage", label: "Stages", kinds: ["stage"] },
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
              {i.project && <p className="text-[12.5px] text-text-2">{i.project}</p>}
              {i.detail && <p className="mt-0.5 line-clamp-4 text-sm whitespace-pre-line text-foreground/90">{i.detail}</p>}
              {i.followUp && <p className="mt-0.5 text-[12.5px] text-warn-fg">{t("Follow up {date}", { date: formatDate(i.followUp) })}</p>}
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
