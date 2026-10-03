"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Merge } from "lucide-react";
import { toast } from "sonner";
import { mergeRecordsAction } from "@/lib/data/merge-actions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type MergeItem = { id: number; title: string; detail: string; href: string };

/**
 * One group of possible duplicates on the Data page (F14-a): pick the record to keep (the oldest is
 * proposed), tick the ones to merge into it, Merge. Everything pointing at the merged records moves to
 * the kept one; the merged ones go to the trash.
 */
export function MergeGroup({ table, label, items, canMerge }: { table: "contacts" | "organizations"; label: string; items: MergeItem[]; canMerge: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [keep, setKeep] = useState(items[0]?.id ?? 0);
  const [chosen, setChosen] = useState<number[]>(items.map((i) => i.id));
  const merging = chosen.filter((id) => id !== keep);

  return (
    <li className="rounded-xl border bg-muted px-3 py-2">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((i) => {
          const isKeep = i.id === keep;
          return (
            <li key={i.id} className="flex items-center gap-2">
              {canMerge && (
                <label className="flex min-h-11 shrink-0 items-center gap-1.5 text-xs text-text-2">
                  <input type="radio" name={`keep-${table}-${items[0].id}`} className="size-4" checked={isKeep} onChange={() => setKeep(i.id)} aria-label={t("Keep {title}", { title: i.title })} />
                  {t("Keep")}
                </label>
              )}
              {canMerge && !isKeep && (
                <input
                  type="checkbox"
                  className="size-4 shrink-0"
                  checked={chosen.includes(i.id)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, i.id] : c.filter((x) => x !== i.id)))}
                  aria-label={t("Merge {title} into the kept record", { title: i.title })}
                />
              )}
              <span className="min-w-0 flex-1">
                <Link href={i.href} className={cn("block truncate text-sm text-primary hover:underline", isKeep && canMerge && "font-semibold")}>
                  {i.title}
                </Link>
                {i.detail && <span className="block truncate text-xs text-muted-foreground">{i.detail}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {canMerge && (
        <button
          type="button"
          disabled={pending || !merging.length}
          aria-label={t("Merge into {keep}", { keep: items.find((i) => i.id === keep)?.title ?? String(keep) })}
          className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-[10px] border bg-card px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50"
          onClick={() => {
            const names = items.filter((i) => merging.includes(i.id)).map((i) => i.title).join(", ");
            const keepName = items.find((i) => i.id === keep)?.title ?? `#${keep}`;
            if (!confirm(t("Merge {names} into {keep}? Their projects, notes and files move over, and they go to the trash.", { names, keep: keepName }))) return;
            start(async () => {
              const r = await mergeRecordsAction({ table, keep, merge: merging });
              if (!r.ok) return void toast.error(t(r.message));
              toast.success(t("Merged. {n} links now point at the kept record.", { n: r.moved }));
              router.refresh();
            });
          }}
        >
          <Merge className="size-4" aria-hidden /> {pending ? t("Merging…") : t(merging.length === 1 ? "Merge 1 record into the kept one" : "Merge {n} records into the kept one", { n: merging.length })}
        </button>
      )}
    </li>
  );
}
