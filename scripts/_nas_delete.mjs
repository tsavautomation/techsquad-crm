// Delete from the NAS copy (drive O:) the entries the comparison marked as moved or deleted in OneDrive (Fred OK 2026-11-04).
//   node scripts/_nas_delete.mjs docs/nas-vs-onedrive-delete.json
import { existsSync, rmSync, statSync, readFileSync, appendFileSync } from "node:fs";
const ROOT = "O:/OneDrive (TS)/";
const { moved, deleted } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const list = [...moved, ...deleted];
const log = process.env.TMP + "/nas-delete.log";
let ok = 0, missing = 0, failed = 0;
for (const rel of list) {
  const p = ROOT + rel;
  if (!existsSync(p)) { missing++; appendFileSync(log, `missing: ${rel}\n`); continue; }
  try {
    const dir = statSync(p).isDirectory();
    rmSync(p, { recursive: true, force: true, maxRetries: 3 });
    ok++;
    appendFileSync(log, `deleted ${dir ? "folder" : "file"}: ${rel}\n`);
  } catch (e) {
    failed++;
    appendFileSync(log, `FAILED: ${rel}: ${e.message}\n`);
  }
  if ((ok + missing + failed) % 50 === 0) console.log(`${ok + missing + failed}/${list.length}`);
}
console.log(`done: ${ok} deleted, ${missing} missing, ${failed} failed of ${list.length}`);
