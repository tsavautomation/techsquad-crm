"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, MessageSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/dates";
import { saveRecordAction } from "@/lib/records/actions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// Tasks board (the Portal design's "Tarefas"): one column per Task status, drag a card to move it.
// Columns follow the Status options, so an option added in Form settings becomes a column.

export type BoardCard = {
  id: number;
  details: string;
  member: string | null;
  memberId: number | null;
  due: string | null;
  priority: string | null;
  status: string;
  checklist: { done: number; total: number };
  labels: { label: string; color: string }[];
  project: string | null;
  notes: number;
  private: boolean;
};
export type BoardColumn = { value: string; label: string; color: string };
type Props = {
  columns: BoardColumn[];
  cards: BoardCard[];
  people: { id: number; name: string }[];
  today: string;
  canEdit: boolean;
  canCreate: boolean;
  me: number | null;
  who: string;
  label: string;
  labels: { value: string; label: string }[];
};

const PRIORITY: Record<string, string> = { Urgent: "bg-bad-bg text-bad-fg", ASAP: "bg-warn-bg text-warn-fg" };

export function TaskBoard({ columns, cards, people, today, canEdit, canCreate, me, who, label, labels }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [text, setText] = useState("");

  const move = (id: number, status: string) => {
    const c = cards.find((x) => x.id === id);
    if (!c || c.status === status) return;
    start(async () => {
      const r = await saveRecordAction("tasks", id, { status });
      if (!r.ok) return void toast.error(t(r.message || "Could not move the task"));
      router.refresh();
    });
  };
  const add = (status: string) =>
    start(async () => {
      if (!text.trim()) return;
      const r = await saveRecordAction("tasks", null, { details: text.trim(), status, due_date: today, ...(me ? { member_id: me } : {}) });
      if (!r.ok) return void toast.error(t(r.message || "Could not add the task"));
      setText("");
      setAdding(null);
      router.refresh();
    });

  const go = (next: { who?: string; label?: string }) => {
    const q = new URLSearchParams(Object.entries({ who, label, ...next }).filter(([, v]) => v));
    router.push(q.size ? `/tasks?${q}` : "/tasks");
  };

  return (
    <div className={cn(pending && "opacity-70")}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select aria-label={t("Whose tasks")} className="h-10 rounded-[10px] border bg-card px-2 text-base md:text-sm" value={who} onChange={(e) => go({ who: e.target.value })}>
          <option value="">{t("Everyone")}</option>
          {me && <option value="me">{t("Mine")}</option>}
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {labels.length > 0 && (
          <select aria-label={t("Label")} className="h-10 rounded-[10px] border bg-card px-2 text-base md:text-sm" value={label} onChange={(e) => go({ label: e.target.value })}>
            <option value="">{t("All labels")}</option>
            {labels.map((l) => (
              <option key={l.value} value={l.value}>
                {t(l.label)}
              </option>
            ))}
          </select>
        )}
        <span className="text-sm text-muted-foreground">{t(cards.length === 1 ? "{n} task" : "{n} tasks", { n: cards.length })}</span>
      </div>
      <div className="-mx-3.5 flex snap-x gap-3.5 overflow-x-auto px-3.5 pb-3.5 md:mx-0 md:px-0">
        {columns.map((col) => {
          const list = cards.filter((c) => c.status === col.value);
          return (
            <section
              key={col.value}
              aria-label={t(col.label)}
              className={cn("flex w-[268px] shrink-0 snap-start flex-col rounded-[14px] border border-t-[3px] bg-muted p-2.5", over === col.value && "outline-2 -outline-offset-4 outline-primary outline-dashed")}
              style={{ borderTopColor: col.color }}
              onDragOver={(e) => {
                if (!canEdit || drag === null) return;
                e.preventDefault();
                setOver(col.value);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (drag !== null) move(drag, col.value);
                setDrag(null);
              }}
            >
              <h2 className="mb-2.5 flex items-center justify-between px-0.5 text-xs font-semibold">
                {t(col.label)}
                <small className="rounded-full border bg-card px-2 font-semibold">{list.length}</small>
              </h2>
              <ul className="flex flex-col gap-2">
                {list.map((c) => {
                  const late = c.due && c.due < today && col.value !== "Completed";
                  return (
                    <li key={c.id} className="rounded-xl border bg-card shadow-card transition hover:-translate-y-px hover:shadow-[0_6px_16px_rgb(16_24_40/0.12)]">
                      <Link
                        href={`/administrative/tasks/${c.id}`}
                        draggable={canEdit}
                        onDragStart={(e) => {
                          setDrag(c.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDrag(null)}
                        className="block px-3 pt-2.5 pb-1.5 active:cursor-grabbing"
                      >
                        {c.labels.length > 0 && (
                          <span className="mb-1.5 flex flex-wrap gap-1">
                            {c.labels.map((l) => (
                              <span key={l.label} className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: l.color }}>
                                {t(l.label)}
                              </span>
                            ))}
                          </span>
                        )}
                        <span className={cn("block text-sm", col.value === "Completed" && "text-muted-foreground line-through")}>
                          {c.private && <Lock className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" aria-label={t("Private")} />}
                          {c.details || t("(no details)")}
                        </span>
                        {c.project && <span className="mt-0.5 block truncate text-xs text-text-2">{c.project}</span>}
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                          {c.priority && <span className={cn("rounded-md px-1.5 py-0.5 font-semibold", PRIORITY[c.priority] ?? "bg-muted")}>{t(c.priority)}</span>}
                          {c.due && <span className={cn("rounded-md px-1.5 py-0.5", late ? "bg-bad-bg font-semibold text-bad-fg" : c.due === today ? "bg-warn-bg text-warn-fg" : "bg-muted text-text-2")}>{c.due === today ? t("Today") : formatDate(c.due)}</span>}
                          {c.checklist.total > 0 && <span className={cn("rounded-md px-1.5 py-0.5", c.checklist.done === c.checklist.total ? "bg-ok-bg text-ok-fg" : "bg-muted text-text-2")}>✓ {c.checklist.done}/{c.checklist.total}</span>}
                          {c.notes > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-text-2" aria-label={t("{n} notes", { n: c.notes })}>
                              <MessageSquare className="size-3" aria-hidden /> {c.notes}
                            </span>
                          )}
                          {c.member && <span className="ml-auto text-muted-foreground">{c.member.split(" ")[0]}</span>}
                        </span>
                      </Link>
                      {/* Dragging doesn't work on phones: move from here instead. */}
                      {canEdit && (
                        <select
                          aria-label={t("Move to…")}
                          className="mx-3 mb-2 h-10 w-[calc(100%-1.5rem)] rounded-lg border bg-muted/40 px-2 text-base text-text-2 md:hidden"
                          value=""
                          onChange={(e) => e.target.value && move(c.id, e.target.value)}
                        >
                          <option value="">{t("Move to…")}</option>
                          {columns
                            .filter((x) => x.value !== c.status)
                            .map((x) => (
                              <option key={x.value} value={x.value}>
                                {t(x.label)}
                              </option>
                            ))}
                        </select>
                      )}
                    </li>
                  );
                })}
              </ul>
              {canCreate &&
                (adding === col.value ? (
                  <form
                    className="mt-2 flex flex-col gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      add(col.value);
                    }}
                  >
                    <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={t("What needs doing…")} className="rounded-[10px] border bg-card px-3 py-2 text-base md:text-sm" />
                    <div className="flex gap-1.5">
                      <button type="submit" className="h-9 flex-1 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground">
                        {t("Add")}
                      </button>
                      <button type="button" onClick={() => setAdding(null)} className="h-9 rounded-[10px] border bg-card px-3 text-sm">
                        {t("Cancel")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setAdding(col.value)} className="mt-2 flex h-9 items-center justify-center gap-1 rounded-[10px] text-[13px] text-muted-foreground hover:bg-card">
                    <Plus className="size-4" aria-hidden /> {t("Add a card")}
                  </button>
                ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
