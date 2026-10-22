import { describe, expect, it } from "vitest";
import { cleanPhone, compareTasks, fallbackTriage, parseTriage, telHref, tone, TRIAGE_SYSTEM, triagePrompt } from "@/lib/whatsapp/triage-engine";

// F28 WhatsApp Monitor (SPEC §9.1 F28-a): reading Claude's triage, the fallback and Fred's three colours.

const m = { chat: "Fred Smiliansky", sender: "Fred Smiliansky", body: "Service Call request, crestron system is frozen. Need service call ASAP. Call 555-668-7666" };

describe("reading the triage answer", () => {
  it("accepts the JSON object with or without a code fence or chatter", () => {
    const json = '{"category":"service_call","priority":"urgent","customer":"Fred Smiliansky","phone":"555-668-7666","system":"Crestron","summary":"Fred needs an urgent service call: the Crestron system is frozen.","details":"Crestron system frozen; call 555-668-7666"}';
    const a = parseTriage("```json\n" + json + "\n```", m);
    expect(a).toEqual({ category: "service_call", priority: "urgent", customer: "Fred Smiliansky", phone: "555-668-7666", system: "Crestron", summary: "Fred needs an urgent service call: the Crestron system is frozen.", details: "Crestron system frozen; call 555-668-7666" });
    expect(parseTriage("Here you go: " + json + " Anything else?", m)?.category).toBe("service_call");
  });

  it("falls back field by field: unknown category or priority, missing customer or summary, a phone that is not one", () => {
    const a = parseTriage('{"category":"complaint","priority":"high","phone":"call me","summary":null}', m);
    expect(a?.category).toBe("fyi");
    expect(a?.priority).toBe("normal");
    expect(a?.customer).toBe("Fred Smiliansky");
    expect(a?.phone).toBeNull();
    expect(a?.summary).toBe(m.body.slice(0, 80));
  });

  it("gives up on no JSON at all", () => {
    expect(parseTriage("I cannot help with that.", m)).toBeNull();
    expect(parseTriage("{not json", m)).toBeNull();
  });

  it("the fallback card is an FYI with the first 80 characters", () => {
    const f = fallbackTriage({ chat: "Maria Gonzales", sender: null, body: "  Thank you   for today's visit!  ".repeat(5) });
    expect(f).toMatchObject({ category: "fyi", priority: "normal", customer: "Maria Gonzales", phone: null });
    expect(f.summary.length).toBeLessThanOrEqual(80);
    expect(f.summary.startsWith("Thank you for today's visit!")).toBe(true);
  });

  it("builds the prompt the brief asks for", () => {
    expect(triagePrompt(m)).toBe(`Chat: Fred Smiliansky\nSender: Fred Smiliansky\nMessage: ${m.body}`);
    expect(triagePrompt({ ...m, sender: null })).toContain("Sender: Fred Smiliansky");
    expect(TRIAGE_SYSTEM).toContain('"service_call"|"follow_up"|"quote"|"scheduling"|"fyi"');
  });
});

describe("phones", () => {
  it("keeps only something with 7 to 15 digits and dials US numbers with +1", () => {
    expect(cleanPhone("555-668-7666")).toBe("555-668-7666");
    expect(cleanPhone("+55 11 98765-4321")).toBe("+55 11 98765-4321");
    expect(cleanPhone("none")).toBeNull();
    expect(cleanPhone("12")).toBeNull();
    expect(telHref("(305) 555-1234")).toBe("tel:+13055551234");
    expect(telHref("+55 11 98765-4321")).toBe("tel:+5511987654321");
    expect(telHref("555-1234")).toBe("tel:5551234");
  });
});

describe("Fred's colours and the board order", () => {
  it("red when urgent, yellow when we must do something, green when nothing is needed, grey when finished", () => {
    expect(tone({ category: "service_call", priority: "urgent", status: "open" })).toBe("bad");
    expect(tone({ category: "fyi", priority: "urgent", status: "in_progress" })).toBe("bad");
    expect(tone({ category: "follow_up", priority: "normal", status: "open" })).toBe("warn");
    expect(tone({ category: "quote", priority: "low", status: "open" })).toBe("warn");
    expect(tone({ category: "fyi", priority: "low", status: "open" })).toBe("ok");
    expect(tone({ category: "service_call", priority: "urgent", status: "done" })).toBe("muted");
    expect(tone({ category: "fyi", priority: "normal", status: "dismissed" })).toBe("muted");
  });

  it("sorts urgent first, then newest", () => {
    const rows = [
      { id: 1, priority: "low" as const, occurred_at: "2026-10-21T10:00:00Z" },
      { id: 2, priority: "urgent" as const, occurred_at: "2026-10-20T10:00:00Z" },
      { id: 3, priority: "normal" as const, occurred_at: "2026-10-21T12:00:00Z" },
      { id: 4, priority: "normal" as const, occurred_at: "2026-10-21T09:00:00Z" },
    ];
    expect([...rows].sort(compareTasks).map((r) => r.id)).toEqual([2, 3, 4, 1]);
  });
});
