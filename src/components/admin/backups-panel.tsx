"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronRight, DatabaseBackup, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { restoreTableAction, runBackupNowAction } from "@/lib/backups/actions";
import { formatBytes, RESTORE_BLOCKED, type BackupKind, type BackupStatus, type BackupTable } from "@/lib/backups/format";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// BK-a Admin › Backups: the list of nights (newest first), each opening to its tables; "Back up now";
// and, for the restore list only, a Restore button per table with a confirmation that spells out what happens.

export type BackupListRow = { id: number; day: string; kind: BackupKind; status: BackupStatus; folder_path: string; started_at: string; finished_at: string | null; tables: BackupTable[]; bytes: number; rows_total: number; error: string | null };
export type RestoreLogRow = { id: number; backup_id: number; table_name: string; rows_written: number; rows_deleted: number; snapshot_backup_id: number | null; error: string | null; restored_at: string; who: string };

const BTN = "inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50";
const LINK = "inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-[13px] hover:bg-muted disabled:opacity-50";

const STATUS_TONE: Record<BackupStatus, string> = { done: "bg-ok-bg text-ok-fg", running: "bg-info-bg text-info-fg", failed: "bg-bad-bg text-bad-fg", expired: "bg-muted text-muted-foreground" };

export function BackupsPanel({ backups, restores, canRestore, restoreEmails, oneDriveReady }: { backups: BackupListRow[]; restores: RestoreLogRow[]; canRestore: boolean; restoreEmails: string[]; oneDriveReady: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<number | null>(backups[0]?.id ?? null);
  const [restoring, setRestoring] = useState<{ backup: BackupListRow; table: BackupTable } | null>(null);
  const last = backups.find((b) => b.status === "done" && b.kind === "nightly");

  const runNow = () =>
    start(async () => {
      const r = await runBackupNowAction();
      if (!r.ok) return void toast.error(t(r.message));
      if (r.result.status === "done") toast.success(t("Backup written: {n} tables, {rows} rows, {size}.", { n: r.result.tables_done, rows: r.result.rows, size: formatBytes(r.result.bytes) }));
      else if (r.result.skipped) toast.info(t(r.result.skipped));
      else if (r.result.status === "running") toast.info(t("{n} of {total} tables copied so far; the rest continues within the hour (or press the button again).", { n: r.result.tables_done, total: r.result.tables_total }));
      else toast.warning(t("The backup did not finish: {error}", { error: r.result.error ?? r.result.status }));
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3.5">
      <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold">{last ? t("Last nightly copy: {date}", { date: formatDate(last.day) }) : t("No nightly copy yet.")}</p>
            <p className="text-muted-foreground">
              {last ? t("{n} tables · {rows} rows · {size}", { n: last.tables.length, rows: last.rows_total.toLocaleString(), size: formatBytes(last.bytes) }) : t("The first one is written tonight.")}
            </p>
          </div>
          <button type="button" onClick={runNow} disabled={pending || !oneDriveReady} className={BTN}>
            <DatabaseBackup className="size-4" aria-hidden /> {pending ? t("Copying… this takes a few minutes") : t("Back up now")}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {canRestore ? t("You are on the restore list: you can put any table back as it was on one of these nights.") : t("Only {list} can restore. You can see the copies and open them in OneDrive.", { list: restoreEmails.join(", ") })}
        </p>
      </section>

      <section className="rounded-2xl border bg-card shadow-card">
        <h2 className="px-[18px] pt-4 text-[15px] font-semibold tracking-tight">{t("Copies")}</h2>
        {!backups.length ? (
          <p className="px-[18px] pb-4 pt-2 text-sm text-muted-foreground">{t("Nothing yet.")}</p>
        ) : (
          <ul className="mt-2 divide-y">
            {backups.map((b) => {
              const isOpen = open === b.id;
              return (
                <li key={b.id}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : b.id)} className="flex w-full items-center gap-3 px-[18px] py-3 text-left hover:bg-muted/50">
                    {isOpen ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {formatDate(b.day)}
                        {b.kind !== "nightly" && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-text-2">{b.kind === "manual" ? t("manual") : t("before a restore")}</span>}
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[b.status])}>{t(STATUS_LABEL[b.status])}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {b.status === "expired"
                          ? t("Removed from OneDrive after the retention period.")
                          : t("{n} tables · {rows} rows · {size} · {when}", { n: b.tables.length, rows: b.rows_total.toLocaleString(), size: formatBytes(b.bytes), when: formatDateTime(b.finished_at ?? b.started_at) })}
                        {b.error && <span className="text-bad-fg"> · {b.error}</span>}
                      </span>
                    </span>
                  </button>
                  {isOpen && b.tables.length > 0 && (
                    <div className="px-[18px] pb-3">
                      <p className="mb-1 text-xs text-muted-foreground">{b.folder_path.replace(/\//g, " › ")}</p>
                      <ul className="divide-y rounded-lg border text-sm">
                        {[...b.tables]
                          .sort((x, y) => x.name.localeCompare(y.name))
                          .map((tb) => (
                            <li key={tb.name} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5">
                              <span className="min-w-0 basis-full break-all font-mono text-[13px] sm:basis-auto sm:flex-1 sm:truncate">{tb.name}</span>
                              <span className="text-xs text-muted-foreground tabular-nums">{t("{rows} rows", { rows: tb.rows.toLocaleString() })}</span>
                              <span className="w-16 text-right text-xs text-muted-foreground tabular-nums sm:ml-0">{formatBytes(tb.bytes)}</span>
                              {canRestore && b.status === "done" && !RESTORE_BLOCKED.has(tb.name) && (
                                <button type="button" onClick={() => setRestoring({ backup: b, table: tb })} className={cn(LINK, "ml-auto")}>
                                  <RotateCcw className="size-3.5" aria-hidden /> {t("Restore")}
                                </button>
                              )}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="text-[15px] font-semibold tracking-tight">{t("Restores")}</h2>
        {!restores.length ? (
          <p className="mt-1 text-sm text-muted-foreground">{t("No table has been restored.")}</p>
        ) : (
          <ul className="mt-2 divide-y text-sm">
            {restores.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex flex-wrap justify-between gap-x-3">
                  <span>
                    <span className="font-mono text-[13px]">{r.table_name}</span> · {r.who}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(r.restored_at)}</span>
                </div>
                <p className={r.error ? "text-bad-fg" : "text-muted-foreground"}>
                  {r.error ? r.error : t("{written} rows written, {deleted} deleted; safety copy #{snap}.", { written: r.rows_written, deleted: r.rows_deleted, snap: r.snapshot_backup_id ?? "—" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {restoring && <RestoreDialog backup={restoring.backup} table={restoring.table} onClose={() => setRestoring(null)} />}
    </div>
  );
}

const STATUS_LABEL: Record<BackupStatus, string> = { done: "done", running: "running", failed: "failed", expired: "expired" };

function RestoreDialog({ backup, table, onClose }: { backup: BackupListRow; table: BackupTable; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [deleteMissing, setDeleteMissing] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !pending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);
  const word = table.name.toUpperCase();
  const go = () =>
    start(async () => {
      const r = await restoreTableAction({ backupId: backup.id, table: table.name, deleteMissing });
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("{table} restored: {written} rows written, {deleted} deleted. The safety copy is in the list.", { table: table.name, written: r.rows_written, deleted: r.rows_deleted }));
      router.refresh();
      onClose();
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={() => !pending && onClose()}>
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-t-2xl bg-card p-5 shadow-xl md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-tight">{t("Restore {table} as of {date}", { table: table.name, date: formatDate(backup.day) })}</h2>
          <button type="button" onClick={onClose} disabled={pending} aria-label={t("Close")} className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="mb-3 flex gap-2 rounded-[10px] bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{t("Every record in this table goes back to how it was that night ({rows} rows). Changes made since are lost for those records. A safety copy of the table as it is now is written to OneDrive first, so this can be undone.", { rows: table.rows.toLocaleString() })}</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={deleteMissing} onChange={(e) => setDeleteMissing(e.target.checked)} className="mt-1 size-4" />
          <span>{t("Also delete records added after that night (otherwise they stay).")}</span>
        </label>
        <label className="mt-3 block text-sm font-medium">
          {t("Type {word} to confirm", { word })}
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 font-mono text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="inline-flex h-11 items-center rounded-[10px] border px-4 text-sm font-semibold hover:bg-muted">
            {t("Cancel")}
          </button>
          <button type="button" onClick={go} disabled={pending || typed.trim() !== word} className={cn(BTN, "bg-bad-fg")}>
            <RotateCcw className="size-4" aria-hidden /> {pending ? t("Restoring…") : t("Restore")}
          </button>
        </div>
      </div>
    </div>
  );
}
