import { describe, expect, it } from "vitest";
import { backupFolder, columnsOf, expiredFolders, pkColumns, RESTORE_BLOCKED, toCsv } from "@/lib/backups/format";
import { BackupSettingsSchema, mayRestore } from "@/lib/backups/settings";

// BK-a Backups (SPEC §9.1 BK-a): file format, folder names, the 30-day sweep and who may restore.
describe("toCsv", () => {
  it("writes a header and quotes what needs quoting", () => {
    const rows = [
      { id: 1, title: 'Say "hi", Bob', address: { city: "Boca" }, tags: ["a", "b"], note: null, ok: true },
      { id: 2, title: "line\nbreak", address: null, tags: [], note: "x", ok: false },
    ];
    const csv = toCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("id,title,address,tags,note,ok");
    expect(lines[1]).toBe('1,"Say ""hi"", Bob","{""city"":""Boca""}","[""a"",""b""]",,true');
    expect(lines[2]).toBe('2,"line\nbreak",,[],x,false');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("keeps every column any row has, in first-seen order", () => {
    expect(columnsOf([{ a: 1 }, { b: 2, a: 3 }, { c: 4 }])).toEqual(["a", "b", "c"]);
    expect(toCsv([])).toBe("\r\n");
  });
});

describe("folders and retention", () => {
  it("names folders by the Eastern date", () => {
    expect(backupFolder("nightly", "2026-10-14", "03:01:07")).toBe("TechSquad CRM/Backups/2026-10-14");
    expect(backupFolder("manual", "2026-10-14", "15:22:00")).toBe("TechSquad CRM/Backups/2026-10-14 manual 152200");
    expect(backupFolder("before_restore", "2026-10-14", "15:22:00")).toBe("TechSquad CRM/Backups/2026-10-14 before-restore 152200");
  });
  it("expires folders older than the retention window and leaves odd names alone", () => {
    const names = ["2026-09-13", "2026-09-14", "2026-09-15 manual 101010", "2026-10-13", "notes", "_before-restore"];
    expect(expiredFolders(names, "2026-10-14", 30)).toEqual(["2026-09-13"]);
    expect(expiredFolders(names, "2026-10-16", 30)).toEqual(["2026-09-13", "2026-09-14", "2026-09-15 manual 101010"]);
  });
  it("reads primary-key columns", () => {
    expect(pkColumns("id")).toEqual(["id"]);
    expect(pkColumns("group_id, user_id")).toEqual(["group_id", "user_id"]);
    expect(pkColumns("")).toEqual([]);
  });
});

describe("settings", () => {
  it("defaults to 3 AM, 30 days and Fred", () => {
    expect(BackupSettingsSchema.parse({})).toEqual({ hour: 3, retention_days: 30, restore_emails: ["fred@tsav.net"] });
    expect(BackupSettingsSchema.parse({ hour: "3", retention_days: 30, restore_emails: ["fred@tsav.net"] }).hour).toBe(3);
  });
  it("only the restore list may restore, whatever the case of the e-mail", () => {
    const s = BackupSettingsSchema.parse({});
    expect(mayRestore(s, "Fred@tsav.net")).toBe(true);
    expect(mayRestore(s, "jessica@tsav.net")).toBe(false);
  });
  it("never restores the engine's own tables", () => {
    for (const t of ["backups", "backup_restores", "scheduled_runs"]) expect(RESTORE_BLOCKED.has(t)).toBe(true);
    expect(RESTORE_BLOCKED.has("projects")).toBe(false);
  });
});
