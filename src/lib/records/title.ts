import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { Values } from "@/lib/rules/evaluate";
import type { TableDef } from "@/registry/types";
import { joinTitleParts } from "./title-format";

/**
 * Build a record's display title from its table's formula, e.g. "{first_name} {last_name}"
 * or "{project_id} – {type} – {status}" (SPEC §9.1 Q1). Lookups show the linked record's
 * title, dropdowns their label, dates m/d/yyyy. Empty parts and their separators are dropped.
 */
export async function buildTitle(t: TableDef, values: Values, id: number | null, db: SupabaseClient): Promise<string | null> {
  if (!t.titleFormula) return (values.title as string | null) ?? null;
  const fields = new Map(t.fields.map((f) => [f.name, f]));

  const parts = await Promise.all(
    t.titleFormula.split(/(\{\w+\})/).map(async (piece) => {
      const m = piece.match(/^\{(\w+)\}$/);
      if (!m) return { text: piece, token: false };
      const name = m[1];
      if (name === "id") return { text: id ? String(id) : "", token: true };
      const f = fields.get(name);
      const v = values[name];
      if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return { text: "", token: true };
      if (f?.type === "lookup" && f.lookup) {
        const ids = (Array.isArray(v) ? v : [v]).filter((x) => typeof x === "number");
        if (!ids.length) return { text: "", token: true };
        const { data } = await db.from(f.lookup.table).select("id,title").in("id", ids);
        return { text: ((data ?? []) as { title: string | null }[]).map((r) => r.title).filter(Boolean).join(", "), token: true };
      }
      if (f?.options) return { text: f.options.find((o) => o.value === v)?.label ?? String(v), token: true };
      if (f?.type === "date" || name === "date_created") return { text: formatDate(String(v)), token: true };
      if (f?.type === "datetime") return { text: formatDateTime(String(v)), token: true };
      return { text: String(v).split("\n")[0].slice(0, 60), token: true };
    }),
  );

  return joinTitleParts(parts);
}
