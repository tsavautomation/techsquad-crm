"use client";

import { Download } from "lucide-react";
import { useT } from "@/i18n/client";

// FIN-f: every Finance list downloads as CSV, built in the browser from the rows on screen (BOM + CRLF for Excel).

export function CsvButton({ rows, columns, name, disabled }: { rows: Record<string, unknown>[]; columns: { key: string; label: string }[]; name: string; disabled?: boolean }) {
  const t = useT();
  const download = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => columns.map((c) => esc(typeof r[c.key] === "number" ? (r[c.key] as number).toFixed(2) : r[c.key])).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <button type="button" onClick={download} disabled={disabled || !rows.length} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">
      <Download className="size-4" aria-hidden /> {t("Download CSV")}
    </button>
  );
}
