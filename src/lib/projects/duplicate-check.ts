import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Values } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { matchContacts, matchProjects, pairKey, projectKey, type Addr, type ContactLike, type ProjectLike } from "./dedupe";

// PJ-b items 3 and 4: the anti-duplication rule, run by saveRecord before a Project or a Contact is written
// (so it covers the forms, the Portal.io review, the sheet import and the report archive alike). A hit is
// returned to the screen with the existing records; the office may still save with a reason ("force").

export type DuplicateHit = { id: number; title: string; href: string; why: string };
export type Duplicate = {
  /** The field the message belongs to on the form. */
  field: string;
  message: string;
  /** block: the same thing exists; warn: it looks the same (the office decides). Both need a reason to go on. */
  level: "block" | "warn";
  existing: DuplicateHit[];
};
export type DuplicateCheck = { duplicate: Duplicate | null; notice?: string };

type ProjectRow = ProjectLike & { job_owner_id: number | null; building_id: number | null; merged_into_id: number | null; contacts: ContactLike | null };

/** Projects: the same owner at the same place or unit, or anyone at the same building and unit. */
export async function checkProjectDuplicate(db: SupabaseClient, id: number | null, values: Values): Promise<DuplicateCheck> {
  const ownerId = typeof values.job_owner_id === "number" ? values.job_owner_id : null;
  const buildingId = typeof values.building_id === "number" ? values.building_id : null;
  const candidate: ProjectLike = { id: id ?? 0, title: typeof values.title === "string" ? values.title : null, job_owner_id: ownerId, job_address: (values.job_address as Addr) ?? null, apartment_or_unit: typeof values.apartment_or_unit === "string" ? values.apartment_or_unit : null, building_id: buildingId };
  const [{ data: rows }, { data: buildings }, { data: owner }, { data: ignored }] = await Promise.all([
    db.from("projects").select("id, title, job_owner_id, job_address, apartment_or_unit, building_id, merged_into_id, contacts:job_owner_id(id, title, first_name, last_name, type)").is("deleted_at", null).is("merged_into_id", null).limit(5000),
    db.from("buildings").select("id, title").is("deleted_at", null).limit(2000),
    ownerId ? db.from("contacts").select("id, title, first_name, last_name, type").eq("id", ownerId).maybeSingle() : Promise.resolve({ data: null }),
    id ? db.from("project_not_duplicates").select("a, b").or(`a.eq.${id},b.eq.${id}`) : Promise.resolve({ data: [] }),
  ]);
  const buildingTitle = new Map(((buildings ?? []) as { id: number; title: string | null }[]).map((b) => [b.id, b.title]));
  const skip = new Set(((ignored ?? []) as { a: number; b: number }[]).map((p) => (p.a === id ? p.b : p.a)));
  const me = projectKey(candidate, owner as ContactLike | null, buildingId ? buildingTitle.get(buildingId) : null);
  const t = getTable("projects");
  const hits: (DuplicateHit & { strong: boolean })[] = [];
  for (const r of (rows ?? []) as unknown as ProjectRow[]) {
    if (r.id === id || skip.has(r.id)) continue;
    const m = matchProjects(me, projectKey(r, r.contacts, r.building_id ? buildingTitle.get(r.building_id) : null));
    if (m?.strong) hits.push({ id: r.id, title: r.title ?? `#${r.id}`, href: recordHref(t, r.id), why: m.why, strong: true });
  }
  if (!hits.length) return { duplicate: null };
  const sameOwner = hits.filter((h) => h.why === "Same owner, same place" || h.why.startsWith("Same person"));
  if (sameOwner.length) {
    const first = sameOwner[0];
    return { duplicate: { field: "job_owner_id", level: "block", message: `This client already has the project "${first.title}" (#${first.id})`, existing: sameOwner } };
  }
  return { duplicate: { field: "job_address", level: "warn", message: `Another owner has a project at this address and unit: "${hits[0].title}" (#${hits[0].id}). The property may have changed hands.`, existing: hits } };
}

/** Contacts: same e-mail, phone or name blocks; a near name or the same last name and initial warns; same family is a hint. */
export async function checkContactDuplicate(db: SupabaseClient, id: number | null, values: Values): Promise<DuplicateCheck> {
  const me: ContactLike = { id: id ?? 0, title: null, first_name: str(values.first_name), last_name: str(values.last_name), email: str(values.email), main_phone: str(values.main_phone) };
  if (!me.first_name && !me.last_name && !me.email && !me.main_phone) return { duplicate: null };
  const [{ data: rows }, { data: ignored }] = await Promise.all([
    db.from("contacts").select("id, title, first_name, last_name, email, main_phone").is("deleted_at", null).limit(20000),
    id ? db.from("contact_not_duplicates").select("a, b").or(`a.eq.${id},b.eq.${id}`) : Promise.resolve({ data: [] }),
  ]);
  const skip = new Set(((ignored ?? []) as { a: number; b: number }[]).map((p) => (p.a === id ? p.b : p.a)));
  const t = getTable("contacts");
  const blocks: DuplicateHit[] = [];
  const warns: DuplicateHit[] = [];
  const family: DuplicateHit[] = [];
  for (const r of (rows ?? []) as ContactLike[]) {
    if (r.id === id || skip.has(r.id)) continue;
    const m = matchContacts(me, r);
    if (!m) continue;
    const hit = { id: r.id, title: r.title ?? `#${r.id}`, href: recordHref(t, r.id), why: m.why };
    (m.level === "block" ? blocks : m.level === "warn" ? warns : family).push(hit);
  }
  if (blocks.length) return { duplicate: { field: blocks[0].why === "Same e-mail" ? "email" : blocks[0].why === "Same phone" ? "main_phone" : "last_name", level: "block", message: `${blocks[0].why}: "${blocks[0].title}" (#${blocks[0].id}) already exists`, existing: blocks } };
  if (warns.length) return { duplicate: { field: "last_name", level: "warn", message: `${warns[0].why}: "${warns[0].title}" (#${warns[0].id}). Is it the same person?`, existing: warns } };
  if (family.length) return { duplicate: null, notice: `Same last name as ${family.slice(0, 3).map((f) => `${f.title} (#${f.id})`).join(", ")}: same family?` };
  return { duplicate: null };
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export const DUPLICATE_CHECKS: Record<string, (db: SupabaseClient, id: number | null, values: Values) => Promise<DuplicateCheck>> = { projects: checkProjectDuplicate, contacts: checkContactDuplicate };

export { pairKey };
