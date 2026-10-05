import { TriangleAlert } from "lucide-react";
import type { RealityFlag } from "@/lib/reports/reality";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";

// F19-b Report vs. reality: the flags stored on the Job Report (and its visit) when the report was
// reviewed. Nothing to show → no card.

export async function RealityPanel({ table, id }: { table: "job_reports" | "visits"; id: number }) {
  const db = await recordsDb();
  const { data } = await db.from(table).select("reality_flags").eq("id", id).maybeSingle();
  const flags = ((data as { reality_flags: RealityFlag[] | null } | null)?.reality_flags ?? []) as RealityFlag[];
  if (!flags.length) return null;
  const tr = await getT();
  const warn = flags.some((f) => f.level === "warn");
  return (
    <section id="reality" className={`mb-3.5 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card ${warn ? "border-warn-fg/30" : ""}`}>
      <h2 className={`mb-1 flex items-center gap-2 text-[15px] font-semibold tracking-tight ${warn ? "text-warn-fg" : ""}`}>
        <TriangleAlert className="size-4" aria-hidden /> {tr("Report vs. reality")}
      </h2>
      <p className="mb-2 text-xs text-muted-foreground">{tr("What the visit and the report say, against the time clock, the drive from the warehouse and the van's trips. Threshold and grace are in Admin › Field day.")}</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {flags.map((f, n) => (
          <li key={n} className={`rounded-lg px-3 py-2 ${f.level === "warn" ? "bg-warn-bg text-warn-fg" : "bg-muted text-text-2"}`}>
            {f.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
