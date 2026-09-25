// URLs for registry tables: /<module>/<tab>[/<id>[/edit]] and /lists/<table> for utility lists.
import { REGISTRY } from ".";
import type { TableDef } from "./types";

export const LISTS_MODULE = "lists";

/** Resolve a table from its URL segments; undefined when the URL doesn't name a record type. */
export function tableFromRoute(module: string, tab: string): TableDef | undefined {
  if (module === LISTS_MODULE) return REGISTRY.find((t) => t.module === "utility" && t.name === tab.replace(/-/g, "_"));
  return REGISTRY.find((t) => t.module === module && t.tab === tab);
}

export function tableHref(t: TableDef): string {
  if (t.module === "utility") return `/${LISTS_MODULE}/${t.name.replace(/_/g, "-")}`;
  if (!t.tab) throw new Error(`${t.name} has no page of its own`);
  return `/${t.module}/${t.tab}`;
}

export const recordHref = (t: TableDef, id: number | string) => `${tableHref(t)}/${id}`;
