import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { decrypt, MASK } from "@/lib/crypto";
import type { Values } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import type { FieldDef, TableDef } from "@/registry/types";
import { isRowField } from "./values";

export type Row = Record<string, unknown> & { id: number; title: string | null };

/** Record tables are chosen at runtime, so use an untyped client for them (RLS still applies). */
export async function recordsDb(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

export const PAGE_SIZE = 50;

export type ListParams = { q?: string; sort?: string; dir?: "asc" | "desc"; page?: number; archived?: boolean; filter?: Record<string, string> };

/**
 * Columns shown in a list: up to four fields that best describe a record —
 * statuses and other dropdowns first, then required fields, dates and contact details.
 */
export function listFields(t: TableDef): FieldDef[] {
  const inTitle = new Set([...(t.titleFormula ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
  const score = (f: FieldDef) =>
    (f.name.includes("status") ? 5 : 0) +
    (f.type === "select" || f.type === "radio" ? 3 : 0) +
    (f.required ? 2 : 0) +
    (["date", "phone", "email", "lookup", "money"].includes(f.type) ? 1 : 0);
  return t.fields
    .filter(
      (f) =>
        !f.hidden &&
        !f.sensitive &&
        f.name !== "title" &&
        !inTitle.has(f.name) &&
        isRowField(f) &&
        !(t.parent && f.name === t.parent.field) &&
        ["select", "radio", "date", "datetime", "phone", "email", "money", "number", "boolean", "lookup", "user", "text"].includes(f.type) &&
        !(f.type === "text" && (f.maxLength ?? 100) > 60),
    )
    .map((f, i) => ({ f, i }))
    .sort((a, b) => score(b.f) - score(a.f) || a.i - b.i)
    .slice(0, 4)
    .map(({ f }) => f);
}

/** Dropdown fields offered as quick filters on the list. */
export function filterFields(t: TableDef): FieldDef[] {
  return listFields(t).filter((f) => f.type === "select" || f.type === "radio");
}

export async function listRecords(t: TableDef, p: ListParams) {
  const db = await recordsDb();
  const page = Math.max(1, p.page ?? 1);
  const sortable = new Set(["title", "updated_at", "created_at", ...listFields(t).map((f) => f.name)]);
  const sort = p.sort && sortable.has(p.sort) ? p.sort : "updated_at";
  const cols = ["id", "title", "updated_at", "locked", "archived_at", ...listFields(t).map((f) => f.name)];

  let query = db
    .from(t.name)
    .select([...new Set(cols)].join(","), { count: "exact" })
    .is("deleted_at", null)
    .order(sort, { ascending: (p.dir ?? (sort === "title" ? "asc" : "desc")) === "asc", nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  query = p.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (p.q?.trim()) query = query.ilike("title", `%${p.q.trim().replace(/[%_]/g, "\\$&")}%`);
  // Quick filters (dropdowns) and "records linked to X" filters from the Related panel.
  const filterable = new Set(t.fields.filter((f) => ["select", "radio"].includes(f.type) || (f.type === "lookup" && !f.multiple)).map((f) => f.name));
  for (const [k, v] of Object.entries(p.filter ?? {})) if (v && filterable.has(k)) query = query.eq(k, v);

  const { data, count, error } = await query;
  if (error) throw new Error(`${t.label}: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];
  return { rows, count: count ?? 0, page, sort, pages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}

/** Deleted records of a table, newest first (Deleted Items page). */
export async function listDeleted(t: TableDef) {
  const db = await recordsDb();
  const { data, error } = await db.from(t.name).select("id,title,deleted_at,updated_by").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(200);
  if (error) throw new Error(`${t.label}: ${error.message}`);
  return (data ?? []) as { id: number; title: string | null; deleted_at: string; updated_by: string | null }[];
}

export async function getRecord(t: TableDef, id: number): Promise<Row | null> {
  const db = await recordsDb();
  const { data, error } = await db.from(t.name).select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`${t.label}: ${error.message}`);
  return (data as Row | null) ?? null;
}

/** Display titles for lookup values in `rows`: field name → (id → title). */
export async function lookupTitles(t: TableDef, rows: Record<string, unknown>[], fields: FieldDef[] = t.fields) {
  const db = await recordsDb();
  const out: Record<string, Map<number, string>> = {};
  await Promise.all(
    fields
      .filter((f) => f.type === "lookup" && f.lookup && !f.multiple)
      .map(async (f) => {
        const ids = [...new Set(rows.map((r) => r[f.name]).filter((v): v is number => typeof v === "number"))];
        out[f.name] = new Map();
        if (!ids.length) return;
        const { data } = await db.from(f.lookup!.table).select("id,title").in("id", ids);
        for (const r of (data ?? []) as { id: number; title: string | null }[]) out[f.name].set(r.id, r.title ?? `#${r.id}`);
      }),
  );
  return out;
}

/** Names of users referenced by user fields and created_by/updated_by. */
export async function userNames(rows: Record<string, unknown>[], fields: string[]) {
  const ids = [...new Set(rows.flatMap((r) => fields.map((f) => r[f])).filter((v): v is string => typeof v === "string"))];
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const db = await recordsDb();
  const { data } = await db.from("profiles").select("id,first_name,last_name,email").in("id", ids);
  for (const p of (data ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string }[]) {
    names.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email);
  }
  return names;
}

/**
 * Row → form/display values. Sensitive fields are decrypted only for people who
 * may modify the record; everyone else sees a mask.
 */
export function rowValues(t: TableDef, row: Row, perms: ReadonlySet<string>): Values {
  const canSeeSensitive = canDo(perms, t, "modify", getTable);
  const v: Values = {};
  for (const f of t.fields) {
    if (!isRowField(f)) continue;
    let value = row[f.name] ?? null;
    if (f.sensitive && typeof value === "string" && value) value = canSeeSensitive ? decrypt(value) : MASK;
    if (f.type === "money" && typeof value === "string") value = Number(value);
    v[f.name] = value;
  }
  return v;
}
