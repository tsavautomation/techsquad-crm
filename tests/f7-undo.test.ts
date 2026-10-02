// F7 undo: which fields of a history entry go back.
import { describe, expect, it } from "vitest";
import { undoPatch } from "@/lib/records/undo-patch";
import { getTable } from "@/registry";

const projects = getTable("projects");

describe("undoPatch", () => {
  it("puts back editable fields that still hold the entry's new value, keeps later changes", () => {
    const row = { id: 1, type: "Commercial", category: "Low Voltage", title: "x" };
    const { patch, skipped } = undoPatch(projects, row, {
      type: ["Residential", "Commercial"],
      category: ["Electrical", "Audio Video"], // changed again since
      title: ["old", "x"], // read-only, built by the system
      id: [1, 1],
    });
    expect(patch).toEqual({ type: "Residential" });
    expect(skipped).toEqual(["category"]);
  });

  it("never touches masked sensitive values or unknown columns", () => {
    const employees = getTable("employees");
    const { patch, skipped } = undoPatch(employees, { id: 2, first_name: "B" }, { ssn: ["***", "***"], nope: ["a", "b"], first_name: ["A", "B"] });
    expect(patch).toEqual({ first_name: "A" });
    expect(skipped).toEqual([]);
  });

  it("treats numbers and numeric strings alike (money comes back as a string)", () => {
    const { patch } = undoPatch(projects, { id: 1, maintenance_amount: "1200.00" }, { maintenance_amount: [800, 1200] });
    expect(patch).toEqual({ maintenance_amount: 800 });
  });
});
