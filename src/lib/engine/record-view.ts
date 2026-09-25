import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate, formatDateTime } from "@/lib/dates";
import { joinTable } from "@/lib/records/relations";
import { isMultiLookup, isUpload } from "@/lib/records/values";
import { evaluateRules, type Values } from "@/lib/rules/evaluate";
import type { FieldDef, TableDef } from "@/registry/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export type EngineRecord = {
  id: number;
  /** Stored values, plus many-to-many ids, computed totals and attachment paths by field. Sensitive fields are removed. */
  values: Values;
  files: Record<string, { path: string; name: string; mime: string | null; size: number | null }[]>;
  title: string | null;
  deleted: boolean;
};

/** Load a record for automations (service role: no row-level security, so callers must decide what to expose). */
export async function loadEngineRecord(db: SupabaseClient, t: TableDef, id: number): Promise<EngineRecord | null> {
  const { data } = await db.from(t.name).select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const values: Values = { ...row };
  for (const f of t.fields) if (f.sensitive) delete values[f.name];

  await Promise.all(
    t.fields.filter(isMultiLookup).map(async (f) => {
      const { data: links } = await db.from(joinTable(t, f)).select("target_id").eq("record_id", id);
      values[f.name] = ((links ?? []) as { target_id: number }[]).map((l) => l.target_id);
    }),
  );

  // Projects › Approved / Invoiced / Paid (only "Apply to Project" transactions, SPEC §9.1 M7-b).
  if (t.fields.some((f) => f.type === "computed")) {
    const { data: tx } = await db.from("transactions").select("type, amount").eq("project_id", id).eq("payment_type", "Apply to Project").is("deleted_at", null);
    const sum = (type: string) => ((tx ?? []) as { type: string; amount: number }[]).filter((x) => x.type === type).reduce((n, x) => n + Number(x.amount ?? 0), 0);
    for (const f of t.fields.filter((x) => x.computed)) values[f.name] = sum(f.computed!.where.type);
  }

  const files: EngineRecord["files"] = {};
  if (t.fields.some(isUpload)) {
    const { data: att } = await db
      .from("attachments")
      .select("field, provider_path, file_name, mime_type, size_bytes")
      .eq("table_name", t.name)
      .eq("record_id", id)
      .is("deleted_at", null)
      .not("field", "is", null)
      .order("sort_order");
    for (const a of (att ?? []) as { field: string; provider_path: string; file_name: string; mime_type: string | null; size_bytes: number | null }[]) {
      (files[a.field] ??= []).push({ path: a.provider_path, name: a.file_name, mime: a.mime_type, size: a.size_bytes });
    }
  }
  return { id, values, files, title: (row.title as string | null) ?? null, deleted: Boolean(row.deleted_at) };
}

const PAGE = 1000; // PostgREST's default row cap

/** Every row of a query, page by page. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/**
 * Values of every live, unarchived record of a table in a few queries (scheduled checks).
 * Enough to test conditions; files are not loaded, so matches are reloaded in full before running actions.
 */
export async function loadConditionValues(db: SupabaseClient, t: TableDef): Promise<{ id: number; values: Values }[]> {
  const rows = await fetchAll<Record<string, unknown>>((a, b) => db.from(t.name).select("*").is("deleted_at", null).is("archived_at", null).order("id").range(a, b));
  const byId = new Map(rows.map((r) => [r.id as number, { ...r } as Values]));
  for (const f of t.fields.filter((x) => x.sensitive)) for (const v of byId.values()) delete v[f.name];

  for (const f of t.fields.filter(isMultiLookup)) {
    for (const v of byId.values()) v[f.name] = [];
    const links = await fetchAll<{ record_id: number; target_id: number }>((a, b) => db.from(joinTable(t, f)).select("record_id, target_id").order("record_id").range(a, b));
    for (const l of links) (byId.get(l.record_id)?.[f.name] as number[] | undefined)?.push(l.target_id);
  }

  const computed = t.fields.filter((x) => x.computed);
  if (computed.length) {
    for (const v of byId.values()) for (const f of computed) v[f.name] = 0;
    const tx = await fetchAll<{ project_id: number; type: string; amount: number }>((a, b) =>
      db.from("transactions").select("id, project_id, type, amount").eq("payment_type", "Apply to Project").is("deleted_at", null).not("project_id", "is", null).order("id").range(a, b),
    );
    for (const x of tx) {
      const v = byId.get(x.project_id);
      if (!v) continue;
      for (const f of computed.filter((c) => c.computed!.where.type === x.type)) v[f.name] = Number(v[f.name]) + Number(x.amount ?? 0);
    }
  }
  return [...byId.entries()].map(([id, values]) => ({ id, values }));
}

