"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { logRevealAction } from "@/lib/records/reveal-actions";
import { useT } from "@/i18n/client";
import { textareaValue } from "./text-lines";

/**
 * Sensitive values (passwords, SSN, credentials) stay masked until the viewer asks to see them. With `log`
 * (F30), every Show and Copy is written to sensitive_reveals in the viewer's name.
 */
export function SensitiveValue({ value, log }: { value: string; log?: { table: string; id: number; field: string } }) {
  const t = useT();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const note = (action: "show" | "copy") => log && void logRevealAction(log.table, log.id, log.field, action).catch(() => undefined);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      note("copy");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (http, old browser): the person can still Show and type it.
    }
  };
  return (
    <span className="inline-flex flex-wrap items-start gap-2">
      <span className={shown ? "break-words whitespace-pre-wrap" : "tracking-widest"}>{shown ? textareaValue(value) : "••••••••"}</span>
      <button
        type="button"
        onClick={() => {
          if (!shown) note("show");
          setShown((s) => !s);
        }}
        className="inline-flex min-h-8 items-center gap-1 rounded border px-2 text-xs text-muted-foreground hover:bg-muted"
        aria-pressed={shown}
      >
        {shown ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
        {t(shown ? "Hide" : "Show")}
      </button>
      {log && (
        <button type="button" onClick={copy} className="inline-flex min-h-8 items-center gap-1 rounded border px-2 text-xs text-muted-foreground hover:bg-muted">
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? t("Copied") : t("Copy")}
        </button>
      )}
    </span>
  );
}
