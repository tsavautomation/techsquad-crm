import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import type { Address } from "@/lib/records/values";
import { isSurvey } from "@/lib/schedule/survey";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { AssignProject, type AssignContext } from "./assign-project";

// SV-c: the Assign to project / Change project box on a visit or a job report. Loads what the box needs: the
// project today, the visit's type and the survey's address and contact (for a new project).

type VisitRow = { id: number; project_id: number | null; kind: string | null; address: Address | null; contact_name: string | null; contact_phone: string | null; contact_email: string | null; projects: { title: string | null } | null };

export async function AssignProjectPanel({ table, id }: { table: "visits" | "job_reports"; id: number }) {
  const [user, db] = await Promise.all([requireUser(), recordsDb()]);
  const canAssign = canDo(user.permissions, getTable("projects"), "modify", getTable);
  if (!canAssign) return null;
  let visit: VisitRow | null = null;
  let projectId: number | null = null;
  let projectTitle: string | null = null;
  if (table === "job_reports") {
    const { data } = await db.from("job_reports").select("id, project_id, visit_id, projects(title)").eq("id", id).maybeSingle();
    const r = data as unknown as { project_id: number | null; visit_id: number | null; projects: { title: string | null } | null } | null;
    if (!r) return null;
    projectId = r.project_id;
    projectTitle = r.projects?.title ?? null;
    if (r.visit_id) {
      const { data: v } = await db.from("visits").select("id, project_id, kind, address, contact_name, contact_phone, contact_email, projects(title)").eq("id", r.visit_id).maybeSingle();
      visit = v as unknown as VisitRow | null;
    }
  } else {
    const { data: v } = await db.from("visits").select("id, project_id, kind, address, contact_name, contact_phone, contact_email, projects(title)").eq("id", id).maybeSingle();
    visit = v as unknown as VisitRow | null;
    if (!visit) return null;
    projectId = visit.project_id;
    projectTitle = visit.projects?.title ?? null;
  }
  const survey = isSurvey(visit?.kind);
  // Only a survey (or a report / visit with no project at all) gets the box; ordinary client visits keep the Edit form.
  if (!survey && projectId) return null;
  const ctx: AssignContext = {
    reportId: table === "job_reports" ? id : undefined,
    visitId: table === "visits" ? id : (visit?.id ?? undefined),
    projectId,
    projectTitle,
    visitKind: visit?.kind ?? null,
    isSurvey: survey,
    address: visit?.address ?? null,
    contactName: visit?.contact_name ?? null,
    contactPhone: visit?.contact_phone ?? null,
    contactEmail: visit?.contact_email ?? null,
    canAssign,
  };
  return <AssignProject ctx={ctx} />;
}
