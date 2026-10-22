"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { summarizeWaPeriodAction } from "@/lib/whatsapp/actions";
import { useT } from "@/i18n/client";

// F28: "what happened this week" in two or three sentences, on demand (one Claude call over the cards).

export function PeriodSummary({ days, empty }: { days: number; empty: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (empty) return null;
  const run = () =>
    start(async () => {
      setError(null);
      const r = await summarizeWaPeriodAction(days);
      if (r.ok) setText(r.text);
      else setError(r.message);
    });
  return (
    <section className="mb-4 rounded-2xl border bg-card px-[18px] py-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{t("Summary of the period")}</h2>
        <button type="button" onClick={run} disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-60">
          <Sparkles className="size-4" aria-hidden />
          {pending ? t("Summarizing…") : text ? t("Summarize again") : t("Summarize with AI")}
        </button>
      </div>
      {text && <p className="mt-2 text-[14px] leading-relaxed">{text}</p>}
      {error && <p className="mt-2 text-[13px] text-bad-fg">{error}</p>}
    </section>
  );
}
