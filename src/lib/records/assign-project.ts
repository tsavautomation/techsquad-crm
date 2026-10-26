"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { aiConfigured } from "@/lib/ai/claude";
import { rebuildSiteSummary } from "@/lib/ai/site-history";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { createAutoTask, type TaskAction } from "@/lib/engine/task-action";
import { loadEngineRecord } from "@/lib/engine/record-view";
import { folderFor, moveIntoFolder, oneDriveReady } from "@/lib/files/onedrive";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { recordsDb } from "@/lib/records/data";
import { saveRecord } from "./save";
import type { Address } from "./values";

// SV-c Assign to project (Fred 2026-10-26): a survey's visit and job report(s) have no project; the office puts
// them on an existing project or a new one made from the survey's address and contact. Everything hangs on the
// visit or the report, so moving them moves the hours (visit_attendance / time_entries point at the visit), the
// tasks (job_report_id / visit_id), the OneDrive photos (into the project's folder) and the History. The same
// action moves them again (reassign) or, for a survey, takes them off a project (undo).

export type AssignInput = {
  reportId?: number;
  visitId?: number;
  /** An existing project, or null to take a survey off its project. */
  projectId: number | null;
  /** Make a project from the survey instead (wins over projectId). */
  newProject?: { title: string; category: string | null; address: Address | null; contactName: string | null; contactPhone: string | null; contactEmail: string | null };
  /** Also change the visit: keep it a survey, or make it a client visit of the project / a service call. */
  visitKind?: "Survey" | "Visit";
  billing?: "Project" | "Service call" | null;
};
export type AssignResult = { ok: true; projectId: number | null; projectTitle: string | null; moved: { reports: number; tasks: number; files: number }; filesLeft: string[]; billingTask: string | null } | { ok: false; message: string };

const Input = z.object({
  reportId: z.number().int().positive().optional(),
  visitId: z.number().int().positive().optional(),
  projectId: z.number().int().positive().nullable(),
  newProject: z
    .object({
      title: z.string().trim().min(2).max(200),
      category: z.string().trim().max(40).nullable(),
      address: z.object({ street: z.string().optional(), address_2: z.string().optional(), city: z.string().optional(), state: z.string().optional(), zip: z.string().optional() }).nullable(),
      contactName: z.string().trim().max(120).nullable(),
      contactPhone: z.string().trim().max(40).nullable(),
      contactEmail: z.string().trim().max(120).nullable(),
    })
    .optional(),
  visitKind: z.enum(["Survey", "Visit"]).optional(),
  billing: z.enum(["Project", "Service call"]).nullable().optional(),
});

type Visit = { id: number; project_id: number | null; kind: string | null; billing: string | null; status: string | null; starts_at: string; technician_id: number | null; address: Address | null; contact_name: string | null; contact_phone: string | null; contact_email: string | null; contact_id: number | null; title: string | null };
type Report = { id: number; project_id: number | null; visit_id: number | null };

