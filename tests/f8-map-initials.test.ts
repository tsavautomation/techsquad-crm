import { describe, expect, it } from "vitest";
import { initialsOf } from "@/lib/schedule/map";

describe("map pins show the technician's initials", () => {
  it("takes the first and last name", () => {
    expect(initialsOf("Carlos Gurgel")).toBe("CG");
    expect(initialsOf("Kleider Loregian Junior")).toBe("KJ");
    expect(initialsOf("Anderson")).toBe("AN");
    expect(initialsOf("  ")).toBeNull();
    expect(initialsOf(null)).toBeNull();
  });
});
