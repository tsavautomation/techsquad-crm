// Licence expiry read from a photo (Fred batch 1): only a real, plausible expiry date is accepted.
import { describe, expect, it } from "vitest";
import { parseDate } from "@/lib/ai/parse";

describe("reading the AI's answer", () => {
  it("accepts a valid date in the JSON answer", () => {
    expect(parseDate('{"date": "2028-03-12"}')).toBe("2028-03-12");
    expect(parseDate('Here you go: {"date":"2031-11-30"}')).toBe("2031-11-30");
  });

  it("rejects nothing-found, impossible dates and birth-date-like years", () => {
    expect(parseDate('{"date": null}')).toBeNull();
    expect(parseDate('{"date": "2028-02-30"}')).toBeNull();
    expect(parseDate('{"date": "1985-06-01"}')).toBeNull();
    expect(parseDate("03/12/2028")).toBeNull();
  });
});