export async function assignProjectAction(raw: AssignInput): Promise<AssignResult> {
  const user = await requireUser();
  if (!canDo(user.permissions, getTable("projects"), "modify", getTable)) return { ok: false, message: "Only people who may change projects can assign one." };
  if (!hasAdminKey()) return { ok: false, message: "The server has no admin key." };
  const p = Input.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Please check the values." };
  const input = p.data;
  const db = await recordsDb();
  const admin = adminDb();
  const who = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  // 1. What moves: the visit and every report of it (or the report alone when it has no visit).
  let visit: Visit | null = null;
  let reports: Report[] = [];
  if (input.reportId) {
    const { data } = await db.from("job_reports").select("id, project_id, visit_id").eq("id", input.reportId).is("deleted_at", null).maybeSingle();
    if (!data) return { ok: false, message: "That report was not found." };
    reports = [data as Report];
    if ((data as Report).visit_id) input.visitId = (data as Report).visit_id!;
  }
  if (input.visitId) {
    const { data } = await db.from("visits").select("id, project_id, kind, billing, status, starts_at, technician_id, address, contact_name, contact_phone, contact_email, contact_id, title").eq("id", input.visitId).is("deleted_at", null).maybeSingle();
    if (!data) return { ok: false, message: "That visit was not found." };
    visit = data as Visit;
    const { data: all } = await db.from("job_reports").select("id, project_id, visit_id").eq("visit_id", visit.id).is("deleted_at", null);
    for (const r of (all ?? []) as Report[]) if (!reports.some((x) => x.id === r.id)) reports.push(r);
  }
  if (!visit && !reports.length) return { ok: false, message: "Nothing to assign." };
  const from = visit?.project_id ?? reports[0]?.project_id ?? null;

  // 2. The destination: an existing project, a new one from the survey, or none (a survey taken off its project).
  let projectId = input.projectId;
  let projectTitle: string | null = null;
  if (input.newProject) {
    const n = input.newProject;
    let ownerId: number | null = null;
    if (n.contactName) {
      const [first, ...rest] = n.contactName.split(/\s+/);
      const c = await saveRecord("contacts", null, { type: "End Customer", first_name: first, last_name: rest.join(" ") || null, main_phone: n.contactPhone, email: n.contactEmail, address: n.address });
      if (c.ok) ownerId = c.id;
    }
    const made = await saveRecord("projects", null, { title: n.title, category: n.category, job_owner_id: ownerId, job_address: n.address });
    if (!made.ok) return { ok: false, message: made.message ?? Object.values(made.errors)[0] ?? "The project could not be created." };
    projectId = made.id;
  }
  if (projectId) {
    const { data } = await db.from("projects").select("id, title").eq("id", projectId).is("deleted_at", null).maybeSingle();
    if (!data) return { ok: false, message: "That project was not found." };
    projectTitle = (data as { title: string | null }).title;
  } else if (visit && !(input.visitKind === "Survey" || visit.kind === "Survey")) return { ok: false, message: "Only a survey can be without a project." };

  // 3. The visit: project, type and billing (direct update: an old visit must not fail today's form rules).
  let billingTask: string | null = null;
  if (visit) {
    const kind = projectId ? (input.visitKind ?? visit.kind ?? "Visit") : "Survey";
    const billing = projectId && kind === "Visit" ? (input.billing === undefined ? (visit.billing ?? "Project") : input.billing) : null;
    const patch: Record<string, unknown> = { project_id: projectId, kind, billing };
    if (kind === "Survey") patch.maintenance_visit = false;
    const { error } = await db.from("visits").update(patch).eq("id", visit.id);
    if (error) return { ok: false, message: error.message };
    await history(admin, "visits", visit.id, from, projectId, projectTitle, who, user.id);
    // F22-c: a Done service call bills the client; the status automation cannot fire here, so the task is made now.
    if (projectId && billing === "Service call" && visit.status === "Done") billingTask = await accountingTask(admin, visit.id, projectTitle);
  }

  // 4. The reports, their tasks, their files.
  let tasks = 0;
  for (const r of reports) {
    const { error } = await db.from("job_reports").update({ project_id: projectId }).eq("id", r.id);
    if (error) return { ok: false, message: `Report #${r.id}: ${error.message}` };
    await history(admin, "job_reports", r.id, r.project_id, projectId, projectTitle, who, user.id);
    const { count } = await admin.from("tasks").update({ project_id: projectId }, { count: "exact" }).eq("job_report_id", r.id).is("deleted_at", null);
    tasks += count ?? 0;
  }
  if (visit) {
    const { count } = await admin.from("tasks").update({ project_id: projectId }, { count: "exact" }).eq("visit_id", visit.id).is("deleted_at", null);
    tasks += count ?? 0;
  }
  const { moved: files, left: filesLeft } = await moveFiles(admin, reports.map((r) => r.id), visit?.id ?? null);

  // 5. Titles follow the project; the AI site history of the destination is rebuilt in the background.
  await retitle(admin, visit, reports, projectTitle);
  if (projectId && aiConfigured()) {
    const pid = projectId;
    after(() => rebuildSiteSummary(admin, pid).catch(() => undefined));
  }
  revalidatePath("/");
  revalidatePath("/schedule");
  if (visit) revalidatePath(recordHref(getTable("visits"), visit.id));
  for (const r of reports) revalidatePath(recordHref(getTable("job_reports"), r.id));
  if (projectId) revalidatePath(recordHref(getTable("projects"), projectId));
  if (from) revalidatePath(recordHref(getTable("projects"), from));
  return { ok: true, projectId, projectTitle, moved: { reports: reports.length, tasks, files }, filesLeft, billingTask };
}

