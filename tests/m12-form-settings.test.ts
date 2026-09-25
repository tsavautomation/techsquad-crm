// Form settings (PLAN M12) layered over the registry: pure merge rules.
import { describe, expect, it } from "vitest";
import { getTable } from "@/registry";
import { applySettings, type FieldSetting } from "@/registry/overrides";

const permits = getTable("permits");
const setting = (s: Partial<FieldSetting> & { field_name: string }): FieldSetting => ({
  table_name: "permits",
  label: null,
  required: null,
  help: null,
  sort_order: null,
  options: null,
  ...s,
});
const statusField = permits.fields.find((f) => f.options?.length && f.name !== "type")!;

describe("form settings", () => {
  it("renames labels and adds help without touching the registry", () => {
    const before = JSON.stringify(permits.fields);
    const out = applySettings(permits.fields, [setting({ field_name: statusField.name, label: "Permit Status", help: "As on the city portal" })]);
    const f = out.find((x) => x.name === statusField.name)!;
    expect(f.label).toBe("Permit Status");
    expect(f.help).toBe("As on the city portal");
    expect(JSON.stringify(permits.fields)).toBe(before);
  });

  it("renames, re-colours, retires and adds options; stored values never change", () => {
    const [first, ...rest] = statusField.options!;
    const out = applySettings(permits.fields, [
      setting({ field_name: statusField.name, options: [...rest, { ...first, label: "Renamed", color: "#000000", retired: true }, { value: "New One", label: "New One" }] }),
    ]);
    const opts = out.find((x) => x.name === statusField.name)!.options!;
    expect(opts.map((o) => o.value)).toEqual([...rest.map((o) => o.value), first.value, "New One"]);
    expect(opts.find((o) => o.value === first.value)).toMatchObject({ label: "Renamed", retired: true, color: "#000000" });
  });

  it("keeps registry options a setting left out (so old values still show)", () => {
    const [first] = statusField.options!;
    const out = applySettings(permits.fields, [setting({ field_name: statusField.name, options: [first] })]);
    expect(out.find((x) => x.name === statusField.name)!.options).toHaveLength(statusField.options!.length);
  });

  it("reorders fields; unsorted fields keep their relative place", () => {
    const names = permits.fields.map((f) => f.name);
    const last = names.at(-1)!;
    const out = applySettings(permits.fields, [setting({ field_name: last, sort_order: -1 })]);
    expect(out.map((f) => f.name)).toEqual([last, ...names.slice(0, -1)]);
  });

  it("toggles required, but never on a sub-list's link to its parent", () => {
    const interactions = getTable("contact_interactions");
    const parent = interactions.parent!.field;
    const other = interactions.fields.find((f) => f.name !== parent && !f.required)!;
    const out = applySettings(interactions.fields, [setting({ field_name: parent, required: false }), setting({ field_name: other.name, required: true })], parent);
    expect(out.find((f) => f.name === parent)!.required).toBe(interactions.fields.find((f) => f.name === parent)!.required);
    expect(out.find((f) => f.name === other.name)!.required).toBe(true);
  });
});
