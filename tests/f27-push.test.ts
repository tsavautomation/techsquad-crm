import { describe, expect, it } from "vitest";
import { isPushKind, PUSH_EVENTS, recipientsFor, visitStepMessage } from "../src/lib/push/engine";

// F27 Push notifications (Fred 2026-10-21): check-ins / check-outs to the logins that asked for them.

describe("recipientsFor", () => {
  const people = [
    { id: "fred", active: true, push_events: ["visit_check_in", "visit_check_out"] },
    { id: "jessica", active: true, push_events: ["visit_check_in"] },
    { id: "gone", active: false, push_events: ["visit_check_in"] },
    { id: "tech", active: true, push_events: [] },
    { id: "old", active: true, push_events: null },
  ];
  it("sends check-ins to Fred and Jessica only", () => {
    expect(recipientsFor("visit_check_in", people).map((p) => p.id)).toEqual(["fred", "jessica"]);
  });
  it("sends check-outs to Fred only", () => {
    expect(recipientsFor("visit_check_out", people).map((p) => p.id)).toEqual(["fred"]);
  });
});

describe("visitStepMessage", () => {
  it("names the person, the project and the Eastern time, and opens the visit", () => {
    const m = visitStepMessage("visit_check_in", { person: "Jeferson Medeiros", project: "826 Meridian House", at: "2026-10-21T13:42:00Z", visitId: 7020 });
    expect(m.title).toBe("Jeferson Medeiros checked in");
    expect(m.body).toBe("826 Meridian House · 9:42 AM");
    expect(m.url).toBe("/schedule/visits/7020");
  });
  it("says Internal when the visit has no project", () => {
    expect(visitStepMessage("visit_check_out", { person: "Saulo", project: null, at: "2026-10-21T20:05:00Z", visitId: 1 }).body).toBe("Internal · 4:05 PM");
  });
});

describe("event kinds", () => {
  it("knows its two events and nothing else", () => {
    expect(PUSH_EVENTS.map((e) => e.kind)).toEqual(["visit_check_in", "visit_check_out"]);
    expect(isPushKind("visit_check_in")).toBe(true);
    expect(isPushKind("email")).toBe(false);
  });
});