/** Human-readable value of every field (for email cards, PDFs and subject tokens). */
export async function displayStrings(db: SupabaseClient, t: TableDef, rec: EngineRecord): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const titles = async (table: string, ids: unknown[], col = "title") => {
    const clean = ids.filter((x) => x !== null && x !== undefined);
    if (!clean.length) return new Map<string, string>();
    const { data } = await db.from(table).select(`id,${col}`).in("id", clean);
    return new Map(((data ?? []) as unknown as Record<string, unknown>[]).map((r) => [String(r.id), String(r[col] ?? `#${r.id}`)]));
  };

  await Promise.all(
    t.fields.map(async (f: FieldDef) => {
      const v = rec.values[f.name];
      if (isUpload(f)) {
        const n = rec.files[f.name]?.length ?? 0;
        out[f.name] = n ? `${n} file${n > 1 ? "s" : ""}` : "";
        return;
      }
      if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) {
        out[f.name] = f.type === "computed" ? money.format(0) : "";
        return;
      }
      switch (f.type) {
        case "lookup": {
          const ids = Array.isArray(v) ? v : [v];
          const m = await titles(f.lookup!.table, ids);
          out[f.name] = ids.map((x) => m.get(String(x)) ?? `#${x}`).join(", ");
          return;
        }
        case "group": {
          const m = await titles("groups", v as unknown[], "name");
          out[f.name] = (v as unknown[]).map((x) => m.get(String(x)) ?? `#${x}`).join(", ");
          return;
        }
        case "user": {
          const { data } = await db.from("profiles").select("first_name,last_name,email").eq("id", v).maybeSingle();
          const p = data as { first_name: string | null; last_name: string | null; email: string } | null;
          out[f.name] = p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email : "";
          return;
        }
        case "select":
        case "radio":
          out[f.name] = f.options?.find((o) => o.value === v)?.label ?? String(v);
          return;
        case "checkboxes":
          out[f.name] = (v as string[]).map((x) => f.options?.find((o) => o.value === x)?.label ?? x).join(", ");
          return;
        case "boolean":
          out[f.name] = v ? "Yes" : "No";
          return;
        case "date":
          out[f.name] = formatDate(String(v));
          return;
        case "datetime":
          out[f.name] = formatDateTime(String(v));
          return;
        case "money":
        case "computed":
          out[f.name] = money.format(Number(v));
          return;
        case "address": {
          const a = v as Record<string, string>;
          out[f.name] = [a.street, a.address_2, [a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");
          return;
        }
        case "richtext":
          out[f.name] = String(v).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          return;
        default:
          out[f.name] = String(v);
      }
    }),
  );
  return out;
}

/** Fields worth showing in an email card or PDF: visible under the record's rules, not sensitive, not empty. */
export function cardFields(t: TableDef, rec: EngineRecord, display: Record<string, string>): { label: string; value: string; heading?: string }[] {
  const { visible } = evaluateRules(t, rec.values);
  return t.fields
    .filter((f) => visible.has(f.name) && !f.sensitive && !(t.parent && f.name === t.parent.field) && display[f.name])
    .map((f) => ({ label: f.label, value: display[f.name], heading: f.heading }));
}
