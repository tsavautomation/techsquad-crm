import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REGISTRY, getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import type { TableDef } from "@/registry/types";
import { createClient } from "@/lib/supabase/server";
import { listFields, recordsDb, userNames, type Row } from "./data";
import { joinTable, signedUrls } from "./relations";
import type { FileItem } from "./values";

// ---------------------------------------------------------------- module-level permissions (SPEC §7.4)

export type ModuleAction =
  | "activity_history_view"
  | "activity_history_add"
  | "notes_allow_delete"
  | "notes_allow_delete_of_my_notes"
  | "files_view_files_pod"
  | "files_add_new"
  | "files_allow_delete"
  | "audit_log"
  | "deleted_items";

/** Module permission keys that exist in the catalogue (a module without the key doesn't restrict the feature). */
const moduleKeys = cache(async () => {
  const db = await createClient();
  const { data } = await db.from("permissions").select("key").eq("resource", "module");
  return new Set((data ?? []).map((r) => r.key));
});

/** Mirrors app.can_module() in the database. */
export async function canModule(perms: ReadonlySet<string>, t: TableDef, action: ModuleAction) {
  const key = `${t.module}.module.${action}`;
  return !(await moduleKeys()).has(key) || perms.has(key);
}

// ---------------------------------------------------------------- notes, checklist, files pod, history

export type Note = { id: number; body: string; follow_up_date: string | null; created_at: string; created_by: string | null; author: string };
export type ChecklistItem = { id: number; item: string; due_date: string | null; completed_at: string | null; source: string | null; created_by: string | null };
export type HistoryEntry = { id: number; action: string; at: string; actor: string; changes: Record<string, [unknown, unknown]> };

export async function loadNotes(db: SupabaseClient, t: TableDef, id: number): Promise<Note[]> {
  const { data } = await db.from("record_notes").select("id, body, follow_up_date, created_at, created_by").eq("table_name", t.name).eq("record_id", id).order("created_at", { ascending: false });
  const rows = (data ?? []) as Omit<Note, "author">[];
  const names = await userNames(rows, ["created_by"]);
  return rows.map((r) => ({ ...r, author: (r.created_by && names.get(r.created_by)) || "Someone" }));
}

export async function loadChecklist(db: SupabaseClient, t: TableDef, id: number): Promise<ChecklistItem[]> {
  const { data } = await db
    .from("record_checklist_items")
    .select("id, item, due_date, completed_at, source, created_by")
    .eq("table_name", t.name)
    .eq("record_id", id)
    .order("completed_at", { ascending: true, nullsFirst: true })
    .order("created_at");
  return (data ?? []) as ChecklistItem[];
}

export async function loadPodFiles(db: SupabaseClient, t: TableDef, id: number): Promise<FileItem[]> {
  const { data } = await db
    .from("attachments")
    .select("id, provider_path, file_name, mime_type, size_bytes")
    .eq("table_name", t.name)
    .eq("record_id", id)
    .is("field", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as { id: string; provider_path: string; file_name: string; mime_type: string | null; size_bytes: number | null }[];
  const urls = await signedUrls(db, rows.map((r) => r.provider_path));
  return rows.map((r) => ({ id: r.id, path: r.provider_path, name: r.file_name, mime: r.mime_type, size: r.size_bytes, url: urls.get(r.provider_path) }));
}

export async function loadHistory(db: SupabaseClient, t: TableDef, id: number): Promise<HistoryEntry[]> {
  const { data } = await db.from("audit_log").select("id, action, at, actor, changes").eq("table_name", t.name).eq("record_id", id).order("at", { ascending: false }).limit(100);
  const rows = (data ?? []) as { id: number; action: string; at: string; actor: string | null; changes: Record<string, [unknown, unknown]> }[];
  const names = await userNames(rows, ["actor"]);
  return rows.map((r) => ({ ...r, actor: r.actor ? (names.get(r.actor) ?? "Someone") : "System" }));
}

// ---------------------------------------------------------------- related records (WebAuthor "Summary" counts)

export type Related = { table: TableDef; field: string; label: string; count: number; href: string };

/** Every record type that links to this record, with how many (visible) records link here. */
export async function loadRelated(t: TableDef, id: number, perms: ReadonlySet<string>): Promise<Related[]> {
  const db = await recordsDb();
  const refs = REGISTRY.flatMap((r) =>
    r.fields
      .filter((f) => f.type === "lookup" && f.lookup?.table === t.name && !(r.parent && r.parent.table === t.name))
      .map((f) => ({ r, f })),
  ).filter(({ r }) => (r.tab || r.module === "utility") && canOpen(perms, r, getTable));

  const results = await Promise.all(
    refs.map(async ({ r, f }) => {
      let count = 0;
      if (f.multiple) {
        const { count: c } = await db.from(joinTable(r, f)).select("record_id", { count: "exact", head: true }).eq("target_id", id);
        count = c ?? 0;
      } else {
        const { count: c } = await db.from(r.name).select("id", { count: "exact", head: true }).eq(f.name, id).is("deleted_at", null);
        count = c ?? 0;
      }
      const base = r.module === "utility" ? `/lists/${r.name.replace(/_/g, "-")}` : `/${r.module}/${r.tab}`;
      const label = refs.filter((x) => x.r === r).length > 1 ? `${r.label} (${f.label})` : r.label;
      return { table: r, field: f.name, label, count, href: `${base}?f.${f.name}=${id}` };
    }),
  );
  return results.filter((x) => x.count > 0).sort((a, b) => a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------- sub-lists (Contact › Interactions, Ticket › Support Notes)

export type SubList = { table: TableDef; rows: Row[]; canAdd: boolean; canEdit: boolean };

export async function loadSubLists(t: TableDef, id: number, perms: ReadonlySet<string>): Promise<SubList[]> {
  const db = await recordsDb();
  const children = REGISTRY.filter((c) => c.parent?.table === t.name);
  return Promise.all(
    children.map(async (c) => {
      const cols = ["id", "title", ...listFields(c).map((f) => f.name)];
      const { data } = await db.from(c.name).select([...new Set(cols)].join(",")).eq(c.parent!.field, id).is("deleted_at", null).order("created_at", { ascending: false });
      return {
        table: c,
        rows: (data ?? []) as unknown as Row[],
        canAdd: canDo(perms, c, "create", getTable),
        canEdit: canDo(perms, c, "modify", getTable),
      };
    }),
  );
}
