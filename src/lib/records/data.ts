import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { decrypt, MASK } from "@/lib/crypto";
import type { Values } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import type { FieldDef, TableDef } from "@/registry/types";
import { isRowField } from "./values";
import { fromDateTimeLocalET } from "@/lib/dates";

import { readableTable } from "@/lib/auth/office";
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
    (f.listColumn ? 100 : 0) +
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

/** Dropdown fields offered as quick filters on the list, plus Yes/No columns marked `listColumn` (Job Reports › Pending items). */
export function filterFields(t: TableDef): FieldDef[] {
  return listFields(t).filter((f) => f.type === "select" || f.type === "radio" || (f.type === "boolean" && f.listColumn));
}

/** A lookup whose picker depends on another field of the form ("same project as this report") cannot stand alone as a list filter. */
const dependsOnForm = (f: FieldDef) => Object.values(f.lookup?.filter ?? {}).some((v) => typeof v === "object" && !Array.isArray(v) && "sameAs" in v);

/**
 * Every field a list can be filtered by (SPEC §9.1 J-p, Jessica 2026-10-21): the quick filters first, then the
 * table's other dropdowns, Yes/No fields, linked records (single, and multi-links such as a report's Team) and
 * dates as a from / to range. Fields that only a rule shows, or that are kept off the form, stay out.
 */
export function listFilterFields(t: TableDef): FieldDef[] {
  const quick = filterFields(t);
  const taken = new Set(quick.map((f) => f.name));
  const ok = (f: FieldDef) =>
    !f.hidden && !f.sensitive && !f.startsHidden && !f.createOnly && (!f.formHidden || f.listColumn) && f.name !== "title" && !(t.parent && f.name === t.parent.field) &&
    ((isRowField(f) && (["select", "radio", "boolean", "date", "datetime"].includes(f.type) || (f.type === "lookup" && !!f.lookup && !dependsOnForm(f)))) ||
      (f.type === "lookup" && !!f.multiple && !!f.lookup && !dependsOnForm(f)));
  return [...quick, ...t.fields.filter((f) => ok(f) && !taken.has(f.name))];
}

/** The day after a yyyy-mm-dd date. */
const nextDay = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

