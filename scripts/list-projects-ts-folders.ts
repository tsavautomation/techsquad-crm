/**
 * List what sits inside each open "PROJECTS TS / <designer or GC> / <client folder>" in OneDrive, for
 * the Report archive decisions sheet (F16-d). Each client folder usually holds a subfolder named with
 * the job address ("788 NE 23rd St #201, Miami, FL 33137, USA") and an "Estimates - Invoices" folder
 * whose file names carry the Portal proposal number.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/list-projects-ts-folders.ts
 *
 * Writes docs/projects-ts-folders.json (git-ignored: client addresses). Resumable: folders already
 * listed are skipped; pass --fresh to list everything again. Reads OneDrive only.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { listChildren, type DriveChild } from "@/lib/files/onedrive";
import { adminDb } from "@/lib/supabase/admin";

const ROOT = "PROJECTS TS";
const OUT = "docs/projects-ts-folders.json";
export type FolderListing = { gc: string; folder: string; children: string[]; estimates: string[]; documents: string[]; error?: string };

async function main() {
  const fresh = process.argv.includes("--fresh");
  const have: Record<string, FolderListing> = !fresh && existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const db = adminDb();
  const seen = new Map<string, { gc: string; folder: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("report_files").select("gc_folder, client_folder").eq("status", "unmatched").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data as { gc_folder: string; client_folder: string }[]) seen.set(`${r.gc_folder}/${r.client_folder}`, { gc: r.gc_folder, folder: r.client_folder });
    if (data.length < 1000) break;
  }
  const todo = [...seen.entries()].filter(([k]) => !have[k]);
  console.log(`${seen.size} open folders, ${todo.length} to list`);
  let i = 0, n = 0;
  const sub = async (path: string, name: RegExp, children: DriveChild[]) => {
    const d = children.find((c) => c.folder && name.test(c.name));
    return d ? (await listChildren(`${path}/${d.name}`)).map((c) => c.name) : [];
  };
  const worker = async () => {
    while (i < todo.length) {
      const [k, { gc, folder }] = todo[i++];
      const path = `${ROOT}/${gc}/${folder}`;
      try {
        const kids = await listChildren(path);
        have[k] = { gc, folder, children: kids.map((c) => (c.folder ? "[dir] " : "") + c.name), estimates: await sub(path, /estimates|invoices/i, kids), documents: await sub(path, /^1-?\s*documents/i, kids) };
      } catch (e) {
        have[k] = { gc, folder, children: [], estimates: [], documents: [], error: (e as Error).message };
      }
      if (++n % 25 === 0) { writeFileSync(OUT, JSON.stringify(have, null, 1)); console.log(`${n}/${todo.length}`); }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  writeFileSync(OUT, JSON.stringify(have, null, 1));
  const errors = Object.values(have).filter((f) => f.error).length;
  console.log(`-> ${OUT}: ${Object.keys(have).length} folders listed, ${errors} errors`);
}
main().catch((e) => { console.error(e); process.exit(1); });
