// BK-a Backups (SPEC §9.1 BK-a): the pure parts. Each night every table goes to OneDrive twice: a .json.gz
// (exact, what a restore reads back) and a .csv (for a person with Excel). Folders are named by the Eastern
// date, so the retention sweep only has to read names.

export const BACKUPS_ROOT = "TechSquad CRM/Backups";
export const PAGE = 1000;

export type BackupKind = "nightly" | "manual" | "before_restore";
export type BackupStatus = "running" | "done" | "failed" | "expired";
export type BackupTable = { name: string; rows: number; bytes: number; json_id: string; csv_id: string | null };

/** Tables that are copied but can never be restored from this page: they are the engine's own bookkeeping. */
export const RESTORE_BLOCKED = new Set(["backups", "backup_restores", "scheduled_runs", "onedrive_folders", "uploads"]);

/** The OneDrive folder of a run: nightly ones are the plain date, the others say why and when. */
export function backupFolder(kind: BackupKind, day: string, time: string): string {
  const stamp = time.replace(/:/g, "");
  if (kind === "nightly") return `${BACKUPS_ROOT}/${day}`;
  return `${BACKUPS_ROOT}/${day} ${kind === "manual" ? "manual" : "before-restore"} ${stamp}`;
}

/** Folder names (under Backups) whose date is older than the retention window. Anything not starting with a date stays. */
export function expiredFolders(names: string[], today: string, retentionDays: number): string[] {
  const cutoff = shiftDate(today, -retentionDays);
  return names.filter((n) => /^\d{4}-\d{2}-\d{2}/.test(n) && n.slice(0, 10) < cutoff);
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Column order for a table's files: the first row's keys, then anything only later rows have. */
export function columnsOf(rows: Record<string, unknown>[]): string[] {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows)
    for (const k of Object.keys(r))
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
  return cols;
}

/** RFC 4180 CSV with a header: objects and arrays as JSON, null as empty, everything else as text. Excel-friendly CRLF. */
export function toCsv(rows: Record<string, unknown>[], columns: string[] = columnsOf(rows)): string {
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(cell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** The order rows are read in: by the primary key, so pages never overlap while the table changes. */
export function pkColumns(pk: string): string[] {
  return pk ? pk.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/** Sizes for the screen: 12.4 MB, 980 kB. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
