"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { justifyOvertimeAction } from "@/lib/time-clock/overtime-actions";
import { useT } from "@/i18n/client";

/** OT-b: the technician writes why a day ran over (required); it then waits for the approver's weekly review. */
export function JustifyForm({ id, initial = "", onDone, autoFocus }: { id: number; initial?: string; onDone?: () => void; autoFocus?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(initial);
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim().length < 3) return void toast.error(t("Write why the day ran over."));
        start(async () => {
          const r = await justifyOvertimeAction(id, text);
          if (!r.ok) return void toast.error(t(r.message));
          toast.success(t("Justification sent. You will get the answer here."));
          onDone?.();
          router.refresh();
        });
      }}
    >
      <textarea value={text} onChange={(e) => setText(e.target.value)} required minLength={3} maxLength={1000} rows={2} autoFocus={autoFocus} placeholder={t("Why did the day run over? (job, what happened)")} aria-label={t("Justification")} className="min-h-[72px] w-full min-w-0 flex-1 rounded-[10px] border bg-background px-3 py-2 text-base" />
      <button type="submit" disabled={pending} className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50 sm:self-end">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        {t("Send")}
      </button>
    </form>
  );
}
