"use client";

import { useState, useTransition } from "react";
import { setAiReviewAction } from "@/lib/ai/actions";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Admin › AI: the on / off switch for the review of new Job Reports (F17-d). */
export function AiReviewSwitch({ on: initial, disabled }: { on: boolean; disabled?: boolean }) {
  const t = useT();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const toggle = () =>
    start(async () => {
      const next = !on;
      const r = await setAiReviewAction(next);
      if (r.ok) {
        setOn(next);
        setMessage(null);
      } else setMessage(r.message);
    });
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending || disabled}
        onClick={toggle}
        className="inline-flex min-h-11 w-fit items-center gap-3 rounded-[10px] border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        <span className={cn("relative inline-block h-6 w-11 rounded-full transition-colors", on ? "bg-ok-fg" : "bg-muted-foreground/40")} aria-hidden>
          <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-5" : "translate-x-0")} />
        </span>
        {on ? t("Review of new Job Reports: on") : t("Review of new Job Reports: off")}
      </button>
      {message && <p className="rounded-[10px] bg-bad-bg px-3 py-2 text-sm text-bad-fg">{t(message)}</p>}
    </div>
  );
}
