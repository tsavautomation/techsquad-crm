import { describe, expect, it } from "vitest";
import { AnswerSchema, applyReview as apply, MOVED_MARKER, parseAnswer, userPrompt, type ReviewAnswer, type ReviewInput } from "@/lib/ai/review-apply";

/** Answers in these tests name only the fields they care about; the schema fills the rest (F19 added four). */
const applyReview = (i: ReviewInput, a: Partial<ReviewAnswer>) => apply(i, AnswerSchema.parse(a));

// F17 AI review of Job Reports (SPEC §9.1 F17-a/b): the pure part, from Claude's answer to the patch.

const base: ReviewInput = { report: "instaled the tv in the living room, client happy", result: null, partial_reason: null, missing_items: null, logins: null, date: "2026-10-05" };
const clean = "Installed the TV in the living room; the client is happy.";

describe("parseAnswer", () => {
  it("reads plain JSON and JSON in a code fence", () => {
    expect(parseAnswer('{"report":"x","grammar_changed":true}')).toMatchObject({ report: "x", grammar_changed: true, pending: [], credentials: [] });
    expect(parseAnswer('```json\n{"report":"y","pending":["a"]}\n```')).toMatchObject({ report: "y", pending: ["a"] });
  });
  it("rejects anything else", () => {
    expect(parseAnswer("Sorry, I can't")).toBeNull();
    expect(parseAnswer('{"report": 5}')).toBeNull();
  });
  it("sends the report, the result, the existing missing items and the reasons", () => {
    const p = JSON.parse(userPrompt({ ...base, result: "Partial", missing_items: "- cable\n- remote" }));
    expect(p).toMatchObject({ report: base.report, result: "Partial", already_missing: ["cable", "remote"] });
    expect(p.reasons).toContain("Missing material");
  });
});

describe("applyReview: grammar", () => {
  it("replaces the text when it really changed", () => {
    const r = applyReview(base, { report: clean, grammar_changed: true, pending: [], reason: null, credentials: [] });
    expect(r.patch).toEqual({ report: clean });
    expect(r.notes).toEqual(["Grammar and clarity corrected; the original text is in History."]);
  });
  it("leaves the text alone when only whitespace differs, and says nothing", () => {
    const r = applyReview(base, { report: `  ${base.report.replace(",", ",\n")} `, grammar_changed: false, pending: [], reason: null, credentials: [] });
    expect(r.patch).toEqual({});
    expect(r.notes).toEqual([]);
  });
  it("does not trust an answer that lost most of the text", () => {
    const r = applyReview({ ...base, report: "a".repeat(400) }, { report: "Short.", grammar_changed: true, pending: [], reason: null, credentials: [] });
    expect(r.patch).toEqual({});
  });
});

describe("applyReview: pending work", () => {
  it("fills What's missing and sets Partial when the result is blank", () => {
    const r = applyReview(base, { report: base.report, grammar_changed: false, pending: ["Mount the soundbar", "Program the remote"], reason: "Out of time", credentials: [] });
    expect(r.patch).toEqual({ missing_items: "Mount the soundbar\nProgram the remote", result: "Partial", partial_reason: "Out of time" });
    expect(r.notes).toEqual(["2 pending items added to What's missing.", "Result set to Partial."]);
  });
  it("keeps the technician's Partial and reason, adds only new lines", () => {
    const r = applyReview({ ...base, result: "Partial", partial_reason: "No access", missing_items: "Mount the soundbar" }, { report: base.report, grammar_changed: false, pending: ["mount the soundbar", "Program the remote"], reason: "Other", credentials: [] });
    expect(r.patch).toEqual({ missing_items: "Mount the soundbar\nProgram the remote" });
    expect(r.notes).toEqual(["1 pending item added to What's missing."]);
  });
  it("falls back to Other for a reason that is not in the list", () => {
    const r = applyReview(base, { report: base.report, grammar_changed: false, pending: ["x"], reason: "Rain", credentials: [] });
    expect(r.patch.partial_reason).toBe("Other");
  });
  it("never overrules a Completed report, but says so", () => {
    const r = applyReview({ ...base, result: "Completed" }, { report: base.report, grammar_changed: false, pending: ["Program the remote"], reason: "Other", credentials: [] });
    expect(r.patch).toEqual({});
    expect(r.notes[0]).toMatch(/says Completed: nothing was changed/);
  });
});

