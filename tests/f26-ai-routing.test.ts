import { describe, expect, it } from "vitest";
import { briefPrompt, decide, parseRouteAnswer, requestDescription, routePrompt } from "@/lib/ai/route-engine";

// F26-3 AI reading and routing of project emails (SPEC §9.1 F26-b): reading Claude's answer and deciding.

const mail = { subject: "Fwd: LV - Womack Residence - window treatment details", from: "Chloe Womack <chloe@x.com>", receivedAt: "2026-10-21T17:20:03.000Z" };

describe("reading the model's answer", () => {
  it("accepts a plain JSON object, with or without a code fence, and checks the fields", () => {
    const a = parseRouteAnswer('```json\n{"kind":"rfi","summary":"Which TV size goes in the master suite?","asked_by":"Chloe Womack","deadline":"2026-10-25","answers_request_id":null,"confidence":0.9}\n```');
    expect(a).toEqual({ kind: "rfi", summary: "Which TV size goes in the master suite?", asked_by: "Chloe Womack", deadline: "2026-10-25", answers_request_id: null, confidence: 0.9 });
    expect(parseRouteAnswer('Sure! {"kind":"info","summary":"Thanks"}')?.kind).toBe("info");
  });

  it("refuses an unknown kind or no JSON, and drops an impossible date", () => {
    expect(parseRouteAnswer('{"kind":"spam","summary":"x"}')).toBeNull();
    expect(parseRouteAnswer("no json here")).toBeNull();
    expect(parseRouteAnswer('{"kind":"rfi","summary":"x","deadline":"2026-02-30"}')?.deadline).toBeNull();
    expect(parseRouteAnswer('{"kind":"rfi","summary":"x","deadline":"next week"}')).toBeNull();
  });

  it("keeps passwords out of the summary", () => {
    const a = parseRouteAnswer('{"kind":"info","summary":"The wifi password is Sunset2026 and the gate code is 1234"}');
    expect(a?.summary).not.toMatch(/Sunset2026|1234/);
  });
});

describe("what the CRM does with it", () => {
  const open = [{ id: 7, type: "RFI", date: "2026-10-20", description: "Which TV size?" }];

  it("an RFI or change order becomes a request line with the ask, who asks, the deadline and the source", () => {
    const a = parseRouteAnswer('{"kind":"change_order","summary":"Add two more shades in the office","asked_by":"Chloe Womack","deadline":"2026-11-01"}')!;
    const d = decide(a, mail, [7]);
    expect(d.createRequest?.type).toBe("Change order");
    expect(d.createRequest?.description).toBe('Add two more shades in the office\nAsked by Chloe Womack\nNeeded by 2026-11-01\nFrom the email "Fwd: LV - Womack Residence - window treatment details" of 2026-10-21 (Chloe Womack <chloe@x.com>)');
    expect(d.closeRequestId).toBeUndefined();
    expect(d.createTask).toBeUndefined();
    expect(decide(parseRouteAnswer('{"kind":"rfi","summary":""}')!, mail, []).createRequest?.description.startsWith(mail.subject)).toBe(true);
  });

  it("an answer closes the open request it names, and only an open one", () => {
    expect(decide(parseRouteAnswer('{"kind":"answer","summary":"75 inch","answers_request_id":7}')!, mail, [7]).closeRequestId).toBe(7);
    expect(decide(parseRouteAnswer('{"kind":"answer","summary":"75 inch","answers_request_id":9}')!, mail, [7]).closeRequestId).toBeUndefined();
    expect(decide(parseRouteAnswer('{"kind":"answer","summary":"75 inch"}')!, mail, [7])).toEqual({});
  });

  it("a scheduling request becomes a task for the office; documents and info do nothing", () => {
    const t = decide(parseRouteAnswer('{"kind":"scheduling","summary":"Wants a visit next Tuesday","asked_by":"Chloe","deadline":"2026-10-27"}')!, mail, []);
    expect(t.createTask?.dueDate).toBe("2026-10-27");
    expect(t.createTask?.details).toContain("Wants a visit next Tuesday");
    expect(decide(parseRouteAnswer('{"kind":"document","summary":"Plans attached"}')!, mail, [])).toEqual({});
    expect(decide(parseRouteAnswer('{"kind":"info","summary":"FYI"}')!, mail, [])).toEqual({});
  });

  it("builds the prompts with the open requests and the attachments", () => {
    const p = routePrompt({ projectTitle: "Womack", subject: mail.subject, from: mail.from, receivedAt: mail.receivedAt, text: "Hello", attachments: ["plan.pdf"], openRequests: open });
    expect(p).toContain("id 7 · RFI · 2026-10-20 · Which TV size?");
    expect(p).toContain("Attachments: plan.pdf");
    const b = briefPrompt({ title: "Womack", jobStatus: "Infrastructure", openRequests: open, events: [{ date: "2026-10-21", text: "Email: window treatment details" }], previous: null });
    expect(b).toContain("Job status: Infrastructure");
    expect(b).toContain("[2026-10-21] Email: window treatment details");
    expect(requestDescription(parseRouteAnswer('{"kind":"rfi","summary":"x"}')!, mail)).toContain("From the email");
  });
});
