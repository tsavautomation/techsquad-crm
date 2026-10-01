"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveRecordAction } from "@/lib/records/actions";
import { useT } from "@/i18n/client";

/** "New task…" box on Today (Portal design): details + due date, assigned to me. */
export function QuickTask({ employeeId, today }: { employeeId: number | null; today: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [details, setDetails] = useState("");
  const [due, setDue] = useState(today);
  return (
    <form
      className="rounded-2xl border bg-card px-[18px] py-4 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!details.trim()) return;
        start(async () => {
          const r = await saveRecordAction("tasks", null, { details: details.trim(), due_date: due || null, status: "Pending", ...(employeeId ? { member_id: employeeId } : {}) });
          if (!r.ok) return void toast.error(t(r.message || Object.values(r.errors)[0] || "Could not add the task"));
          toast.success(t("Task added"));
          setDetails("");
          router.refresh();
        });
      }}
    >
      <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("New task")}</h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t("What needs doing…")} aria-label={t("Task")} className="h-11 min-w-0 flex-1 rounded-[10px] border bg-card px-3 text-base sm:h-10 sm:text-sm" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label={t("Due date")} className="h-11 rounded-[10px] border bg-card px-3 text-base sm:h-10 sm:text-sm" />
        <button type="submit" disabled={pending || !details.trim()} className="h-11 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:h-10">
          {t("Add task")}
        </button>
      </div>
      {!employeeId && <p className="mt-1 text-xs text-muted-foreground">{t("No Employee record has your email, so the task won't be assigned to anyone.")}</p>}
    </form>
  );
}
