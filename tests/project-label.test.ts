import { describe, expect, it } from "vitest";
import { projectLabel, searchedId } from "@/lib/projects/label";

// PJ-c (Fred 2026-11-04): a project is shown as "Title (number)" everywhere, and found by that number.
describe("PJ-c project label", () => {
  it("puts the number after the title", () => {
    expect(projectLabel("Jun Isaji - One Ocean #305", 1195)).toBe("Jun Isaji - One Ocean #305 (1195)");
    expect(projectLabel(null, 7)).toBe("Project (7)");
  });
  it("reads a typed number, with or without #", () => {
    expect(searchedId("1195")).toBe(1195);
    expect(searchedId(" #1195 ")).toBe(1195);
    expect(searchedId("Isaji")).toBeNull();
    expect(searchedId("1195 Isaji")).toBeNull();
  });
});
