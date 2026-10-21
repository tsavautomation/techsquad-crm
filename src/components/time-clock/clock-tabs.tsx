import Link from "next/link";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

// TC-a: the two views of Management › Time clock: one day of entries, or the week per person.
export async function ClockTabs({ current }: { current: "day" | "timesheets" }) {
  const tr = await getT();
  const tabs = [
    { key: "day" as const, href: "/time-clock", label: tr("Day") },
    { key: "timesheets" as const, href: "/time-clock/timesheets", label: tr("Timesheets") },
  ];
  return (
    <div className="flex rounded-[10px] border bg-muted p-0.5 text-[13px]" role="tablist" aria-label={tr("Time clock views")}>
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} role="tab" aria-selected={t.key === current} className={cn("rounded-lg px-3 py-2", t.key === current ? "bg-card font-semibold shadow-card" : "text-text-2")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
