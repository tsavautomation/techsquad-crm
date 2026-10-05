"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { decideProposedVisitAction } from "@/lib/schedule/actions";
import { useT } from "@/i18n/client";

/** Visit page (F19-a): a visit Claude proposed waits here for a PM's Approve or Discard. */
export function ProposedVisitPanel({ visitId, canDecide, reportId, missing }: { visitId: number; canDecide: boolean; reportId: number | null; missing: string[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const decide = (what: "approve" | "discard") =>
    start(async () => {
      const r = await decideProposedVisitAction(visitId, what);
      if (r.ok) router.refresh();
      else setMessage(r.message);
    });
  return (
    <section className="mb-3.5 rounded-2xl border border-warn-fg/30 bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-1 text-[15px] font-semibold tracking-tight text-warn-fg">{t("Proposed return visit")}</h2>
      <p className="mb-3 text-sm text-text-2">{reportId ? t("Claude read Job Report #{id} and thinks someone has to come back. Approve to put it on the calendar (move it afterwards if needed) or discard it.", { id: reportId }) : t("Approve to put it on the calendar, or discard it.")}</p>
      {missing.length > 0 && <p className="mb-3 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">{t("Still to fill in after approving: {fields}.", { fields: missing.join(", ") })}</p>}
      {canDecide ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => decide("approve")} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50">
            <Check className="size-4" aria-hidden /> {t("Approve")}
          </button>
          <button type="button" disabled={pending} onClick={() => decide("discard")} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50">
            <X className="size-4" aria-hidden /> {t("Discard")}
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("Someone who schedules visits decides on it.")}</p>
      )}
      {message && <p className="mt-2 rounded-[10px] bg-bad-bg px-3 py-2 text-sm text-bad-fg">{t(message)}</p>}
    </section>
  );
}
