import { describe, expect, it } from "vitest";
import { getTable, REGISTRY } from "@/registry";
import { matchLine, orFilters, searchColumns, searchWords, selectColumns } from "@/lib/search/query";

describe("top-bar search", () => {
  it("cleans the typed words of filter characters", () => {
    expect(searchWords("  Smith, (John)  ")).toEqual(["Smith", "John"]);
    expect(searchWords('a"b*c%d_e:f\\g')).toEqual(["a", "b", "c", "d", "e", "f", "g"].slice(0, 4));
    expect(searchWords("")).toEqual([]);
  });

  it("never searches sensitive fields", () => {
    for (const t of REGISTRY) for (const c of searchColumns(t)) expect(c.field.sensitive).toBeFalsy();
  });

  it("searches address parts with JSON paths", () => {
    const cols = searchColumns(getTable("projects")).map((c) => c.column);
    expect(cols.some((c) => /->>street$/.test(c))).toBe(true);
    expect(cols.some((c) => /->>zip$/.test(c))).toBe(true);
  });

  it("builds one or-filter per word, with the record number for digits", () => {
    const cols = searchColumns(getTable("contacts"));
    const [a, b] = orFilters(cols, ["jo", "42"]);
    expect(a.startsWith("title.ilike.*jo*,")).toBe(true);
    expect(a).not.toContain("id.eq");
    expect(b).toContain("id.eq.42");
  });

  it("reads back the parent link for sub-grid rows", () => {
    const child = REGISTRY.find((t) => t.parent);
    if (!child) return;
    expect(selectColumns(child, searchColumns(child)).split(",")).toContain(child.parent!.field);
  });

  it("explains a hit the title doesn't", () => {
    const cols = searchColumns(getTable("contacts"));
    const email = cols.find((c) => c.field.type === "email")!;
    const row = {
      id: 1,
      title: "Jane Doe",
      [email.field.name]: "jane@acme.com",
    };
    expect(matchLine(row, cols, ["jane"])).toBeUndefined();
    expect(matchLine(row, cols, ["acme"])).toBe(`${email.field.label}: jane@acme.com`);
  });
});
