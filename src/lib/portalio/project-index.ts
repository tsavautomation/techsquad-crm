import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectLite } from "./match";

// PI-c: every project with its owner's e-mail / phone, and which projects already carry each Portal number in a
// Transaction. No framework imports: the sync, the sheet import script and the actions all use it.

export type ProjectIndex = { projects: ProjectLite[]; txByNumber: Map<string, number[]> };

type Row = { id: number; title: string | null; job_address: ProjectLite["job_address"]; contacts: { first_name: string | null; last_name: string | null; email: string | null; main_phone: string | null } | null };

export async function loadProjectIndex(db: SupabaseClient): Promise<ProjectIndex> {
  // PU-b: paged, since PostgREST returns at most 1000 rows (1,860 numbered transactions on 2026-11-03 silently lost the rest).
  const all = async <T,>(q: (from: number, to: number) => PromiseLike<{ data: unknown }>): Promise<T[]> => {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await q(from, from + 999);
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  };
  const [pr, tx] = await Promise.all([
    all<Row>((f, t) => db.from("projects").select("id, title, job_address, job_owner_id, contacts:job_owner_id(first_name, last_name, email, main_phone)").is("deleted_at", null).order("id").range(f, t)),
    all<{ project_id: number; portal_number: string }>((f, t) => db.from("transactions").select("project_id, portal_number").eq("payment_type", "Apply to Project").is("deleted_at", null).not("portal_number", "is", null).not("project_id", "is", null).order("id").range(f, t)),
  ]);
  const projects = pr.map((p) => ({ id: p.id, title: p.title, job_address: p.job_address, owner_email: p.contacts?.email ?? null, owner_phone: p.contacts?.main_phone ?? null, owner_name: p.contacts ? [p.contacts.first_name, p.contacts.last_name].filter(Boolean).join(" ") : null }));
  const txByNumber = new Map<string, number[]>();
  for (const t of tx) {
    const k = t.portal_number.replace(/\D/g, "");
    if (!k) continue;
    txByNumber.set(k, [...(txByNumber.get(k) ?? []), t.project_id]);
  }
  return { projects, txByNumber };
}
