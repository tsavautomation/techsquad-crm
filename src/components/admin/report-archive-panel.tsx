"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveStatusAction, decideFolderAction, importArchiveAction, scanArchiveAction, undecideFolderAction, type ArchiveStatus } from "@/lib/archive/actions";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const BTN = "inline-flex h-11 items-center justify-center rounded-[10px] px-4 text-sm font-semibold disabled:opacity-50";
const PRIMARY = cn(BTN, "bg-primary text-primary-foreground hover:brightness-95");
const PLAIN = cn(BTN, "border font-medium hover:bg-muted");
const INPUT = "mt-1 h-11 w-full rounded-[10px] border bg-card px-3 text-base md:text-sm disabled:opacity-50";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/** Admin › Report archive: scan, dry run, import, and what needs a human. */
export function ReportArchivePanel({ initial, folders, projects, aiAvailable }: { initial: ArchiveStatus; folders: string[]; projects: { id: number; title: string }[]; aiAvailable: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<ArchiveStatus>(initial);
  const [cutoff, setCutoff] = useState(initial.state?.cutoff ?? initial.defaultCutoff);
  // Folders decided by hand: the form's three fields.
  const [folder, setFolder] = useState("");
  const [projectText, setProjectText] = useState("");
  const [noProject, setNoProject] = useState(false);
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]));
  const st = status.state;
  const running = st?.phase === "scanning" || st?.phase === "importing";

  useEffect(() => {
    if (!running) return;
    let alive = true;
    const tick = async () => {
      const r = await archiveStatusAction();
      if (!alive || !r.ok) return;
      setStatus(r.status);
      const ph = r.status.state?.phase;
      if (ph !== "scanning" && ph !== "importing") router.refresh();
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [running, router]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(t(r.message));
      const s = await archiveStatusAction();
      if (s.ok) setStatus(s.status);
    });

  const phaseText: Record<string, string> = {
    idle: t("Not started"),
    scanning: t("Listing the folders…"),
    scanned: t("Folders listed. Run a dry run next."),
    importing: st?.dryRun ? t("Dry run: reading the files…") : t("Importing…"),
    done: st?.dryRun ? t("Dry run finished. Check the numbers below, then import.") : t("Import finished."),
    error: t("Stopped with an error"),
  };
  const by = status.summary.byStatus;
  const total = Object.values(by).reduce((a, b) => a + b, 0);

  return (
    <>
      <Card title={t("1. List the files")}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-2">{t("Skip files dated from (first WebAuthor report)")}</span>
            <input type="date" className="h-11 rounded-[10px] border bg-card px-2 text-base md:text-sm" value={cutoff} onChange={(e) => setCutoff(e.target.value)} disabled={running} />
          </label>
          <button type="button" className={st && st.phase !== "idle" ? PLAIN : PRIMARY} disabled={pending || running || status.busy} onClick={() => run(() => scanArchiveAction(cutoff))}>
            {st?.phase === "error" && st.scan.files > 0 ? t("Try again") : st && st.phase !== "idle" ? t("List again") : t("List the files")}
          </button>
        </div>
        {st && (
          <p className="mt-2 text-sm text-text-2">
            {running && <span className="mr-2 inline-block size-2.5 animate-pulse rounded-full bg-primary align-middle" aria-hidden />}
            {phaseText[st.phase]} · {t("{n} files listed", { n: st.scan.files })}
            {st.error && <span className="block text-bad-fg">{st.error}</span>}
          </p>
        )}
        {status.summary.staff.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("Added as inactive employees (named in the files): {names}", { names: status.summary.staff.join(", ") })}</p>}
      </Card>

      {st && st.phase !== "idle" && st.phase !== "scanning" && (
        <Card title={t("2. Read and import")}>
          <p className="mb-2 text-xs text-muted-foreground">
            {t("A dry run reads every file and decides project, date and technicians without creating anything. The import then creates a Job Report and a Visit per file. Forms are read by their layout; typed notes and screenshots are read by Claude.")}
            {!aiAvailable && <span className="block text-warn-fg">{t("The AI key is missing (Admin › AI): only the two form layouts can be read.")}</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={PLAIN} disabled={pending || running || status.busy} onClick={() => run(() => importArchiveAction(true))}>
              {t("Dry run")}
            </button>
            <button
              type="button"
              className={PRIMARY}
              disabled={pending || running || status.busy}
              onClick={() => {
                if (!confirm(t("Create Job Reports and Visits for every file that found its project? This writes to the CRM."))) return;
                run(() => importArchiveAction(false));
              }}
            >
              {t("Import")}
            </button>
          </div>
          {st.phase === "importing" || st.phase === "done" || st.phase === "error" ? (
            <p className="mt-2 text-sm text-text-2">
              {running && <span className="mr-2 inline-block size-2.5 animate-pulse rounded-full bg-primary align-middle" aria-hidden />}
              {phaseText[st.phase]} · {st.dryRun ? t("{n} read", { n: st.counts.read }) : t("{n} imported", { n: st.counts.imported })} · {t("{n} skipped", { n: st.counts.skipped })} · {t("{n} without a project", { n: st.counts.unmatched })} · {t("{n} errors", { n: st.counts.errors })}
              {st.finishedAt && <span className="block text-xs text-muted-foreground">{t("Finished {date}", { date: formatDateTime(st.finishedAt) })}</span>}
            </p>
          ) : null}
        </Card>
      )}

      {total > 0 && (
        <Card title={t("Where the files stand")}>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            {Object.entries(by).map(([k, v]) => (
              <li key={k}>
                <span className="text-text-2">{t(k)}</span>: <b>{v}</b>
              </li>
            ))}
          </ul>
          {Object.keys(status.summary.byLayout).length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Read as")}: {Object.entries(status.summary.byLayout).map(([k, v]) => `${k} ${v}`).join(" · ")}
            </p>
          )}
        </Card>
      )}

      {status.summary.unmatchedFolders.length > 0 && (
        <Card title={t("Folders with no project")}>
          <p className="mb-2 text-xs text-muted-foreground">{t("Create or rename the project so its name, address or unit matches the folder, then run the dry run again. The two likeliest projects are shown with their score.")}</p>
          <ul className="divide-y text-sm">
            {status.summary.unmatchedFolders.map((f) => (
              <li key={f.folder} className="flex flex-col py-1.5">
                <span className="font-medium">
                  {f.folder} <span className="font-normal text-text-2">· {t("{n} files", { n: f.files })}</span>
                </span>
                {f.candidates.length > 0 && <span className="text-xs text-muted-foreground">{f.candidates.map((c) => `${c.title ?? "?"} (${c.score})`).join(" · ")}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={t("Folders decided by hand")}>
        <p className="mb-2 text-xs text-muted-foreground">{t("When a folder belongs to a certain project, or to none, say so here. The import follows this list before any scoring; run the dry run again after a change.")}</p>
        {status.decisions.length > 0 && (
          <ul className="mb-3 divide-y text-sm">
            {status.decisions.map((d) => (
              <li key={d.folder} className="flex items-center justify-between gap-2 py-1">
                <span>
                  <span className="font-medium">{d.folder}</span> <span className="text-text-2">→ {d.projectId === null ? t("No project") : (projectTitle.get(d.projectId) ?? `#${d.projectId}`)}</span>
                </span>
                <button type="button" className="h-11 shrink-0 px-2 text-sm font-medium text-text-2 hover:text-foreground disabled:opacity-50" aria-label={t("Remove {folder}", { folder: d.folder })} disabled={pending} onClick={() => run(() => undecideFolderAction(d.folder))}>
                  {t("Remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
          <label className="text-xs text-text-2">
            {t("Folder")}
            <input list="archive-folders" className={INPUT} value={folder} onChange={(e) => setFolder(e.target.value)} disabled={pending} />
            <datalist id="archive-folders">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>
          <label className="text-xs text-text-2">
            {t("Project")}
            <input list="archive-projects" className={INPUT} value={projectText} onChange={(e) => setProjectText(e.target.value)} disabled={pending || noProject} />
            <datalist id="archive-projects">
              {projects.map((p) => (
                <option key={p.id} value={p.title} />
              ))}
            </datalist>
          </label>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={noProject} onChange={(e) => setNoProject(e.target.checked)} disabled={pending} />
            {t("No project")}
          </label>
          <button
            type="button"
            className={PRIMARY}
            disabled={pending || !folder.trim() || (!noProject && !projectText.trim())}
            onClick={() =>
              run(async () => {
                const p = noProject ? null : projects.find((x) => x.title === projectText.trim())?.id;
                if (p === undefined) return { ok: false, message: "Pick a project from the list." };
                const r = await decideFolderAction(folder, p);
                if (r.ok) {
                  setFolder("");
                  setProjectText("");
                  setNoProject(false);
                }
                return r;
              })
            }
          >
            {t("Add")}
          </button>
        </div>
      </Card>

      {status.summary.errors.length > 0 && (
        <Card title={t("Files that could not be read")}>
          <ul className="divide-y text-sm">
            {status.summary.errors.map((e) => (
              <li key={e.name} className="py-1.5">
                <span className="font-medium">{e.name}</span> <span className="text-text-2">· {e.reason}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
