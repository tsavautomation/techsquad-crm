"use client";

import { useState, useTransition } from "react";
import { sendTestSmsAction } from "@/lib/reports/actions";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Admin › Field day: send one test SMS to a number, to prove Twilio works (F18-c). */
export function TestSmsForm() {
  const t = useT();
  const [to, setTo] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <label className="block text-sm font-medium">
        {t("Send a test SMS to")}
        <div className="mt-1 flex gap-2">
          <input type="tel" inputMode="tel" className="h-11 w-full rounded-lg border bg-card px-3 text-base" placeholder="(305) 555-0123" value={to} onChange={(e) => setTo(e.target.value)} />
          <button type="button" disabled={pending || !to.trim()} className="h-11 shrink-0 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50" onClick={() => start(async () => setResult(await sendTestSmsAction(to)))}>
            {pending ? t("Sending…") : t("Send")}
          </button>
        </div>
      </label>
      {result && <p className={cn("rounded-[10px] px-3 py-2 text-sm", result.ok ? "bg-ok-bg text-ok-fg" : "bg-bad-bg text-bad-fg")}>{t(result.message)}</p>}
    </div>
  );
}
