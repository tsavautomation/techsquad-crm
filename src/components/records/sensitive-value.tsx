"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Sensitive values (passwords, SSN, credentials) stay masked until the viewer asks to see them. */
export function SensitiveValue({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="inline-flex items-start gap-2">
      <span className={shown ? "break-all whitespace-pre-wrap" : "tracking-widest"}>{shown ? value : "••••••••"}</span>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="inline-flex min-h-8 items-center gap-1 rounded border px-2 text-xs text-muted-foreground hover:bg-muted"
        aria-pressed={shown}
      >
        {shown ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
        {shown ? "Hide" : "Show"}
      </button>
    </span>
  );
}