describe("applyReview: F19 return visit, parts, site facts, issue keys", () => {
  it("passes them through, cleaned, and never a return visit for a Completed report", () => {
    const r = applyReview(base, { report: base.report, return_visit: { needed: true, why: "GC must finish the drywall", days: 5 }, parts: ["- HDMI 2.1 cable 25 ft"], site_facts: ["Rack is in the garage closet.", "Wi-Fi password is Casa1234"], issue_keys: ["WiFi Dropouts", "x"] });
    expect(r.returnVisit).toEqual({ why: "GC must finish the drywall", days: 5 });
    expect(r.parts).toEqual(["HDMI 2.1 cable 25 ft"]);
    expect(r.siteFacts).toEqual(["Rack is in the garage closet."]);
    expect(r.issueKeys).toEqual(["wifi-dropouts"]);
    expect(applyReview({ ...base, result: "Completed" }, { report: base.report, return_visit: { needed: true, why: null, days: null } }).returnVisit).toBeNull();
  });
});

describe("applyReview: logins and passwords", () => {
  const withCreds: ReviewInput = { ...base, report: "Set up the router. Admin login is admin / Casa1234. Client happy." };
  it("moves them to the Logins field and builds the project block", () => {
    const r = applyReview(withCreds, { report: `Set up the router. ${MOVED_MARKER} The client is happy.`, grammar_changed: true, pending: [], reason: null, credentials: ["Router admin: admin / Casa1234"] });
    expect(r.patch.logins_and_passwords).toBe("Router admin: admin / Casa1234");
    expect(r.patch.report).not.toContain("Casa1234");
    expect(r.projectCredentials).toBe("From Job Report of 10/5/2026:\nRouter admin: admin / Casa1234");
    expect(r.notes).toContain("Login details moved to Login and Passwords and added to the project's System Credentials.");
  });
  it("appends to existing logins without repeating a line", () => {
    const r = applyReview({ ...withCreds, logins: "Router admin: admin / Casa1234" }, { report: withCreds.report, grammar_changed: false, pending: [], reason: null, credentials: ["Router admin: admin / Casa1234", "Wi-Fi Casa5G: senha123"] });
    expect(r.patch.logins_and_passwords).toBe("Router admin: admin / Casa1234\nWi-Fi Casa5G: senha123");
    expect(r.projectCredentials).toBe("From Job Report of 10/5/2026:\nWi-Fi Casa5G: senha123");
  });
  it("replaces a credential line the model left in the text", () => {
    const r = applyReview(withCreds, { report: "Set up the router. admin / Casa1234 is the login. Client happy.", grammar_changed: true, pending: [], reason: null, credentials: ["admin / Casa1234"] });
    expect(r.patch.report).toBe(`Set up the router. ${MOVED_MARKER} is the login. Client happy.`);
  });
});

// F17-e (Fred 2026-10-06): Problems found, Outcome and a blank Result are filled from the text.
describe("applyReview: problems, outcome and result (F17-e)", () => {
  const pt: ReviewInput = {
    ...base,
    report: "O cliente estava sem volume nas TVs.\nConstatei que o Crestron tinha perdido a autenticação com o Sonos.\n\nTudo ficou funcionando bem.",
    problems: null,
    outcome: null,
  };
  const answer: Partial<ReviewAnswer> = {
    report: pt.report,
    problems: ["O cliente estava sem volume nas TVs", "o Crestron tinha perdido a autenticação com o Sonos"],
    outcome: "Tudo ficou funcionando bem.",
    finished: true,
  };

  it("fills Problems found (joined with slashes), Outcome, and sets a blank Result to Completed", () => {
    const r = applyReview(pt, answer);
    expect(r.patch).toEqual({
      problems: "O cliente estava sem volume nas TVs / o Crestron tinha perdido a autenticação com o Sonos",
      outcome: "Tudo ficou funcionando bem.",
      result: "Completed",
    });
    expect(r.notes).toEqual(["Result set to Completed.", "Problems found filled from the text.", "Outcome filled from the text."]);
  });

  it("never overwrites what the technician typed, and leaves a chosen Result alone", () => {
    const r = applyReview({ ...pt, problems: "TV sem som", outcome: "Resolvido", result: "Partial" }, answer);
    expect(r.patch).toEqual({});
    expect(r.notes).toEqual([]);
  });

  it("does not call the work Completed when something is pending or someone must come back", () => {
    const pending = applyReview(pt, { ...answer, finished: false, pending: ["trocar o cabo HDMI"], reason: "Missing material" });
    expect(pending.patch.result).toBe("Partial");
    const back = applyReview(pt, { ...answer, return_visit: { needed: true, why: "GC not ready", days: null } });
    expect(back.patch.result).toBeUndefined();
    const unsure = applyReview(pt, { ...answer, finished: false });
    expect(unsure.patch.result).toBeUndefined();
  });

  it("keeps Outcome to one line of at most 200 characters", () => {
    const r = applyReview(pt, { ...answer, outcome: `  a\n b ${"x".repeat(300)}` });
    expect(r.patch.outcome).toMatch(/^a b x+$/);
    expect(String(r.patch.outcome).length).toBe(200);
  });
});