export async function listRecords(t: TableDef, p: ListParams) {
  const db = await recordsDb();
  const page = Math.max(1, p.page ?? 1);
  const sortable = new Set(["title", "updated_at", "created_at", ...listFields(t).map((f) => f.name)]);
  const sort = p.sort && sortable.has(p.sort) ? p.sort : "updated_at";
  const cols = ["id", "title", "updated_at", "locked", "archived_at", ...listFields(t).map((f) => f.name)];

  // The row count is exact while a list is filtered or searched (it decides the page count); an
  // unfiltered big list (Visits: ~18,000 rows, 0.5 s to count under RLS) takes the planner's
  // estimate once past PostgREST's exact limit, which may put the last page one off (Fred 2026-10-20).
  const filtered = Boolean(p.q?.trim()) || Object.values(p.filter ?? {}).some(Boolean) || Boolean(p.archived);
  let query = db
    .from(t.name)
    .select([...new Set(cols)].join(","), { count: filtered ? "exact" : "estimated" })
    .is("deleted_at", null)
    .order(sort, { ascending: (p.dir ?? (sort === "title" ? "asc" : "desc")) === "asc", nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  query = p.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (p.q?.trim()) query = query.or(await searchClause(db, t, p.q.trim()));
  // Filters (J-p): dropdowns, Yes/No and linked records as equals; dates as "<field>.from" / "<field>.to" (Eastern
  // days); a multi-link (Team) through its join table. "Records linked to X" from the Related panel use the same keys.
  const byName = new Map(t.fields.map((f) => [f.name, f]));
  let nothingLinked = false;
  for (const [k, v] of Object.entries(p.filter ?? {})) {
    if (!v) continue;
    const range = /^(.+).(from|to)$/.exec(k);
    const f = byName.get(range ? range[1] : k);
    if (!f) continue;
    if (range) {
      if (!["date", "datetime"].includes(f.type) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
      if (range[2] === "from") query = query.gte(f.name, f.type === "date" ? v : fromDateTimeLocalET(`${v}T00:00`));
      else query = f.type === "date" ? query.lte(f.name, v) : query.lt(f.name, fromDateTimeLocalET(`${nextDay(v)}T00:00`));
    } else if (f.type === "lookup" && !f.multiple && v === "__none") query = query.is(k, null); // SV-b: "Surveys without a project"
    else if (["select", "radio"].includes(f.type) || (f.type === "lookup" && !f.multiple)) query = query.eq(k, v);
    else if (f.type === "boolean") query = query.eq(k, v === "true");
    else if (f.type === "lookup" && f.multiple && /^\d+$/.test(v)) {
      const { data: links } = await db.from(`${t.name}_${f.name.replace(/_ids$/, "")}`).select("record_id").eq("target_id", Number(v)).limit(2000);
      const ids = ((links ?? []) as { record_id: number }[]).map((r) => r.record_id);
      if (ids.length) query = query.in("id", ids);
      else nothingLinked = true;
    }
  }
  if (nothingLinked) return { rows: [] as Row[], count: 0, page, sort, pages: 1 };

  const { data, count, error } = await query;
  if (error) throw new Error(`${t.label}: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];
  return { rows, count: count ?? 0, page, sort, pages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}

const TEXT_TYPES = new Set(["text", "textarea", "richtext", "email", "phone", "url"]);

/**
 * The list search (Fred 2026-10-04, Inventory Checkout "search bar is only for name"): the name,
 * every plain text field of the record (e.g. Equipment), and the names of the records it points at
 * (Project, Technician, Product…). Sensitive fields are never searched.
 */
async function searchClause(db: SupabaseClient, t: TableDef, q: string): Promise<string> {
  const safe = q.replace(/[%_]/g, "\\$&").replace(/["\\,()]/g, " ").trim();
  const like = `ilike."%${safe}%"`;
  const parts = [`title.${like}`];
  for (const f of t.fields) if (isRowField(f) && TEXT_TYPES.has(f.type) && !f.sensitive) parts.push(`${f.name}.${like}`);
  const lookups = t.fields.filter((f) => f.type === "lookup" && !f.multiple && f.lookup && isRowField(f));
  const hits = await Promise.all(lookups.map((f) => db.from(readableTable(f.lookup!.table)).select("id").ilike("title", `%${safe}%`).is("deleted_at", null).limit(300)));
  lookups.forEach((f, i) => {
    const ids = ((hits[i].data ?? []) as { id: number }[]).map((r) => r.id);
    if (ids.length) parts.push(`${f.name}.in.(${ids.join(",")})`);
  });
  return parts.join(",");
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
      .filter((f) => f.type === "lookup" && f.lookup)
      .map(async (f) => {
        const ids = [...new Set(rows.flatMap((r) => r[f.name]).filter((v): v is number => typeof v === "number"))];
        out[f.name] = new Map();
        if (!ids.length) return;
        // Employee and vehicle names are visible to everyone (name views); the tables keep their own permissions.
        const { data } = await db.from(readableTable(f.lookup!.table)).select("id,title").in("id", ids);
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
 * may modify the record; everyone else sees a mask. Fields marked `shownInClear` (project
 * credentials, report logins, SPEC §9.1 F17-c) are decrypted for anyone who can open the record.
 */
export function rowValues(t: TableDef, row: Row, perms: ReadonlySet<string>): Values {
  const canSeeSensitive = canDo(perms, t, "modify", getTable);
  const v: Values = {};
  for (const f of t.fields) {
    if (!isRowField(f)) continue;
    let value = row[f.name] ?? null;
    if (f.sensitive && typeof value === "string" && value) value = canSeeSensitive || f.shownInClear ? decrypt(value) : MASK;
    if (f.type === "money" && typeof value === "string") value = Number(value);
    v[f.name] = value;
  }
  return v;
}
