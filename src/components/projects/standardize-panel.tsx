"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { renameProjectsAction } from "@/lib/projects/actions";
import type { RenameRow } from "@/lib/projects/load";
import { useT } from "@/i18n/client";

// PJ-b item 5: the preview "current name → standard name" with a checkbox per project; Apply renames the chosen ones.

export function StandardizePanel({ rows, canAct }: { rows: RenameRow[]; canAct: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const shown = q.trim() ? rows.filter((r) => `${r.current} ${r.proposed} ${r.owner ?? ""} ${r.id}`.toLowerCase().includes(q.trim().toLowerCase())) : rows;
  const toggle = (id: number) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search a name, client or number")} className="h-11 flex-1 rounded-lg border bg-card px-3 text-base md:max-w-sm" aria-label={t("Search")} />
        {canAct && (
          <>
            <button type="button" className="h-11 rounded-lg border px-3 text-sm hover:bg-muted" onClick={() => setPicked(new Set(shown.map((r) => r.id)))}>
              {t("Select all shown")}
            </button>
            <button type="button" className="h-11 rounded-lg border px-3 text-sm hover:bg-muted" onClick={() => setPicked(new Set())}>
              {t("None")}
            </button>
            <button
              type="button"
              disabled={pending || picked.size === 0}
              className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              onClick={() => {
                if (!confirm(t("Rename {n} projects?", { n: picked.size }))) return;
                start(async () => {
                  const r = await renameProjectsAction(rows.filter((x) => picked.has(x.id)).map((x) => ({ id: x.id, title: x.proposed })));
                  if (!r.ok) return void toast.error(t(r.message));
                  toast.success(t("{n} projects renamed", { n: r.renamed }));
                  if (r.failed.length) toast.error(`${r.failed.length} ${t("not renamed")}: ${r.failed.map((f) => `#${f.id} ${f.message}`).join("; ")}`, { duration: 12000 });
                  setPicked(new Set());
                  router.refresh();
                });
              }}
            >
              {pending ? t("Renaming…") : t("Rename the selected ({n})", { n: picked.size })}
            </button>
          </>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{rows.length ? t("Nothing matches.") : t("Every project name is already in the standard form.")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card shadow-card">
          {shown.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-3 py-2.5 text-[13px]">
              {canAct && <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="mt-1 size-5 shrink-0 accent-primary" aria-label={t("Rename #{id}", { id: r.id })} />}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2">
                  <Link href={r.href} className="text-text-2 hover:underline">
                    {r.current}
                  </Link>
                  <ArrowRight className="size-3.5 shrink-0 text-text-2" aria-hidden />
                  <span className="font-medium">{r.proposed}</span>
                </p>
                <p className="text-xs text-text-2">
                  #{r.id}
                  {r.owner ? ` · ${r.owner}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
