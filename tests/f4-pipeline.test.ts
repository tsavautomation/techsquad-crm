// F4: pipeline board moves, message templates, the "Create a task" automation action and the seeds.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AutomationSchema, check } from "@/lib/engine/automation-schema";
import { moveFor, NOT_SUBMITTED, targetsFrom, type BoardLevel } from "@/lib/pipeline/moves";
import { fillTemplate, langFor, mailLink, parseMessages, phoneDigits, smsLink, templateText, TOKENS } from "@/lib/messages/templates";
import { getTable } from "@/registry";

const sql = readFileSync("supabase/migrations/20261001040000_f4_pipeline.sql", "utf8");
const noReviews = readFileSync("supabase/migrations/20261002000000_f4_no_review_requests.sql", "utf8");

// A slice of Project Proposal (SPEC §6.1): Override only at Surveying.
const L = (id: number, title: string, outcomes: BoardLevel["outcomes"], extra: Partial<BoardLevel> = {}): BoardLevel => ({ id, title, color: "#000", place: id, is_start: id === 1, may_act: true, outcomes, ...extra });
const levels: BoardLevel[] = [
  L(1, "Surveying", [
    { id: 11, title: "Create Proposal", kind: "goto", target: 2 },
    { id: 12, title: "Override", kind: "override", target: null },
    { id: 13, title: "Remove from Workflow", kind: "unsubmit", target: null },
  ]),
  L(2, "Create Proposal", [{ id: 21, title: "Proposal Sent", kind: "goto", target: 4 }]),
  L(4, "Proposal Sent", [{ id: 41, title: "Proposal Approved", kind: "goto", target: 5 }]),
  L(5, "Proposal Approved", [
    { id: 51, title: "Complete", kind: "goto", target: 10 },
    { id: 52, title: "On Hold", kind: "goto", target: 6 },
  ]),
  L(6, "ON HOLD", [{ id: 61, title: "Installation", kind: "goto", target: 8 }]),
  L(8, "Installation", [], { may_act: false }),
  L(10, "Complete", []),
];

describe("pipeline board moves", () => {
  it("takes the stage's own option when there is one", () => {
    expect(moveFor(levels, 4, 5, true)).toEqual({ kind: "outcome", outcomeId: 41, target: null });
  });

  it("keeps the WebAuthor path: Approved can't jump to Installation", () => {
    expect(moveFor(levels, 5, 8, true)).toBeNull();
    expect(targetsFrom(levels, 5, true)).toEqual([6, 10]);
  });

  it("uses Override (with the target) where the stage has it", () => {
    expect(moveFor(levels, 1, 8, true)).toEqual({ kind: "outcome", outcomeId: 12, target: 8 });
  });

  it("offers nothing from a stage the user may not act on, or back to Not submitted", () => {
    expect(targetsFrom(levels, 8, true)).toEqual([]);
    expect(moveFor(levels, 2, NOT_SUBMITTED, true)).toBeNull();
  });

  it("submits a new project only into the starting stage, and only for people who may change projects", () => {
    expect(moveFor(levels, NOT_SUBMITTED, 1, true)).toEqual({ kind: "submit" });
    expect(moveFor(levels, NOT_SUBMITTED, 2, true)).toBeNull();
    expect(moveFor(levels, NOT_SUBMITTED, 1, false)).toBeNull();
  });
});

describe("message templates", () => {
  // The F4 seed, minus the review request removed on 2026-10-02 (no review links to clients).
  const seeded = parseMessages(JSON.parse(sql.match(/\$json\$([\s\S]*?)\$json\$/)![1]));
  const settings = { templates: seeded.templates.filter((t) => t.key !== "review_request") };

  it("never sends clients a review link", () => {
    expect(noReviews).toMatch(/t ->> 'key' <> 'review_request'/);
    expect(TOKENS).not.toContain("review_link");
    expect(parseMessages({ review_link: "https://g.page/r/abc", templates: [] })).toEqual({ templates: [] });
  });

  it("keeps four templates, each in English, Português and Español, using only known words", () => {
    expect(settings.templates.map((t) => t.key)).toEqual(["first_contact", "visit_confirmation", "proposal_follow_up", "plan_renewal"]);
    for (const t of settings.templates)
      for (const l of ["en", "pt", "es"] as const) {
        expect(t.texts[l].body, `${t.key} ${l}`).not.toBe("");
        for (const m of `${t.texts[l].subject} ${t.texts[l].body}`.matchAll(/\{(\w+)\}/g)) expect(TOKENS).toContain(m[1]);
      }
  });

  it("fills the words and tidies what's left empty", () => {
    expect(fillTemplate("Hi {first_name}, about {project} {nothing}.", { first_name: "Ana", project: "Casa" })).toBe("Hi Ana, about Casa.");
  });

  it("picks the client's language and falls back to English when a text is blank", () => {
    expect(langFor("Português")).toBe("pt");
    expect(langFor("Español")).toBe("es");
    expect(langFor(null)).toBe("en");
    const t = { ...settings.templates[0], texts: { ...settings.templates[0].texts, es: { subject: "", body: "" } } };
    expect(templateText(t, "es")).toEqual(settings.templates[0].texts.en);
  });

  it("builds Messages and Mail links", () => {
    expect(phoneDigits("(305) 555-0100")).toBe("+13055550100");
    expect(phoneDigits("+55 11 98888-7777")).toBe("+5511988887777");
    expect(smsLink("305-555-0100", "Hi & bye")).toBe("sms:+13055550100?&body=Hi%20%26%20bye");
    expect(mailLink("ana@example.com", "Oi", "Olá!")).toBe("mailto:ana@example.com?subject=Oi&body=Ol%C3%A1!");
  });
});

describe("stage auto tasks", () => {
  const projects = getTable("projects");
  const rows = [...sql.matchAll(/\((9004\d\d), 'projects', '([^']+)', true, '\{([^}]*)\}',\s*'([^']+)',\s*'([^']+)',/g)];

  const updated = noReviews.match(/set title = '([^']+)',\s*conditions = '([^']+)',\s*actions = '([^']+)'/)!;

  it("seeds three valid automations on Job Status, assigned to the Salesperson", () => {
    expect(rows.map((r) => r[1])).toEqual(["900401", "900402", "900403"]);
    const final = rows.map((r) => (r[1] === "900403" ? [r[0], r[1], updated[1], r[3], updated[2], updated[3]] : [...r]));
    for (const [, , title, events, conditions, actions] of final) {
      const a = AutomationSchema.parse({ title, active: true, events: events.split(","), conditions: JSON.parse(conditions), actions: JSON.parse(actions) });
      expect(check(projects, a), title).toEqual([]);
      expect(a.actions[0]).toMatchObject({ type: "task", assign: "salesperson_id" });
      expect(JSON.stringify(a.actions), title).not.toMatch(/review/i);
    }
  });

  it("offers a maintenance plan on Complete only when the project has none", () => {
    expect(JSON.parse(updated[2]).rules).toContainEqual({ field: "maintenance_plan", op: "=", value: false });
  });

  it("flags a task assigned to a field that isn't an Employee, and unknown words", () => {
    const a = AutomationSchema.parse({ title: "x", active: true, events: ["added"], conditions: { match: "all", rules: [] }, actions: [{ type: "task", text: "Call {nope}", due_days: 1, assign: "job_owner_id" }] });
    expect(check(projects, a)).toEqual(["Owner is not a link to an Employee.", "Unknown field {nope} in the task text."].map((s) => s.replace("Owner", projects.fields.find((f) => f.name === "job_owner_id")!.label)));
  });
});
