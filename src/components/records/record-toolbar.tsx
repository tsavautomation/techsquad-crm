"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Lock, LockOpen, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteRecordAction,
  restoreRecordAction,
  setArchivedAction,
  setLockedAction,
  submitRecordAction,
  type ActionResult,
} from "@/lib/records/record-actions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Props = {
  table: string;
  id: number;
  listHref: string;
  locked: boolean;
  archived: boolean;
  can: { submit: boolean; lock: boolean; archive: boolean; delete: boolean };
};

const BTN = "inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-50";

/** Record actions: Submit, Lock/Unlock, Archive/Unarchive, Delete (SPEC §1.3). */
export function RecordToolbar({ table, id, listHref, locked, archived, can }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  // `undo` reverses the action from the toast (F7); the record page is shown again afterwards.
  const run = (fn: () => Promise<ActionResult>, done: string, after?: () => void, undo?: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t(done), {
        duration: undo ? 8000 : undefined,
        action: undo
          ? {
              label: t("Undo"),
              onClick: () =>
                void undo().then((u) => {
                  if (!u.ok) return void toast.error(t(u.message));
                  toast.success(t("Undone"));
                  router.push(`${listHref}/${id}`);
                  router.refresh();
                }),
            }
          : undefined,
      });
      if (after) after();
      else router.refresh();
    });

  if (!Object.values(can).some(Boolean)) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {can.submit && !locked && (
        <button
          type="button"
          disabled={pending}
          className={cn(BTN, "border-foreground bg-foreground text-background hover:bg-foreground/90")}
          onClick={() => {
            if (confirm(t("Submit this record? It will be locked for editing."))) run(() => submitRecordAction(table, id), "Submitted");
          }}
        >
          <Send className="size-4" aria-hidden /> {t("Submit")}
        </button>
      )}
      {can.lock && (
        <button type="button" disabled={pending} className={BTN} onClick={() => run(() => setLockedAction(table, id, !locked), locked ? "Unlocked" : "Locked")}>
          {locked ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
          {t(locked ? "Unlock" : "Lock")}
        </button>
      )}
      {can.archive && (
        <button type="button" disabled={pending} className={BTN} onClick={() => run(() => setArchivedAction(table, id, !archived), archived ? "Restored from archive" : "Archived", undefined, () => setArchivedAction(table, id, archived))}>
          {archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
          {t(archived ? "Unarchive" : "Archive")}
        </button>
      )}
      {can.delete && (
        <button
          type="button"
          disabled={pending}
          className={cn(BTN, "text-destructive")}
          onClick={() => {
            if (confirm(t("Delete this record? It goes to Deleted Items and can be restored.")))
              run(
                () => deleteRecordAction(table, id),
                "Deleted",
                () => {
                  router.push(listHref);
                  router.refresh();
                },
                () => restoreRecordAction(table, id),
              );
          }}
        >
          <Trash2 className="size-4" aria-hidden /> {t("Delete")}
        </button>
      )}
    </div>
  );
}
