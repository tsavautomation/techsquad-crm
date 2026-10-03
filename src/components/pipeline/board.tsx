"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitRecordAction } from "@/lib/records/record-actions";
import { moveWorkflowAction } from "@/lib/records/workflow-actions";
import { moveFor, NOT_SUBMITTED, targetsFrom, type BoardLevel } from "@/lib/pipeline/moves";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// Pipeline board (Portal "Funil"): one column per Project Proposal stage. A drop takes the matching
// workflow option (lib/pipeline/moves.ts); while dragging, columns the card can't go to are dimmed.

export type PipelineCard = { id: number; title: string; client: string | null; salesperson: string | null; type: string | null; level: number; days: number | null; value: number | null };
type Props = { levels: BoardLevel[]; cards: PipelineCard[]; canSubmit: boolean; people: { id: number; name: string }[]; me: number | null; who: string; all: boolean; showMoney: boolean };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
// A card sitting this long in an open stage gets an amber badge, twice as long a red one.
const STALE_DAYS = 14;

export function PipelineBoard({ levels, cards, canSubmit, people, me, who, all, showMoney }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState<PipelineCard | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const columns = useMemo(() => {
    const cols = levels.map((l) => ({ id: l.id, title: l.title, color: l.color, closed: l.title === "Complete" || l.title === "Proposal Denied" }));
    // Projects not submitted yet only get a column when there are some.
    return cards.some((c) => c.level === NOT_SUBMITTED) ? [{ id: NOT_SUBMITTED, title: "Not submitted", color: "#94a3b8", closed: false }, ...cols] : cols;
  }, [levels, cards]);
  const allowed = useMemo(() => (drag ? new Set(targetsFrom(levels, drag.level, canSubmit)) : null), [drag, levels, canSubmit]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? cards.filter((c) => [c.title, c.client, c.salesperson].some((s) => s?.toLowerCase().includes(needle))) : cards;
  const title = (id: number) => columns.find((c) => c.id === id)?.title ?? "";

  const move = (card: PipelineCard, to: number) => {
    const m = moveFor(levels, card.level, to, canSubmit);
    if (!m) {
      if (card.level !== to) toast.error(t("{project} can't go straight from {from} to {to}.", { project: card.title, from: t(title(card.level)), to: t(title(to)) }));
      return;
    }
    start(async () => {
      const r = m.kind === "submit" ? await submitRecordAction("projects", card.id) : await moveWorkflowAction("projects", card.id, m.outcomeId, m.target, "");
      if (!r.ok) return void toast.error(t(r.message || "Could not move the project"));
      toast.success(t("{project} → {to}", { project: card.title, to: t(title(to)) }));
      router.refresh();
    });
  };

  const go = (next: { who?: string; all?: string }) => {
    const p = new URLSearchParams(Object.entries({ who, all: all ? "1" : "", ...next }).filter(([, v]) => v));
    router.push(p.size ? `/pipeline?${p}` : "/pipeline");
  };

  return (
    <div className={cn(pending && "opacity-70")}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Find a project or client…")} aria-label={t("Find a project or client…")} className="h-10 min-w-0 flex-1 rounded-[10px] border bg-card px-3 text-base sm:max-w-xs md:text-sm" />
        <select aria-label={t("Salesperson")} className="h-10 rounded-[10px] border bg-card px-2 text-base md:text-sm" value={who} onChange={(e) => go({ who: e.target.value })}>
          <option value="">{t("All salespeople")}</option>
          {me && <option value="me">{t("Mine")}</option>}
          <option value="none">{t("No salesperson")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">{t(shown.length === 1 ? "{n} project" : "{n} projects", { n: shown.length })}</span>
      </div>
      <div className="-mx-3.5 flex snap-x gap-3.5 overflow-x-auto px-3.5 pb-3.5 md:mx-0 md:px-0">
        {columns.map((col) => {
          const list = shown.filter((c) => c.level === col.id);
          const total = list.reduce((n, c) => n + (c.value ?? 0), 0);
          const dim = allowed && drag && drag.level !== col.id && !allowed.has(col.id);
          return (
            <section
              key={col.id}
              aria-label={t(col.title)}
              className={cn("flex w-[260px] shrink-0 snap-start flex-col rounded-[14px] border border-t-[3px] bg-muted p-2.5 transition-opacity", over === col.id && "outline-2 -outline-offset-4 outline-primary outline-dashed", dim && "opacity-40")}
              style={{ borderTopColor: col.color }}
              onDragOver={(e) => {
                if (!drag || !allowed?.has(col.id)) return;
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (drag) move(drag, col.id);
                setDrag(null);
              }}
            >
              <h2 className="mb-2.5 px-0.5 text-xs font-semibold">
                <span className="flex items-center justify-between gap-2">
                  {t(col.title)}
                  <small className="rounded-full border bg-card px-2 font-semibold">{list.length}</small>
                </span>
                {(showMoney && total > 0) || (col.closed && !all) ? (
                  <span className="mt-0.5 block text-xs font-normal text-text-2">
                    {[showMoney && total > 0 ? money.format(total) : null, col.closed && !all ? t("last 90 days") : null].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </h2>
              <ul className="flex flex-col gap-2">
                {list.map((c) => {
                  const targets = targetsFrom(levels, c.level, canSubmit);
                  const stale = !col.closed && col.id !== NOT_SUBMITTED && c.days !== null && c.days >= STALE_DAYS;
                  return (
                    <li key={c.id} className="rounded-xl border bg-card shadow-card transition hover:-translate-y-px hover:shadow-[0_6px_16px_rgb(16_24_40/0.12)]">
                      <Link
                        href={`/projects/projects/${c.id}`}
                        draggable={targets.length > 0}
                        onDragStart={(e) => {
                          setDrag(c);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDrag(null)}
                        className="block px-3 pt-2.5 pb-2"
                      >
                        <span className="block text-sm font-semibold break-words">{c.title}</span>
                        {c.client && <span className="block truncate text-xs text-text-2">{c.client}</span>}
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                          {c.value !== null && <span className="rounded-md bg-ok-bg px-1.5 py-0.5 font-semibold text-ok-fg">{money.format(c.value)}</span>}
                          {c.days !== null && col.id !== NOT_SUBMITTED && (
                            <span className={cn("rounded-md px-1.5 py-0.5", stale ? (c.days >= STALE_DAYS * 2 ? "bg-bad-bg font-semibold text-bad-fg" : "bg-warn-bg text-warn-fg") : "bg-muted text-text-2")} title={t("Days in this stage")}>
                              {t(c.days === 1 ? "{n} day" : "{n} days", { n: c.days })}
                            </span>
                          )}
                          {c.type && <span className="rounded-md bg-muted px-1.5 py-0.5 text-text-2">{t(c.type)}</span>}
                          {c.salesperson && <span className="ml-auto text-muted-foreground">{c.salesperson.split(" ")[0]}</span>}
                        </span>
                      </Link>
                      {/* Dragging doesn't work on phones: move from here instead. */}
                      {targets.length > 0 && (
                        <select aria-label={t("Move to…")} className="mx-3 mb-2 h-10 w-[calc(100%-1.5rem)] rounded-lg border bg-muted/40 px-2 text-base text-text-2 md:hidden" value="" onChange={(e) => e.target.value !== "" && move(c, Number(e.target.value))}>
                          <option value="">{t("Move to…")}</option>
                          {targets.map((id) => (
                            <option key={id} value={id}>
                              {t(title(id))}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
