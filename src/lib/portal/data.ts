import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, isEncrypted } from "@/lib/crypto";
import type { Address } from "@/lib/records/values";

// Customer portal (F6) reads. Everything comes from the portal_* views: each view's WHERE is the whole access
// rule (the customer's Contact must be on portal_access for the project), so nothing else is ever selected.

export type PortalProject = {
  id: number;
  title: string | null;
  job_status: string | null;
  type: string | null;
  job_address: Address | null;
  apartment_or_unit: string | null;
  start_date: string | null;
  system_credentials: string | null;
  systems: string[];
  maintenance_plan: boolean;
  maintenance_type: string | null;
  maintenance_status: string | null;
  maintenance_purchase_date: string | null;
  maintenance_amount: number | null;
  maintenance_expires_on: string | null;
  maintenance_visits_included: number | null;
  maintenance_includes: string | null;
  approved_amount: number;
  invoiced_amount: number;
  paid_amount: number;
  maintenance_visits_used: number;
};

export type PortalVisit = {
  id: number;
  project_id: number;
  starts_at: string;
  duration: number | null;
  arrival_window: string | null;
  service_type: string | null;
  status: string;
  billing: string | null;
  on_way_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  maintenance_visit: boolean;
  technician_first_name: string | null;
};

export type PortalTransaction = { id: number; project_id: number; type: string; amount: number | null; date: string | null; description: string | null; portal_number: string | null };
export type PortalDocument = { id: number; title: string | null; category: string | null; notes: string | null; created_at: string; project_id: number };
export type PortalApp = { id: number; title: string | null; purpose: string | null; ios_url: string | null; android_url: string | null; web_url: string | null; project_id: number };
export type PortalRequest = { id: number; project_id: number; kind: string | null; description: string | null; status: string; visit_id: number | null; created_at: string };
export type PortalFile = { id: string; table_name: string; record_id: number; field: string | null; file_name: string; mime_type: string | null; size_bytes: number | null };

const PROJECT_COLUMNS =
  "id, title, job_status, type, job_address, apartment_or_unit, start_date, system_credentials, systems, maintenance_plan, maintenance_type, maintenance_status, maintenance_purchase_date, maintenance_amount, maintenance_expires_on, maintenance_visits_included, maintenance_includes, approved_amount, invoiced_amount, paid_amount, maintenance_visits_used";

function withCredentials(p: PortalProject): PortalProject {
  // Encrypted at rest (SPEC §6); the customer sees their own passwords in clear once signed in (Fred 2026-10-10).
  const v = p.system_credentials;
  return { ...p, system_credentials: v && isEncrypted(v) ? decrypt(v) : v, systems: p.systems ?? [] };
}

export async function myProjects(db: SupabaseClient): Promise<PortalProject[]> {
  const { data, error } = await db.from("portal_projects").select(PROJECT_COLUMNS).order("start_date", { ascending: false, nullsFirst: false }).order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as PortalProject[]).map(withCredentials);
}

export async function myProject(db: SupabaseClient, id: number): Promise<PortalProject | null> {
  const { data, error } = await db.from("portal_projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? withCredentials(data as unknown as PortalProject) : null;
}

export async function projectVisits(db: SupabaseClient, projectId: number): Promise<PortalVisit[]> {
  const { data, error } = await db.from("portal_visits").select("*").eq("project_id", projectId).order("starts_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PortalVisit[];
}

export async function projectTransactions(db: SupabaseClient, projectId: number): Promise<PortalTransaction[]> {
  const { data, error } = await db.from("portal_transactions").select("*").eq("project_id", projectId).order("date", { ascending: false, nullsFirst: false }).order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PortalTransaction[];
}

export async function projectDocuments(db: SupabaseClient, projectId: number): Promise<PortalDocument[]> {
  const { data, error } = await db.from("portal_my_documents").select("*").eq("project_id", projectId).order("category").order("title");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PortalDocument[];
}

export async function projectApps(db: SupabaseClient, projectId: number): Promise<PortalApp[]> {
  const { data, error } = await db.from("portal_my_apps").select("*").eq("project_id", projectId).order("title");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PortalApp[];
}

export async function projectRequests(db: SupabaseClient, projectId: number): Promise<PortalRequest[]> {
  const { data, error } = await db.from("service_requests").select("id, project_id, kind, description, status, visit_id, created_at").eq("project_id", projectId).is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PortalRequest[];
}

/** Files the customer may open, for a set of records (documents, transactions' PDFs, their requests' media). */
export async function filesFor(db: SupabaseClient, table: "portal_documents" | "transactions" | "service_requests", recordIds: number[]): Promise<Map<number, PortalFile[]>> {
  const out = new Map<number, PortalFile[]>();
  if (!recordIds.length) return out;
  const { data, error } = await db.from("portal_files").select("id, table_name, record_id, field, file_name, mime_type, size_bytes").eq("table_name", table).in("record_id", recordIds);
  if (error) throw new Error(error.message);
  for (const f of (data ?? []) as unknown as PortalFile[]) out.set(f.record_id, [...(out.get(f.record_id) ?? []), f]);
  return out;
}

/** Portal link that opens one of the customer's files (checked again by the route). */
export const portalFileHref = (id: string) => `/portal/file/${id}`;
