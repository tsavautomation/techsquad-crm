"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { addManualShiftAction } from "@/lib/time-clock/manual";
import { useT } from "@/i18n/client";

// J-s: the office adds a forgotten clock-in / clock-out (or a whole shift) with a reason.

export function ManualEntry({ people, defaultDay }: { people: { id: number; name: string }[]; defaultDay: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [day, setDay] = useState(defaultDay);
  const [inTime, setIn] = useState("");
  const [outTime, setOut] = useState("");
  const [reason, setReason] = useState("");
  const box = "h-11 min-w-0 rounded-[10px] border bg-background px-3 text-base";

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border bg-card px-3 text-sm hover:bg-muted">
        <Plus className="size-4" aria-hidden /> {t("Add a clock entry")}
      </button>
    );

  return (
    <form
      className="w-full rounded-2xl border bg-card px-[18px] py-3 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (employeeId === "") return toast.error(t("Pick the person."));
        start(async () => {
          const r = await addManualShiftAction({ employeeId, day, inTime, outTime, reason });
          if (!r.ok) toast.error(t(r.message));
          else {
            toast.success(r.added.length === 2 ? t("Shift added.") : r.added[0] === "clock_in" ? t("Clock-in added.") : t("Clock-out added."));
            setIn("");
            setOut("");
            setReason("");
            router.refresh();
          }
        });
      }}
    >
      <p className="mb-2 text-[15px] font-semibold tracking-tight">{t("Add a clock entry")}</p>
      <p className="mb-3 text-xs text-text-2">{t("For a forgotten clock-in or clock-out. Leave one time blank to complete a half shift; the entry is marked with your name and the reason.")}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : "")} aria-label={t("Person")} className={box} required>
          <option value="">{t("Person")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label={t("Day")} className={box} required />
        <input type="time" value={inTime} onChange={(e) => setIn(e.target.value)} aria-label={t("Clock-in time")} placeholder={t("Clock-in time")} className={box} />
        <input type="time" value={outTime} onChange={(e) => setOut(e.target.value)} aria-label={t("Clock-out time")} placeholder={t("Clock-out time")} className={box} />
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Reason")} aria-label={t("Reason")} className={box} required maxLength={300} />
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} {t("Add")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex h-11 items-center rounded-[10px] border px-4 text-sm hover:bg-muted">
          {t("Close")}
        </button>
      </div>
    </form>
  );
}
