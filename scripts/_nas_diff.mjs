// NAS copy (Cloud Sync, broken since 10/21/2026 21:28) vs OneDrive now. Fred's rule (2026-11-04): what was moved,
// deleted or created in OneDrive wins; what was deleted by hand on the NAS comes back; what was saved on the NAS uploads.
//   node scripts/_nas_diff.mjs <od-tree.json> <nas-tree.csv> docs/nas-vs-onedrive.md
import { readFileSync, writeFileSync } from "node:fs";
const [, , odFile, nasFile, outFile] = process.argv;
const CUTOFF = Date.parse("2026-10-22T01:28:00Z"); // 10/21/2026 21:28 EDT, last Cloud Sync log line
const norm = (p) => p.normalize("NFC").toLowerCase();
const od = JSON.parse(readFileSync(odFile, "utf8"));
const odSet = new Set(od.map((i) => norm(i.path)));
const odNames = new Map(); // basename → how many in OneDrive
for (const i of od) { const n = norm(i.path.split("/").pop()); odNames.set(n, (odNames.get(n) ?? 0) + 1); }
// CSV from Get-ChildItem: "Path","Dir",Length,"Created","Modified" (Length is unquoted and empty for folders; quotes inside names are doubled)
const lines = readFileSync(nasFile, "utf8").replace(/^﻿/, "").split(/\r?\n/).slice(1).filter(Boolean);
const re = /^"((?:[^"]|"")*)","(\d)",(?:"?(\d*)"?),"([^"]*)","([^"]*)"$/;
let unparsed = 0;
const nas = lines.map((l) => { const m = l.match(re); if (!m) { unparsed++; return null; } return { path: m[1].replace(/""/g, '"').replace(/^[\\]/, "").replace(/[\\]/g, "/"), dir: m[2] === "1", size: Number(m[3] || 0), created: Date.parse(m[4]), modified: Date.parse(m[5]) }; }).filter(Boolean);
const nasSet = new Set(nas.map((i) => norm(i.path)));
const junk = /(^|\/)(_gsdata_|thumbs\.db|desktop\.ini|\.ds_store|~\$[^/]*|#recycle|@eadir)/i;
// Names Cloud Sync could never have uploaded: OneDrive-invalid characters, or accents stored decomposed (NFD) on the NAS.
const unsyncable = (p) => /[<>:"|?*]/.test(p) || p !== p.normalize("NFC") || /[̀-ͯ]/.test(p);
const onlyNas = nas.filter((i) => !odSet.has(norm(i.path)));
const junkItems = onlyNas.filter((i) => junk.test(i.path));
const real = onlyNas.filter((i) => !junk.test(i.path));
const topMost = (items) => { const set = new Set(items.map((i) => norm(i.path))); return items.filter((i) => { const parts = norm(i.path).split("/"); for (let k = 1; k < parts.length; k++) if (set.has(parts.slice(0, k).join("/"))) return false; return true; }); };
const newLocal = real.filter((i) => i.created > CUTOFF);
const old = real.filter((i) => i.created <= CUTOFF);
const neverUploaded = old.filter((i) => unsyncable(i.path));
const gone = old.filter((i) => !unsyncable(i.path)); // existed before the break, syncable, not in OneDrive now → moved or deleted there
// A folder that holds new local work (C) is never deleted whole: only its old children go.
const keepFolders = new Set();
for (const i of newLocal) { const parts = norm(i.path).split("/"); for (let k = 1; k < parts.length; k++) keepFolders.add(parts.slice(0, k).join("/")); }
const goneTop = topMost(gone.filter((i) => !(i.dir && keepFolders.has(norm(i.path)))));
const movedTop = goneTop.filter((i) => odNames.has(norm(i.path.split("/").pop())));
const deletedTop = goneTop.filter((i) => !odNames.has(norm(i.path.split("/").pop())));
const onlyOd = od.filter((i) => !nasSet.has(norm(i.path)));
const bytes = (xs) => xs.reduce((n, i) => n + (i.dir || i.file === false ? 0 : i.size || 0), 0);
const gb = (xs) => `${(bytes(xs) / 1e9).toFixed(2)} GB`;
const fmt = (d) => new Date(d).toLocaleDateString("en-US", { timeZone: "America/New_York" });
const group = (items, depth = 2) => { const m = new Map(); for (const i of items) { const k = i.path.split("/").slice(0, depth).join("/"); const g = m.get(k) ?? { n: 0, size: 0 }; g.n++; g.size += i.size || 0; m.set(k, g); } return [...m].sort((a, b) => b[1].n - a[1].n); };
const out = [];
out.push(`# NAS vs OneDrive (${new Date().toISOString().slice(0, 10)})`, "", `OneDrive: ${od.length} items. NAS: ${nas.length} items (${unparsed} lines unparsed). Cut-off: 10/21/2026 21:28 (last Cloud Sync log line).`, "");
out.push(`## A. On the NAS only, from before the break, and the same name exists elsewhere in OneDrive → MOVED in OneDrive → delete from NAS`, `${movedTop.length} top entries, ${gone.filter((i) => movedTop.some((t) => i.path === t.path || i.path.startsWith(t.path + "/"))).length} items, ${gb(gone.filter((i) => movedTop.some((t) => i.path === t.path || i.path.startsWith(t.path + "/"))))}`, "");
for (const [k, g] of group(movedTop)) out.push(`- ${k}: ${g.n} entries`);
out.push("", `## B. On the NAS only, from before the break, name not found anywhere in OneDrive → DELETED in OneDrive → delete from NAS`, `${deletedTop.length} top entries, ${gb(deletedTop)}`, "");
for (const [k, g] of group(deletedTop)) out.push(`- ${k}: ${g.n} entries, ${(g.size / 1e6).toFixed(0)} MB`);
out.push("", `## C. On the NAS only, created after the break → new local work → keep, will upload`, `${newLocal.length} items (${topMost(newLocal).length} top entries), ${gb(newLocal)}`, "");
for (const i of topMost(newLocal)) out.push(`- ${i.dir ? "📁 " : ""}${i.path}  (${fmt(i.created)})`);
out.push("", `## D. On the NAS only, names Cloud Sync could never upload (accents stored decomposed, or < > : " | ? *) → keep, nothing to do`, `${neverUploaded.length} items, ${gb(neverUploaded)}`, "");
for (const [k, g] of group(neverUploaded)) out.push(`- ${k}: ${g.n} items`);
out.push("", `## E. Junk on the NAS only (ignored): ${junkItems.length} items`, "", `## F. In OneDrive only → will download to the NAS: ${onlyOd.length} items, ${gb(onlyOd)}`, "");
for (const [k, g] of group(onlyOd.map((i) => ({ ...i })), 2).slice(0, 60)) out.push(`- ${k}: ${g.n} items, ${(g.size / 1e6).toFixed(0)} MB`);
out.push("", "## Full lists", "", "### A (moved)", "");
for (const i of movedTop) out.push(`- ${i.dir ? "📁 " : ""}${i.path}`);
out.push("", "### B (deleted)", "");
for (const i of deletedTop) out.push(`- ${i.dir ? "📁 " : ""}${i.path}  (${fmt(i.created)})`);
writeFileSync(outFile, out.join("\n") + "\n");
writeFileSync(outFile.replace(/\.md$/, "-delete.json"), JSON.stringify({ moved: movedTop.map((i) => i.path), deleted: deletedTop.map((i) => i.path) }, null, 1));
console.log(`unparsed ${unparsed}; A moved ${movedTop.length} top; B deleted ${deletedTop.length} top; C new local ${newLocal.length}; D never uploaded ${neverUploaded.length}; junk ${junkItems.length}; F download ${onlyOd.length}`);
