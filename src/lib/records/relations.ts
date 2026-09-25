import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Values } from "@/lib/rules/evaluate";
import type { FieldDef, TableDef } from "@/registry/types";
import { isMultiLookup, isUpload, type FileItem } from "./values";

export const BUCKET = "attachments";
const SIGNED_URL_SECONDS = 60 * 60;

/** Link table for a many-to-many field, e.g. job_reports.team_ids → job_reports_team (see M4 schema). */
export const joinTable = (t: TableDef, f: FieldDef) => `${t.name}_${f.name.replace(/_ids$/, "")}`;

/** Ids linked through each many-to-many field of a record. */
export async function loadJoins(db: SupabaseClient, t: TableDef, id: number): Promise<Values> {
  const out: Values = {};
  await Promise.all(
    t.fields.filter(isMultiLookup).map(async (f) => {
      const { data } = await db.from(joinTable(t, f)).select("target_id").eq("record_id", id);
      out[f.name] = ((data ?? []) as { target_id: number }[]).map((r) => r.target_id);
    }),
  );
  return out;
}

/** Make the link table match `ids` (adds new links, removes dropped ones). */
export async function syncJoin(db: SupabaseClient, t: TableDef, f: FieldDef, id: number, ids: number[]) {
  const table = joinTable(t, f);
  const { data } = await db.from(table).select("target_id").eq("record_id", id);
  const have = new Set(((data ?? []) as { target_id: number }[]).map((r) => r.target_id));
  const want = new Set(ids);
  const add = [...want].filter((x) => !have.has(x));
  const remove = [...have].filter((x) => !want.has(x));
  if (add.length) {
    const { error } = await db.from(table).insert(add.map((target_id) => ({ record_id: id, target_id })));
    if (error) throw new Error(`${f.label}: ${error.message}`);
  }
  if (remove.length) {
    const { error } = await db.from(table).delete().eq("record_id", id).in("target_id", remove);
    if (error) throw new Error(`${f.label}: ${error.message}`);
  }
}

type AttachmentRow = { id: string; field: string | null; provider_path: string; file_name: string; mime_type: string | null; size_bytes: number | null };

/** Attachments of a record grouped by upload field, with short-lived signed URLs for viewing. */
export async function loadAttachments(db: SupabaseClient, t: TableDef, id: number): Promise<Record<string, FileItem[]>> {
  const uploadFields = t.fields.filter(isUpload).map((f) => f.name);
  const out: Record<string, FileItem[]> = Object.fromEntries(uploadFields.map((n) => [n, []]));
  if (!uploadFields.length) return out;

  const { data } = await db
    .from("attachments")
    .select("id, field, provider_path, file_name, mime_type, size_bytes")
    .eq("table_name", t.name)
    .eq("record_id", id)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  const rows = (data ?? []) as AttachmentRow[];
  const urls = await signedUrls(db, rows.map((r) => r.provider_path));
  for (const r of rows) {
    if (!r.field || !out[r.field]) continue;
    out[r.field].push({ id: r.id, path: r.provider_path, name: r.file_name, mime: r.mime_type, size: r.size_bytes, url: urls.get(r.provider_path) });
  }
  return out;
}

export async function signedUrls(db: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!paths.length) return map;
  const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  for (const s of data ?? []) if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
  return map;
}

/**
 * Make a field's attachments match `files`: new uploads (no id) become attachment rows,
 * removed ones are soft-deleted. Only paths this user uploaded for this table/field are accepted.
 */
export async function syncAttachments(db: SupabaseClient, t: TableDef, f: FieldDef, id: number, files: FileItem[], userId: string) {
  const { data } = await db
    .from("attachments")
    .select("id")
    .eq("table_name", t.name)
    .eq("record_id", id)
    .eq("field", f.name)
    .is("deleted_at", null);
  const have = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  const keep = new Set(files.filter((x) => x.id).map((x) => x.id!));

  const remove = [...have].filter((x) => !keep.has(x));
  if (remove.length) {
    const { error } = await db.from("attachments").update({ deleted_at: new Date().toISOString() }).in("id", remove);
    if (error) throw new Error(`${f.label}: ${error.message}`);
  }

  const fresh = files.filter((x) => !x.id);
  for (const x of fresh) {
    // Paths are <table>/<scope>/<field>/<uploader id>/<file> (see createUploadAction): only your own uploads can be attached.
    const [table, , field, uploader] = x.path.split("/");
    if (table !== t.name || field !== f.name || uploader !== userId) throw new Error(`${f.label}: unexpected file location`);
  }
  if (fresh.length) {
    const { error } = await db.from("attachments").insert(
      fresh.map((x, i) => ({
        table_name: t.name,
        record_id: id,
        field: f.name,
        provider: "supabase",
        provider_path: x.path,
        file_name: x.name.slice(0, 200),
        mime_type: x.mime,
        size_bytes: x.size,
        sort_order: have.size + i,
        created_by: userId,
      })),
    );
    if (error) throw new Error(`${f.label}: ${error.message}`);
  }
}

/** Titles for everything a form shows by id: lookups (single + many), users and groups. */
export async function displayNames(db: SupabaseClient, t: TableDef, values: Values): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  await Promise.all(
    t.fields.map(async (f) => {
      const raw = values[f.name];
      const ids = (Array.isArray(raw) ? raw : [raw]).filter((v) => v !== null && v !== undefined && v !== "");
      if (!ids.length) return;
      if (f.type === "lookup" && f.lookup) {
        const { data } = await db.from(f.lookup.table).select("id,title").in("id", ids);
        out[f.name] = Object.fromEntries(((data ?? []) as { id: number; title: string | null }[]).map((r) => [String(r.id), r.title ?? `#${r.id}`]));
      } else if (f.type === "user") {
        const { data } = await db.from("profiles").select("id,first_name,last_name,email").in("id", ids);
        out[f.name] = Object.fromEntries(
          ((data ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string }[]).map((p) => [
            p.id,
            [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email,
          ]),
        );
      } else if (f.type === "group") {
        const { data } = await db.from("groups").select("id,name").in("id", ids);
        out[f.name] = Object.fromEntries(((data ?? []) as { id: number; name: string }[]).map((g) => [String(g.id), g.name]));
      }
    }),
  );
  return out;
}
