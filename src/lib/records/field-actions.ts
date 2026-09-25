"use server";

import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth/session";
import type { Values } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import type { FieldDef, TableDef } from "@/registry/types";
import { recordsDb } from "./data";
import { canModule } from "./extras";
import { POD_FIELD } from "./values";
import { BUCKET, displayNames } from "./relations";

export type Choice = { id: string; label: string; hint?: string };

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // Supabase Free plan limit; Phase 2 sends big videos to OneDrive/Drive

function fieldOf(tableName: string, fieldName: string): { t: TableDef; f: FieldDef } {
  const t = getTable(tableName);
  const f = t.fields.find((x) => x.name === fieldName);
  if (!f) throw new Error(`Unknown field ${tableName}.${fieldName}`);
  return { t, f };
}

/**
 * Options for a lookup / user / group picker, filtered by the typed text and by the
 * field's lookup filter (e.g. Design Firm → Organizations with Type = Design Firm).
 * Row-level security still decides which records the user may see at all.
 */
export async function searchChoicesAction(tableName: string, fieldName: string, query: string, form: Values): Promise<Choice[]> {
  await requireUser();
  const { f } = fieldOf(tableName, fieldName);
  const db = await recordsDb();
  const q = query.trim().replace(/[%_,()]/g, " ").trim();

  if (f.type === "user") {
    let req = db.from("profiles").select("id,first_name,last_name,email").eq("active", true).order("first_name").limit(20);
    if (q) req = req.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
    const { data } = await req;
    return ((data ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string }[]).map((p) => ({
      id: p.id,
      label: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email,
      hint: p.email,
    }));
  }

  if (f.type === "group") {
    let req = db.from("groups").select("id,name").eq("active", true).order("name");
    if (q) req = req.ilike("name", `%${q}%`);
    const { data } = await req;
    return ((data ?? []) as { id: number; name: string }[]).map((g) => ({ id: String(g.id), label: g.name }));
  }

  if (f.type !== "lookup" || !f.lookup) return [];
  let req = db.from(f.lookup.table).select("id,title").is("deleted_at", null).is("archived_at", null).order("title").limit(20);
  if (q) req = req.ilike("title", `%${q}%`);
  for (const [col, v] of Object.entries(f.lookup.filter ?? {})) {
    if (typeof v === "string") req = req.eq(col, v);
    else if (Array.isArray(v)) req = req.in(col, v);
    else {
      const same = form[v.sameAs];
      if (same === null || same === undefined || same === "") return []; // e.g. Contact Type not chosen yet
      req = req.eq(col, same as string);
    }
  }
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: number; title: string | null }[]).map((r) => ({ id: String(r.id), label: r.title ?? `#${r.id}` }));
}

/** Values to copy into the form when a lookup is picked (SPEC §2.2 auto-fill), plus labels for copied links. */
export async function autofillAction(
  tableName: string,
  fieldName: string,
  id: number,
): Promise<{ values: Values; labels: Record<string, Record<string, string>> }> {
  await requireUser();
  const { f } = fieldOf(tableName, fieldName);
  const mapping = f.lookup?.autofill ?? [];
  if (!mapping.length) return { values: {}, labels: {} };
  const db = await recordsDb();
  const { data } = await db.from(f.lookup!.table).select(mapping.map((m) => m.from).join(",")).eq("id", id).maybeSingle();
  if (!data) return { values: {}, labels: {} };
  const src = data as unknown as Values;
  const out: Values = {};
  for (const m of mapping) {
    const v = src[m.from];
    if (f.lookup!.autofillOnlyNonEmpty && (v === null || v === undefined || v === "")) continue;
    out[m.to] = v ?? null;
  }
  // Copied lookups (e.g. Stock › Brand) need their title to show in the form.
  const { t } = fieldOf(tableName, fieldName);
  const labels = await displayNames(db, t, out);
  return { values: out, labels };
}

/**
 * A one-time upload slot for a file field. The browser uploads straight to storage
 * (never through our server — large files would hit Vercel's 4.5 MB request limit).
 * `recordId` null = a new record not saved yet.
 */
export async function createUploadAction(
  tableName: string,
  fieldName: string,
  recordId: number | null,
  file: { name: string; type: string; size: number },
): Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }> {
  const user = await requireUser();
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: `“${file.name}” is larger than 50 MB.` };
  let t: TableDef;
  let fieldSegment: string;

  if (fieldName === POD_FIELD) {
    // The record's general Files pod ("Files: Add New"), only on saved records.
    t = getTable(tableName);
    if (!recordId || !(await canModule(user.permissions, t, "files_add_new"))) return { ok: false, message: "You don't have permission to add files here." };
    fieldSegment = POD_FIELD;
  } else {
    const found = fieldOf(tableName, fieldName);
    t = found.t;
    const f = found.f;
    if (!["file", "image", "signature"].includes(f.type)) return { ok: false, message: "Not an upload field" };
    if (!canDo(user.permissions, t, recordId ? "modify" : "create", getTable)) return { ok: false, message: "You don't have permission to add files here." };
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
    if (f.fileTypes && !f.fileTypes.includes(ext)) return { ok: false, message: `Allowed file types: ${f.fileTypes.join(", ")}` };
    if (f.type === "image" && !file.type.startsWith("image/")) return { ok: false, message: "Please choose an image." };
    fieldSegment = f.name;
  }

  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const scope = recordId ? String(recordId) : `pending-${randomUUID()}`;
  const path = `${t.name}/${scope}/${fieldSegment}/${user.id}/${randomUUID()}-${safeName}`;

  const db = await recordsDb();
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: error?.message ?? "Could not prepare the upload" };
  return { ok: true, path: data.path, token: data.token };
}

/** A viewing link for a file the user just uploaded (before the record is saved). */
export async function previewUrlAction(path: string): Promise<string | null> {
  const user = await requireUser();
  if (path.split("/")[3] !== user.id) return null;
  const db = await recordsDb();
  const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
