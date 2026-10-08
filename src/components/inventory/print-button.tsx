"use client";

import { Printer } from "lucide-react";
import { useT } from "@/i18n/client";

export function PrintButton() {
  const t = useT();
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95">
      <Printer className="size-4" aria-hidden /> {t("Print")}
    </button>
  );
}
