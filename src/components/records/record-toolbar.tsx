"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Lock, LockOpen, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteRecordAction,
  setArchivedAction,
  setLockedAction,
  submitRecordAction,
  type ActionResult,
} from "@/lib/records/record-actions";
import { cn } from "@/lib/utils";

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
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ActionResult>, done: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.message);
      toast.success(done);
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
            if (confirm("Submit this record? It will be locked for editing.")) run(() => submitRecordAction(table, id), "Submitted");
          }}
        >
          <Send className="size-4" aria-hidden /> Submit
        </button>
      )}
      {can.lock && (
        <button type="button" disabled={pending} className={BTN} onClick={() => run(() => setLockedAction(table, id, !locked), locked ? "Unlocked" : "Locked")}>
          {locked ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
          {locked ? "Unlock" : "Lock"}
        </button>
      )}
      {can.archive && (
        <button type="button" disabled={pending} className={BTN} onClick={() => run(() => setArchivedAction(table, id, !archived), archived ? "Restored from archive" : "Archived")}>
          {archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
          {archived ? "Unarchive" : "Archive"}
        </button>
      )}
      {can.delete && (
        <button
          type="button"
          disabled={pending}
          className={cn(BTN, "text-destructive")}
          onClick={() => {
            if (confirm("Delete this record? It goes to Deleted Items and can be restored."))
              run(() => deleteRecordAction(table, id), "Deleted", () => {
                router.push(listHref);
                router.refresh();
              });
          }}
        >
          <Trash2 className="size-4" aria-hidden /> Delete
        </button>
      )}
    </div>
  );
}
