"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ignoreProposalAction } from "@/lib/portalio/actions";
import { useT } from "@/i18n/client";

// PI-c: ignored proposals, with the way back (administrators, on the Finance tab).

const money = (n: number | null) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n ?? 0));

export function IgnoredList({ rows }: { rows: { id: number; number: number | null; name: string | null; total: number | null }[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const back = (id: number) =>
    start(async () => {
      const r = await ignoreProposalAction(id, true);
      if (!r.ok) toast.error(t(r.message));
      else router.refresh();
    });
  return (
    <div className="mt-4 border-t pt-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="min-h-9 text-xs text-text-2 hover:underline">
        {open ? t("Hide ignored proposals") : t("{n} ignored proposals", { n: rows.length })}
      </button>
      {open && (
        <ul className="mt-2 divide-y text-sm">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
              <span>
                #{p.number ?? p.id} · {p.name} · {money(p.total)}
              </span>
              <button type="button" disabled={pending} onClick={() => back(p.id)} className="ml-auto min-h-9 text-xs text-primary hover:underline">
                {t("Review again")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
