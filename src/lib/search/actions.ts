"use server";

import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { getTable, REGISTRY } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { recordHref, tableHref } from "@/registry/routes";
import type { TableDef } from "@/registry/types";
import { matchLine, orFilters, searchColumns, searchWords, selectColumns } from "./query";

export type SearchHit = {
  href: string;
  title: string;
  line?: string;
  archived: boolean;
};
export type SearchGroup = {
  table: string;
  label: string;
  icon: string;
  href?: string;
  hits: SearchHit[];
};

const PER_TABLE = 5;

/** The page a record opens on: its own, or its parent's for sub-grid rows (e.g. a line on a transaction). */
function pageOf(t: TableDef): TableDef | undefined {
  if (t.parent) return pageOf(getTable(t.parent.table));
  return t.tab || t.module === "utility" ? t : undefined;
}

/**
 * Top-bar search: every record type the person may open, matched on the title, text, contact and
 * address fields (every typed word must match). Runs as the person, so RLS limits rows as usual.
 */
export async function globalSearchAction(q: string): Promise<SearchGroup[]> {
  const user = await requireUser();
  const words = searchWords(q);
  if (!words.length || words.join("").length < 2) return [];
  const db = await recordsDb();
  const tables = REGISTRY.filter((t) => pageOf(t) && canOpen(user.permissions, t, getTable));

  const groups = await Promise.all(
    tables.map(async (t): Promise<SearchGroup | null> => {
      const cols = searchColumns(t);
      let query = db.from(t.name).select(selectColumns(t, cols)).is("deleted_at", null);
      for (const f of orFilters(cols, words)) query = query.or(f);
      const { data, error } = await query.order("archived_at", { ascending: false, nullsFirst: true }).order("updated_at", { ascending: false }).limit(PER_TABLE);
      if (error || !data?.length) return null;
      const page = pageOf(t)!;
      const rows = data as unknown as Record<string, unknown>[];
      return {
        table: t.name,
        label: t.label,
        icon: page.tab ?? page.name.replace(/_/g, "-"),
        href: t.parent ? undefined : `${tableHref(page)}?q=${encodeURIComponent(q.trim())}`,
        hits: rows.map((r) => ({
          href: t.parent ? recordHref(page, String(r[t.parent.field])) : recordHref(t, Number(r.id)),
          title: String(r.title ?? "") || `${t.itemLabel} ${r.id}`,
          line: matchLine(r, cols, words),
          archived: Boolean(r.archived_at),
        })),
      };
    }),
  );
  return groups.filter((g): g is SearchGroup => g !== null);
}
