"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { testClaudeAction } from "@/lib/ai/actions";
import type { Ping } from "@/lib/ai/claude";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** The Test connection button on Admin › AI, with the result under it. */
export function AiPanel({ disabled }: { disabled?: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Ping | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending || disabled}
        className="inline-flex h-11 w-fit items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50"
        onClick={() => start(async () => setResult(await testClaudeAction()))}
      >
        <Sparkles className="size-4" aria-hidden /> {pending ? t("Asking Claude…") : t("Test connection")}
      </button>
      {result && (
        <p className={cn("rounded-[10px] px-3 py-2 text-sm", result.ok ? "bg-ok-bg text-ok-fg" : "bg-bad-bg text-bad-fg")}>
          {result.ok ? t("Connected. {model} answered \"{reply}\" in {ms} ms.", { model: result.model, reply: result.reply, ms: result.ms }) : t(result.message)}
        </p>
      )}
    </div>
  );
}
