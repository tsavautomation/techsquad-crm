"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/dates";
import { saveRecordAction } from "@/lib/records/actions";
import { cn } from "@/lib/utils";

// Tasks board (the Portal design's "Tarefas"): one column per Task status, drag a card to move it.
// Columns follow the Status options, so an option added in Form settings becomes a column.

export type BoardCard = { id: number; details: string; member: string | null; memberId: number | null; due: string | null; priority: string | null; status: string; checklist: { done: number; total: number } };
export type BoardColumn = { value: string; label: string; color: string };
type Props = { columns: BoardColumn[]; cards: BoardCard[]; people: { id: number; name: string }[]; today: string; canEdit: boolean; canCreate: boolean; me: number | null; who: string };

const PRIORITY: Record<string, string> = { Urgent: "bg-bad-bg text-bad-fg", ASAP: "bg-warn-bg text-warn-fg" };

export function TaskBoard({ columns, cards, people, today, canEdit, canCreate, me, who }: Props) {
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
      if (!r.ok) return void toast.error(r.message ?? "Could not move the task");
      router.refresh();
    });
  };
  const add = (status: string) =>
    start(async () => {
      if (!text.trim()) return;
      const r = await saveRecordAction("tasks", null, { details: text.trim(), status, due_date: today, ...(me ? { member_id: me } : {}) });
      if (!r.ok) return void toast.error(r.message ?? "Could not add the task");
      setText("");
      setAdding(null);
      router.refresh();
    });

  return (
    <div className={cn(pending && "opacity-70")}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select aria-label="Whose tasks" className="h-10 rounded-[10px] border bg-card px-2 text-base md:text-sm" value={who} onChange={(e) => router.push(e.target.value ? `/tasks?who=${e.target.value}` : "/tasks")}>
          <option value="">Everyone</option>
          {me && <option value="me">Mine</option>}
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">{cards.length} tasks</span>
      </div>
      <div className="-mx-3.5 flex snap-x gap-3.5 overflow-x-auto px-3.5 pb-3.5 md:mx-0 md:px-0">
        {columns.map((col) => {
          const list = cards.filter((c) => c.status === col.value);
          return (
            <section
              key={col.value}
              aria-label={col.label}
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
              <h2 className="mb-2.5 flex items-center justify-between px-0.5 text-[12.5px] font-semibold">
                {col.label}
                <small className="rounded-full border bg-card px-2 font-semibold">{list.length}</small>
              </h2>
              <ul className="flex flex-col gap-2">
                {list.map((c) => {
                  const late = c.due && c.due < today && col.value !== "Completed";
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/administrative/tasks/${c.id}`}
                        draggable={canEdit}
                        onDragStart={(e) => {
                          setDrag(c.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDrag(null)}
                        className="block rounded-xl border bg-card px-3 py-2.5 shadow-card transition hover:-translate-y-px hover:shadow-[0_6px_16px_rgb(16_24_40/0.12)] active:cursor-grabbing"
                      >
                        <span className={cn("block text-sm", col.value === "Completed" && "text-muted-foreground line-through")}>{c.details || "(no details)"}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                          {c.priority && <span className={cn("rounded-md px-1.5 py-0.5 font-semibold", PRIORITY[c.priority] ?? "bg-muted")}>{c.priority}</span>}
                          {c.due && <span className={cn("rounded-md px-1.5 py-0.5", late ? "bg-bad-bg font-semibold text-bad-fg" : c.due === today ? "bg-warn-bg text-warn-fg" : "bg-muted text-text-2")}>{c.due === today ? "Today" : formatDate(c.due)}</span>}
                          {c.checklist.total > 0 && <span className={cn("rounded-md px-1.5 py-0.5", c.checklist.done === c.checklist.total ? "bg-ok-bg text-ok-fg" : "bg-muted text-text-2")}>✓ {c.checklist.done}/{c.checklist.total}</span>}
                          {c.member && <span className="ml-auto text-muted-foreground">{c.member.split(" ")[0]}</span>}
                        </span>
                      </Link>
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
                    <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="What needs doing…" className="rounded-[10px] border bg-card px-3 py-2 text-base md:text-sm" />
                    <div className="flex gap-1.5">
                      <button type="submit" className="h-9 flex-1 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground">
                        Add
                      </button>
                      <button type="button" onClick={() => setAdding(null)} className="h-9 rounded-[10px] border bg-card px-3 text-sm">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setAdding(col.value)} className="mt-2 flex h-9 items-center justify-center gap-1 rounded-[10px] text-[13px] text-muted-foreground hover:bg-card">
                    <Plus className="size-4" aria-hidden /> Add a card
                  </button>
                ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