/** One History line on the record: "Assigned to project X by <who>" (or taken off), with the old and new project. */
async function history(admin: ReturnType<typeof adminDb>, table: string, id: number, from: number | null, to: number | null, title: string | null, who: string, actor: string) {
  const note = to ? `Assigned to project ${title ?? `#${to}`} by ${who}` : `Taken off the project by ${who}`;
  await admin.from("audit_log").insert({ table_name: table, record_id: id, action: "update", actor, changes: { project_id: [from, to], assigned_to_project: [null, note] } });
}

/** The photos of the reports (and the visit's files) move into the project's OneDrive folder; what fails is listed. */
async function moveFiles(admin: ReturnType<typeof adminDb>, reportIds: number[], visitId: number | null): Promise<{ moved: number; left: string[] }> {
  if (!(await oneDriveReady())) return { moved: 0, left: [] };
  const left: string[] = [];
  let moved = 0;
  const groups: { table: string; ids: number[] }[] = [{ table: "job_reports", ids: reportIds }, ...(visitId ? [{ table: "visits", ids: [visitId] }] : [])];
  for (const g of groups) {
    if (!g.ids.length) continue;
    const { data } = await admin.from("attachments").select("id, record_id, provider, provider_path, file_name").eq("table_name", g.table).in("record_id", g.ids).eq("provider", "onedrive").is("deleted_at", null);
    const t = getTable(g.table);
    const folders = new Map<number, string>();
    for (const a of (data ?? []) as { id: string; record_id: number; provider_path: string; file_name: string }[]) {
      try {
        const folder = folders.get(a.record_id) ?? (await folderFor(t, a.record_id));
        folders.set(a.record_id, folder);
        await moveIntoFolder(a.provider_path, folder, a.file_name);
        await admin.from("attachments").update({ provider_folder: folder }).eq("id", a.id);
        moved++;
      } catch (e) {
        left.push(`${a.file_name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return { moved, left };
}

/** F22-c's task, made directly because the status did not change now. */
async function accountingTask(admin: ReturnType<typeof adminDb>, visitId: number, projectTitle: string | null): Promise<string | null> {
  const { data } = await admin.from("automations").select("actions, active").eq("id", 900701).maybeSingle();
  const a = data as { actions: TaskAction[]; active: boolean } | null;
  const action = a?.active ? a.actions.find((x) => x.type === "task") : null;
  if (!action) return null;
  const t = getTable("visits");
  const rec = await loadEngineRecord(admin, t, visitId);
  if (!rec) return null;
  const { data: tech } = rec.values.technician_id ? await admin.from("employee_names").select("title").eq("id", rec.values.technician_id as number).maybeSingle() : { data: null };
  const token = (field: string) => (field === "project_id" ? (projectTitle ?? "") : field === "starts_at" ? formatDateTime(rec.values.starts_at as string) : field === "technician_id" ? ((tech as { title: string | null } | null)?.title ?? "") : String(rec.values[field] ?? ""));
  return createAutoTask(admin, 900701, action, t, rec, token, null);
}

/** Titles carry the project's name (or SURVEY – place), so they are rebuilt from the formulas. */
async function retitle(admin: ReturnType<typeof adminDb>, visit: Visit | null, reports: Report[], projectTitle: string | null) {
  const { buildTitle } = await import("./title");
  const { titleOverride } = await import("./hooks");
  if (visit) {
    const t = getTable("visits");
    const rec = await loadEngineRecord(admin, t, visit.id);
    if (rec) {
      const title = (await titleOverride(admin, t, rec.values)) ?? (await buildTitle(t, rec.values, visit.id, admin));
      if (title) await admin.from("visits").update({ title }).eq("id", visit.id);
    }
  }
  for (const r of reports) {
    const t = getTable("job_reports");
    const rec = await loadEngineRecord(admin, t, r.id);
    if (rec) {
      const title = (await titleOverride(admin, t, rec.values)) ?? (await buildTitle(t, rec.values, r.id, admin));
      if (title) await admin.from("job_reports").update({ title }).eq("id", r.id);
    }
  }
  void projectTitle;
}
