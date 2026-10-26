"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { searchProjectsAction } from "@/lib/mail/actions";
import { assignProjectAction } from "@/lib/records/assign-project";
import type { Address } from "@/lib/records/values";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// SV-c: "Assign to project" on a job report or a visit without a project (or "Change project" on one that has one).
// Two ways: pick an existing project, or make a new one prefilled with the survey's address and contact.

export type AssignContext = {
  reportId?: number;
  visitId?: number;
  projectId: number | null;
  projectTitle: string | null;
  /** The visit's type today; a survey may become a client visit or a service call when assigned. */
  visitKind: string | null;
  isSurvey: boolean;
  address: Address | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  canAssign: boolean;
};

const BOX = "h-11 w-full rounded-[10px] border bg-background px-3 text-base";

export function AssignProject({ ctx }: { ctx: AssignContext }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [q, setQ] = useState("");
  const [choices, setChoices] = useState<{ id: number; label: string }[]>([]);
  const [picked, setPicked] = useState<{ id: number; label: string } | null>(null);
  const [title, setTitle] = useState(ctx.contactName ? `${ctx.contactName} – ${[ctx.address?.street, ctx.address?.city].filter(Boolean).join(", ")}` : [ctx.address?.street, ctx.address?.city].filter(Boolean).join(", "));
  const [category, setCategory] = useState("Low Voltage");
  const [keepSurvey, setKeepSurvey] = useState(false);
  const [billing, setBilling] = useState<"Project" | "Service call">("Project");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || mode !== "existing" || picked || q.trim().length < 2) return;
    const timer = setTimeout(() => void searchProjectsAction(q).then(setChoices), 250);
    return () => clearTimeout(timer);
  }, [q, open, mode, picked]);

  if (!ctx.canAssign) return null;

  const run = (projectId: number | null, newProject?: { title: string; category: string | null; address: Address | null; contactName: string | null; contactPhone: string | null; contactEmail: string | null }) =>
    start(async () => {
      const r = await assignProjectAction({ reportId: ctx.reportId, visitId: ctx.visitId, projectId, newProject, visitKind: ctx.isSurvey ? (keepSurvey ? "Survey" : "Visit") : undefined, billing: ctx.isSurvey && !keepSurvey ? billing : undefined });
      if (!r.ok) {
        toast.error(t(r.message));
        return;
      }
      const parts = [r.projectId ? t("Assigned to {project}", { project: r.projectTitle ?? `#${r.projectId}` }) : t("Taken off the project")];
      if (r.moved.files) parts.push(t("{n} files moved", { n: r.moved.files }));
      if (r.filesLeft.length) parts.push(t("{n} files could not be moved", { n: r.filesLeft.length }));
      if (r.billingTask) parts.push(t("Accounting task created"));
      toast.success(parts.join(" · "));
      setOpen(false);
      router.refresh();
    });

  return (
    <section className="rounded-2xl border bg-card px-[18px] py-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
          <FolderKanban className="size-4 text-text-2" aria-hidden />
          {ctx.projectId ? ctx.projectTitle ?? `#${ctx.projectId}` : t("No project yet")}
        </p>
        <button type="button" onClick={() => setOpen((o) => !o)} className={cn("inline-flex h-11 items-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold", ctx.projectId ? "border hover:bg-muted" : "bg-primary text-primary-foreground hover:brightness-95")}>
          {ctx.projectId ? t("Change project") : t("Assign to project")}
        </button>
      </div>
      {!ctx.projectId && <p className="mt-1 text-xs text-text-2">{t("A survey has no project. Once assigned, its hours, photos, report and tasks move to the project.")}</p>}

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex rounded-[10px] border bg-muted p-0.5 text-[13px]" role="tablist">
            {(["existing", "new"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("flex-1 rounded-lg px-3 py-2", mode === m ? "bg-card font-semibold shadow-card" : "text-text-2")}>
                {m === "existing" ? t("Existing project") : t("New project")}
              </button>
            ))}
          </div>

          {mode === "existing" ? (
            <div className="relative">
              <input
                type="text"
                value={picked ? picked.label : q}
                onChange={(e) => {
                  setPicked(null);
                  setChoices([]);
                  setQ(e.target.value);
                }}
                placeholder={t("Project name or #number")}
                aria-label={t("Project")}
                className={cn(BOX, picked && "font-medium")}
              />
              {!picked && choices.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-[10px] border bg-card shadow-float">
                  {choices.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => { setPicked(c); setChoices([]); }} className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-muted">
                        {c.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("Project name")} aria-label={t("Project name")} className={BOX} />
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("Category")} className={BOX}>
                <option value="Low Voltage">Low Voltage</option>
                <option value="Electrical">Electrical</option>
              </select>
              <p className="text-xs text-text-2">
                {t("Address and contact come from the survey:")} {[ctx.address?.street, ctx.address?.city].filter(Boolean).join(", ") || "—"} · {ctx.contactName ?? "—"} {ctx.contactPhone ? `· ${ctx.contactPhone}` : ""} {ctx.contactEmail ? `· ${ctx.contactEmail}` : ""}
              </p>
            </div>
          )}

          {ctx.isSurvey && (
            <div className="grid gap-2 rounded-xl border px-3 py-2 text-sm">
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={keepSurvey} onChange={(e) => setKeepSurvey(e.target.checked)} className="size-5" />
                {t("Keep it as a survey (only link it to the project)")}
              </label>
              {!keepSurvey && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-text-2">{t("The visit becomes a client visit:")}</span>
                  <select value={billing} onChange={(e) => setBilling(e.target.value as "Project" | "Service call")} className={BOX}>
                    <option value="Project">{t("Part of the project")}</option>
                    <option value="Service call">{t("Service call (billed separately)")}</option>
                  </select>
                </label>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || (mode === "existing" ? !picked : title.trim().length < 2)}
              onClick={() => (mode === "existing" ? run(picked!.id) : run(null, { title: title.trim(), category, address: ctx.address, contactName: ctx.contactName, contactPhone: ctx.contactPhone, contactEmail: ctx.contactEmail }))}
              className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {mode === "existing" ? t("Assign") : t("Create project and assign")}
            </button>
            {ctx.projectId && ctx.isSurvey && (
              <button type="button" disabled={pending} onClick={() => run(null)} className="inline-flex h-11 items-center rounded-[10px] border px-4 text-sm hover:bg-muted">
                {t("Take off the project")}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="inline-flex size-11 items-center justify-center rounded-[10px] border" aria-label={t("Close")}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
