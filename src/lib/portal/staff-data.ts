import "server-only";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { adminDb } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";

// Customer portal (F6), office side: what the "Customer portal" card on a Project shows.

export type PortalAccessRow = {
  contactId: number;
  name: string;
  email: string | null;
  invitedAt: string | null;
  /** "none": no login yet · "invited": login exists, never signed in · "active": has signed in */
  login: "none" | "invited" | "active";
  lastSignIn: string | null;
};
export type PortalPick = { id: number; title: string; checked: boolean; hint?: string | null };
export type PortalPanelData = {
  canEdit: boolean;
  access: PortalAccessRow[];
  /** The project's Job Owner, offered first when they don't have access yet. */
  suggested: { id: number; title: string; email: string | null } | null;
  documents: PortalPick[];
  projectDocuments: { id: number; title: string }[];
  apps: PortalPick[];
  newDocumentHref: string;
};

export async function loadPortalPanel(projectId: number): Promise<PortalPanelData> {
  const user = await requireUser();
  const db = await recordsDb();
  const [{ data: access }, { data: project }, { data: docs }, { data: docLinks }, { data: apps }, { data: appLinks }] = await Promise.all([
    db.from("portal_access").select("contact_id, invited_at, contacts(title, email)").eq("project_id", projectId),
    db.from("projects").select("job_owner_id, contacts:job_owner_id(id, title, email)").eq("id", projectId).maybeSingle(),
    db.from("portal_documents").select("id, title, category, project_id").is("deleted_at", null).is("archived_at", null).or(`project_id.is.null,project_id.eq.${projectId}`).order("category").order("title"),
    db.from("portal_document_projects").select("document_id").eq("project_id", projectId),
    db.from("portal_apps").select("id, title, purpose").is("deleted_at", null).is("archived_at", null).order("title"),
    db.from("portal_app_projects").select("app_id").eq("project_id", projectId),
  ]);
  const rows = (access ?? []) as unknown as { contact_id: number; invited_at: string | null; contacts: { title: string | null; email: string | null } | null }[];
  // Login state comes from Auth (last sign-in), one lookup per person with access.
  const { data: profiles } = rows.length ? await db.from("profiles").select("id, contact_id").in("contact_id", rows.map((r) => r.contact_id)) : { data: [] };
  const profileByContact = new Map(((profiles ?? []) as { id: string; contact_id: number }[]).map((p) => [p.contact_id, p.id]));
  const admin = rows.length && profileByContact.size ? adminDb() : null;
  const accessRows: PortalAccessRow[] = await Promise.all(
    rows.map(async (r) => {
      const uid = profileByContact.get(r.contact_id);
      let login: PortalAccessRow["login"] = "none";
      let lastSignIn: string | null = null;
      if (uid && admin) {
        const { data } = await admin.auth.admin.getUserById(uid);
        lastSignIn = data.user?.last_sign_in_at ?? null;
        login = lastSignIn ? "active" : "invited";
      }
      return { contactId: r.contact_id, name: r.contacts?.title ?? `#${r.contact_id}`, email: r.contacts?.email ?? null, invitedAt: r.invited_at, login, lastSignIn };
    }),
  );
  const owner = (project as unknown as { contacts: { id: number; title: string | null; email: string | null } | null } | null)?.contacts ?? null;
  const linkedDocs = new Set(((docLinks ?? []) as { document_id: number }[]).map((d) => d.document_id));
  const linkedApps = new Set(((appLinks ?? []) as { app_id: number }[]).map((a) => a.app_id));
  const allDocs = (docs ?? []) as { id: number; title: string | null; category: string | null; project_id: number | null }[];
  return {
    canEdit: canDo(user.permissions, getTable("projects"), "modify", getTable),
    access: accessRows,
    suggested: owner && !accessRows.some((a) => a.contactId === owner.id) ? { id: owner.id, title: owner.title ?? `#${owner.id}`, email: owner.email } : null,
    documents: allDocs.filter((d) => d.project_id == null).map((d) => ({ id: d.id, title: d.title ?? `#${d.id}`, checked: linkedDocs.has(d.id), hint: d.category })),
    projectDocuments: allDocs.filter((d) => d.project_id === projectId).map((d) => ({ id: d.id, title: d.title ?? `#${d.id}` })),
    apps: ((apps ?? []) as { id: number; title: string | null; purpose: string | null }[]).map((a) => ({ id: a.id, title: a.title ?? `#${a.id}`, checked: linkedApps.has(a.id), hint: a.purpose })),
    newDocumentHref: `/administrative/portal-documents/new?project_id=${projectId}`,
  };
}
