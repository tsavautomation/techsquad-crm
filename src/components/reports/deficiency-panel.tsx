"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excuseDeficiencyAction } from "@/lib/reports/actions";
import { useT } from "@/i18n/client";

/** Report Deficiency page (F18-b): the Excuse box for Admin / COO; a note for everyone else. */
export function DeficiencyPanel({ id, status, canExcuse }: { id: number; status: string; canExcuse: boolean }) {
  const t = useT();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (status === "Excused") return null;
  return (
    <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Excuse this deficiency")}</h2>
      {canExcuse ? (
        <div className="flex flex-col gap-2">
          <textarea className="min-h-20 w-full rounded-[10px] border bg-background px-3 py-2 text-base md:text-sm" placeholder={t("Why it doesn't count (kept in History)")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          <button
            type="button"
            disabled={pending || !reason.trim()}
            className="inline-flex h-11 w-fit items-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50"
            onClick={() =>
              start(async () => {
                const r = await excuseDeficiencyAction(id, reason);
                if (r.ok) router.refresh();
                else setMessage(r.message);
              })
            }
          >
            {pending ? t("Saving…") : t("Excuse")}
          </button>
          {message && <p className="rounded-[10px] bg-bad-bg px-3 py-2 text-sm text-bad-fg">{t(message)}</p>}
        </div>
      ) : (
        <p className="text-sm text-text-2">{t("Only an administrator or the COO can excuse a deficiency.")}</p>
      )}
    </section>
  );
}
