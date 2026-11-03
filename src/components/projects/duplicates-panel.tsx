"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatDateTime, toDateTimeLocalET } from "@/lib/dates";
import { mergeProjectsAction, notDuplicateAction, undoMergeAction } from "@/lib/projects/actions";
import type { DuplicatePair, MergeRow, ProjectSummary } from "@/lib/projects/load";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// PJ-b item 2: the pairs side by side with what each holds; Merge (pick the one to keep, say why), Not a duplicate, Undo.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Card({ p, kept, onKeep, canAct }: { p: ProjectSummary; kept: boolean; onKeep: () => void; canAct: boolean }) {
  const t = useT();
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 text-[13px]">
      <span className="text-text-2">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className={cn("flex-1 rounded-xl border p-3", kept ? "border-primary bg-primary/5" : "bg-card")}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={p.href} className="font-semibold hover:underline">
            {p.title}
          </Link>
          <p className="text-xs text-text-2">
            #{p.id} · {p.job_status ? t(p.job_status) : t("no Job Status")} · {t("created {date}", { date: formatDate(p.created) })}
          </p>
        </div>
        {canAct && (
          <button type="button" onClick={onKeep} className={cn("inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium", kept ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {kept && <Check className="size-3.5" aria-hidden />}
            {kept ? t("Keep this one") : t("Keep")}
          </button>
        )}
      </div>
      <div className="grid gap-0.5">
        {row(t("Job Owner"), p.owner ?? "–")}
        {row(t("Address"), [p.building, p.address, p.unit ? `#${p.unit}` : ""].filter(Boolean).join(" · ") || "–")}
        {row(t("Job reports"), p.reports)}
        {row(t("Visits"), p.visits ? `${p.visits} (${p.firstVisit ? formatDate(p.firstVisit) : ""}${p.lastVisit && p.lastVisit !== p.firstVisit ? ` – ${formatDate(p.lastVisit)}` : ""})` : 0)}
        {row(t("Hours"), p.hours)}
        {row(t("Transactions"), p.transactions ? `${p.transactions} · ${money.format(p.transactionsTotal)}` : 0)}
        {row(t("Inventory checkouts"), p.checkouts)}
        {row(t("Files"), p.files)}
      </div>
    </div>
  );
}

function Pair({ pair, canAct }: { pair: DuplicatePair; canAct: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  // The kept project: by default the one with the money (transactions), else the older one.
  const [keep, setKeep] = useState<number>(pair.a.transactions >= pair.b.transactions ? pair.a.id : pair.b.id);
  const [reason, setReason] = useState("");
  const [gone, setGone] = useState<"merged" | "kept" | null>(null);
  if (gone) return null;
  const from = keep === pair.a.id ? pair.b : pair.a;
  const into = keep === pair.a.id ? pair.a : pair.b;
  return (
    <li className="rounded-2xl border bg-card p-3.5 shadow-card">
      <p className="mb-2 text-[13px] text-warn-fg">{t(pair.why)}</p>
      <div className="flex flex-col gap-3 md:flex-row">
        <Card p={pair.a} kept={keep === pair.a.id} onKeep={() => setKeep(pair.a.id)} canAct={canAct} />
        <Card p={pair.b} kept={keep === pair.b.id} onKeep={() => setKeep(pair.b.id)} canAct={canAct} />
      </div>
      {canAct && (
        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Why (for the history)")} className="h-11 flex-1 rounded-lg border bg-card px-3 text-base" aria-label={t("Reason")} />
          <button
            type="button"
            disabled={pending}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            onClick={() => {
              if (!confirm(t("Move everything from #{from} into #{into} and archive #{from}?", { from: from.id, into: into.id }))) return;
              start(async () => {
                const r = await mergeProjectsAction(from.id, into.id, reason);
                if (!r.ok) return void toast.error(t(r.message));
                toast.success(t("Merged into {title}", { title: into.title }));
                setGone("merged");
              });
            }}
          >
            {t("Merge")} <ArrowRight className="size-4" aria-hidden /> #{into.id}
          </button>
          <button
            type="button"
            disabled={pending}
            className="h-11 rounded-lg border px-4 text-sm hover:bg-muted disabled:opacity-60"
            onClick={() =>
              start(async () => {
                const r = await notDuplicateAction(pair.a.id, pair.b.id);
                if (!r.ok) return void toast.error(t(r.message));
                toast.success(t("Marked as not a duplicate"));
                setGone("kept");
              })
            }
          >
            {t("Not a duplicate")}
          </button>
        </div>
      )}
    </li>
  );
}

export function DuplicatesPanel({ pairs, merges, canAct }: { pairs: DuplicatePair[]; merges: MergeRow[]; canAct: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [undone, setUndone] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const shown = q.trim() ? pairs.filter((p) => `${p.a.title} ${p.b.title} ${p.a.owner ?? ""} ${p.b.owner ?? ""} ${p.a.id} ${p.b.id}`.toLowerCase().includes(q.trim().toLowerCase())) : pairs;
  return (
    <div className="grid gap-4">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search a name, client or number")} className="h-11 w-full rounded-lg border bg-card px-3 text-base md:max-w-sm" aria-label={t("Search")} />
      {shown.length === 0 ? <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{pairs.length ? t("Nothing matches.") : t("No possible duplicates left.")}</p> : <ul className="grid gap-3">{shown.map((p) => <Pair key={p.key} pair={p} canAct={canAct} />)}</ul>}
      {merges.length > 0 && (
        <section>
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Merges")}</h2>
          <ul className="divide-y rounded-2xl border bg-card shadow-card">
            {merges.map((m) => {
              const isUndone = Boolean(m.undone_at) || undone.has(m.id);
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1">
                    {m.from ? <Link href={m.from.href} className="hover:underline">{m.from.title}</Link> : "?"} <ArrowRight className="inline size-3.5" aria-hidden /> {m.into ? <Link href={m.into.href} className="font-medium hover:underline">{m.into.title}</Link> : "?"}
                    <span className="block text-xs text-text-2">
                      {formatDateTime(toDateTimeLocalET(m.merged_at))}
                      {m.merged_by ? ` · ${m.merged_by}` : ""}
                      {m.reason ? ` · ${m.reason}` : ""}
                      {isUndone ? ` · ${t("undone")}` : ""}
                    </span>
                  </span>
                  {canAct && !isUndone && (
                    <button
                      type="button"
                      disabled={pending}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs hover:bg-muted disabled:opacity-60"
                      onClick={() => {
                        if (!confirm(t("Undo this merge? Everything goes back to the archived project."))) return;
                        start(async () => {
                          const r = await undoMergeAction(m.id);
                          if (!r.ok) return void toast.error(t(r.message));
                          toast.success(t("Merge undone"));
                          setUndone((s) => new Set(s).add(m.id));
                        });
                      }}
                    >
                      <Undo2 className="size-3.5" aria-hidden /> {t("Undo")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
