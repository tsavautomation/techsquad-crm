"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { correctEntryAction, removeEntryAction } from "@/lib/time-clock/actions";
import { useT } from "@/i18n/client";

/**
 * Correct an entry's time or remove it (people who may edit Employees). TC-f: an entry in an approved pay
 * period shows a lock; only an administrator can still change it, and must say why (the difference is paid
 * as an adjustment in the next period).
 */
export function EntryTools({ id, time, locked = false, admin = false }: { id: number; time: string; locked?: boolean; admin?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(time);
  const [reason, setReason] = useState("");
  const BTN = "inline-flex h-9 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted disabled:opacity-50";

  if (locked && !admin)
    return (
      <span className="inline-flex h-9 items-center gap-1 px-1 text-xs text-muted-foreground" title={t("In an approved pay period: only an administrator can change it")}>
        <Lock className="size-3.5" aria-hidden />
      </span>
    );

  if (editing)
    return (
      <span className="flex flex-wrap items-center justify-end gap-1">
        <input type="time" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 rounded-md border bg-card px-2 text-base" aria-label={t("New time")} />
        {locked && <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Why (pay period approved)")} className="h-9 w-full rounded-md border bg-card px-2 text-base sm:w-56" aria-label={t("Reason")} />}
        <button
          type="button"
          className={BTN}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await correctEntryAction(id, value, locked ? reason : undefined);
              if (!r.ok) return void toast.error(t(r.message));
              toast.success(t("Time corrected"));
              setEditing(false);
              router.refresh();
            })
          }
        >
          {t("Save")}
        </button>
        {locked && (
          <button
            type="button"
            className={`${BTN} text-destructive`}
            disabled={pending}
            onClick={() => {
              if (!confirm(t("Remove this entry?"))) return;
              start(async () => {
                const r = await removeEntryAction(id, reason);
                if (!r.ok) return void toast.error(t(r.message));
                toast.success(t("Entry removed"));
                setEditing(false);
                router.refresh();
              });
            }}
          >
            {t("Remove")}
          </button>
        )}
        <button type="button" className={BTN} onClick={() => setEditing(false)}>
          {t("Cancel")}
        </button>
      </span>
    );

  return (
    <span className="flex items-center gap-1">
      <button type="button" className={BTN} onClick={() => setEditing(true)} aria-label={t("Correct the time")} title={locked ? t("In an approved pay period: a reason is required") : undefined}>
        {locked ? <Lock className="size-3.5" aria-hidden /> : <Pencil className="size-3.5" aria-hidden />}
      </button>
      {!locked && (
        <button
          type="button"
          className={`${BTN} text-destructive`}
          disabled={pending}
          aria-label={t("Remove this entry")}
          onClick={() => {
            if (!confirm(t("Remove this entry?"))) return;
            start(async () => {
              const r = await removeEntryAction(id);
              if (!r.ok) return void toast.error(t(r.message));
              toast.success(t("Entry removed"));
              router.refresh();
            });
          }}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}
