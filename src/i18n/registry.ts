import type { FieldDef, TableDef } from "@/registry/types";
import { translate, type Lang } from "./core";

// Registry texts (table names, field labels, headings, dropdown options, help) in the person's
// language. Pages translate a copy of the table before handing it to forms and lists; names,
// stored values and rules never change, so validation and saving work the same in every language.

export function localizeField(f: FieldDef, lang: Lang): FieldDef {
  if (lang === "en") return f;
  const tr = (s: string | undefined) => (s === undefined ? s : translate(lang, s));
  return {
    ...f,
    label: translate(lang, f.label),
    heading: tr(f.heading),
    placeholder: tr(f.placeholder),
    help: tr(f.help),
    options: f.options?.map((o) => ({ ...o, label: translate(lang, o.label) })),
  };
}

// Translated copies, per table and language; rebuilt when Form settings replace the table's fields.
const cache = new WeakMap<TableDef, Map<Lang, { fields: FieldDef[]; out: TableDef }>>();

/** A translated copy of the table (a plain object, so it can be passed to client components). */
export function localizeTable(t: TableDef, lang: Lang): TableDef {
  if (lang === "en") return t;
  const byLang = cache.get(t) ?? new Map();
  const hit = byLang.get(lang);
  if (hit && hit.fields === t.fields) return hit.out;
  const out: TableDef = {
    ...t,
    label: translate(lang, t.label),
    itemLabel: translate(lang, t.itemLabel),
    newRecordLabel: translate(lang, t.newRecordLabel),
    fields: t.fields.map((f) => localizeField(f, lang)),
  };
  byLang.set(lang, { fields: t.fields, out });
  cache.set(t, byLang);
  return out;
}

/** localizeTable for a table that may not exist (URL lookups). */
export const localized = (t: TableDef | undefined, lang: Lang): TableDef | undefined => (t ? localizeTable(t, lang) : t);
