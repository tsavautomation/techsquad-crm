"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMinutes, type UsageTotals } from "@/lib/usage/engine";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// ADM-b Admin › Usage: one line per person (most recently seen first), opening to their days.

export type UsageRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  lastSeen: string | null;
  lastSignIn: string | null;
  today: number;
  totals: UsageTotals;
  days: { day: string; first_at: string; last_at: string; seconds: number; sessions: number; pages: number }[];
};

const time = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export function UsageTable({ rows, days }: { rows: UsageRow[]; days: number }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.totals.seconds));
  return (
    <ul className="divide-y rounded-2xl border bg-card shadow-card">
      {rows.map((r) => {
        const isOpen = open === r.id;
        return (
          <li key={r.id}>
            <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50">
              {isOpen ? <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base font-medium">{r.name}</span>
                  {!r.active && <span className="rounded bg-muted px-1.5 text-xs">{t("inactive")}</span>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {r.lastSeen ? t("Last seen {when}", { when: formatDateTime(r.lastSeen) }) : r.lastSignIn ? t("Last sign-in {when} (before counting began)", { when: formatDateTime(r.lastSignIn) }) : t("Never signed in")}
                </span>
                <span className="mt-1.5 block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((100 * r.totals.seconds) / max)}%` }} />
                </span>
              </span>
              <span className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-0.5 text-right text-sm tabular-nums sm:grid-cols-4">
                <Stat label={t("Today")} value={formatMinutes(r.today)} />
                <Stat label={t("{n} days", { n: days })} value={formatMinutes(r.totals.seconds)} strong />
                <Stat label={t("Sessions")} value={String(r.totals.sessions)} />
                <Stat label={t("Days")} value={String(r.totals.days)} />
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-3 pl-11">
                {!r.days.length ? (
                  <p className="text-sm text-muted-foreground">{t("No activity in this period.")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1 font-medium">{t("Day")}</th>
                        <th className="py-1 font-medium">{t("First")}</th>
                        <th className="py-1 font-medium">{t("Last")}</th>
                        <th className="py-1 text-right font-medium">{t("Time")}</th>
                        <th className="py-1 text-right font-medium">{t("Sessions")}</th>
                        <th className="hidden py-1 text-right font-medium sm:table-cell">{t("Pages")}</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {r.days.map((d) => (
                        <tr key={d.day} className="border-t">
                          <td className="py-1">{formatDate(d.day)}</td>
                          <td className="py-1">{time(d.first_at)}</td>
                          <td className="py-1">{time(d.last_at)}</td>
                          <td className="py-1 text-right">{formatMinutes(d.seconds)}</td>
                          <td className="py-1 text-right">{d.sessions}</td>
                          <td className="hidden py-1 text-right sm:table-cell">{d.pages}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </li>
        );
      })}
      {!rows.length && <li className="px-4 py-3 text-sm text-muted-foreground">{t("No users.")}</li>}
    </ul>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn(strong && "font-semibold")}>{value}</span>
    </span>
  );
}
