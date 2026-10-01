import { isRowField } from "@/lib/records/values";
import type { FieldDef, TableDef } from "@/registry/types";

// Search across every record type (top bar). Pure helpers: which columns a table is searched on,
// the PostgREST "or" filters for the typed words, and the line shown under a hit.

const TEXT_TYPES: FieldDef["type"][] = ["text", "textarea", "email", "phone", "url"];
const ADDRESS_PARTS = ["street", "address_2", "city", "zip"] as const;

export type SearchColumn = {
  field: FieldDef;
  column: string;
  part?: (typeof ADDRESS_PARTS)[number];
};

/** Typed words, cleaned of characters PostgREST filters treat specially. At most 4 words. */
export function searchWords(q: string): string[] {
  return q
    .replace(/[,()"'\\%*_:]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
    .slice(0, 4);
}

/** Columns searched for a table: the title plus every plain text, contact and address field (never sensitive ones). */
export function searchColumns(t: TableDef): SearchColumn[] {
  const out: SearchColumn[] = [];
  for (const f of t.fields) {
    if (f.sensitive || f.name === "title" || !isRowField(f)) continue;
    if (TEXT_TYPES.includes(f.type)) out.push({ field: f, column: f.name });
    else if (f.type === "address") for (const p of ADDRESS_PARTS) out.push({ field: f, column: `${f.name}->>${p}`, part: p });
  }
  return out;
}

/** One "or" filter per word: every word must appear in the title or one of the searched columns (or be the record number). */
export function orFilters(cols: SearchColumn[], words: string[]): string[] {
  return words.map((w) => [`title.ilike.*${w}*`, ...cols.map((c) => `${c.column}.ilike.*${w}*`), ...(/^\d{1,15}$/.test(w) ? [`id.eq.${w}`] : [])].join(","));
}

/** Columns to read back for a hit (address columns come back whole). */
export function selectColumns(t: TableDef, cols: SearchColumn[]): string {
  const names = new Set(["id", "title", "archived_at", "updated_at", ...cols.map((c) => c.field.name)]);
  if (t.parent) names.add(t.parent.field);
  return [...names].join(",");
}

const asText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object")
    return ADDRESS_PARTS.map((p) => (v as Record<string, unknown>)[p])
      .filter(Boolean)
      .join(", ");
  return String(v);
};

/** The line under a hit: the first field (other than the title) holding a word the title doesn't, e.g. "Email: jo@x.com". */
export function matchLine(row: Record<string, unknown>, cols: SearchColumn[], words: string[]): string | undefined {
  const title = String(row.title ?? "").toLowerCase();
  const missing = words.filter((w) => !title.includes(w.toLowerCase()));
  if (!missing.length) return undefined;
  const seen = new Set<string>();
  for (const c of cols) {
    if (seen.has(c.field.name)) continue;
    seen.add(c.field.name);
    const text = asText(row[c.field.name]).replace(/\s+/g, " ").trim();
    const at = missing.map((w) => text.toLowerCase().indexOf(w.toLowerCase())).find((i) => i >= 0);
    if (at === undefined) continue;
    const start = Math.max(0, at - 30);
    const snippet = (start > 0 ? "…" : "") + text.slice(start, start + 80) + (start + 80 < text.length ? "…" : "");
    return `${c.field.label}: ${snippet}`;
  }
  return undefined;
}
