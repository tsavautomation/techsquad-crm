import { describe, expect, it } from "vitest";
import { cleanPhone, compareCards, ignoredByRule, CONVERSATION_IDLE_MS, fallbackTriage, joinsConversation, parseTriage, QUIET_MS, readyToRead, telHref, threadPrompt, threadText, tone, TRIAGE_SYSTEM } from "@/lib/whatsapp/triage-engine";

// F28 WhatsApp Monitor (SPEC §9.1 F28-a / F28-b): reading Claude's triage, the fallback, the grouping of messages
// into conversations and Fred's three colours.

const m = { chat: "Fred Smiliansky", sender: "Fred Smiliansky", body: "Service Call request, crestron system is frozen. Need service call ASAP. Call 555-668-7666" };

describe("reading the triage answer", () => {
  it("accepts the JSON object with or without a code fence or chatter", () => {
    const json = '{"category":"service_call","priority":"urgent","customer":"Fred Smiliansky","phone":"555-668-7666","system":"Crestron","summary":"Fred needs an urgent service call: the Crestron system is frozen.","details":"Crestron system frozen; call 555-668-7666","continues_previous":true}';
    const a = parseTriage("```json\n" + json + "\n```", m);
    expect(a).toEqual({ category: "service_call", priority: "urgent", customer: "Fred Smiliansky", phone: "555-668-7666", system: "Crestron", summary: "Fred needs an urgent service call: the Crestron system is frozen.", details: "Crestron system frozen; call 555-668-7666", continues_previous: true });
    expect(parseTriage("Here you go: " + json + " Anything else?", m)?.category).toBe("service_call");
  });

  it("falls back field by field: unknown category or priority, missing customer, summary or continues_previous, a phone that is not one", () => {
    const a = parseTriage('{"category":"complaint","priority":"high","phone":"call me","summary":null}', m);
    expect(a?.category).toBe("fyi");
    expect(a?.priority).toBe("normal");
    expect(a?.customer).toBe("Fred Smiliansky");
    expect(a?.phone).toBeNull();
    expect(a?.summary).toBe(m.body.slice(0, 80));
    expect(a?.continues_previous).toBe(true);
    expect(parseTriage('{"category":"quote","summary":"x","continues_previous":false}', m)?.continues_previous).toBe(false);
  });

  it("gives up on no JSON at all", () => {
    expect(parseTriage("I cannot help with that.", m)).toBeNull();
    expect(parseTriage("{not json", m)).toBeNull();
  });

  it("the fallback card is an FYI with the first 80 characters", () => {
    const f = fallbackTriage({ chat: "Maria Gonzales", sender: null, body: "  Thank you   for today's visit!  ".repeat(5) });
    expect(f).toMatchObject({ category: "fyi", priority: "normal", customer: "Maria Gonzales", phone: null, continues_previous: true });
    expect(f.summary.length).toBeLessThanOrEqual(80);
    expect(f.summary.startsWith("Thank you for today's visit!")).toBe(true);
  });

  it("shows the model the whole thread, numbered, and where the earlier card ended", () => {
    const msgs = [
      { at: "10/21/2026 9:00 AM", sender: "John", body: "good morning" },
      { at: "10/21/2026 9:01 AM", sender: "John", body: "how are you?" },
      { at: "10/21/2026 9:02 AM", sender: "John", body: "the Crestron remote\nis not responding, asap please" },
    ];
    const fresh = threadPrompt("John Smith", msgs, null);
    expect(fresh).toContain("No earlier card.");
    expect(fresh).toContain("1. [10/21/2026 9:00 AM] John: good morning");
    expect(fresh).toContain("3. [10/21/2026 9:02 AM] John: the Crestron remote is not responding, asap please");
    const again = threadPrompt("John Smith", msgs, { summary: "John said good morning.", readThroughIndex: 2 });
    expect(again).toContain("Earlier card for this chat (messages 1-2): John said good morning.");
    expect(again).toContain("New messages start at 3.");
    expect(TRIAGE_SYSTEM).toContain("continues_previous");
    expect(TRIAGE_SYSTEM).toContain("a greeting followed by a request is the request");
    // F28-c (Fred 2026-10-22): no translation; the summary keeps the language of the messages.
    expect(TRIAGE_SYSTEM).toContain("Portuguese messages get a Portuguese summary");
    expect(TRIAGE_SYSTEM).toContain("never translate");
    expect(TRIAGE_SYSTEM).not.toContain("in English");
  });
});

describe("grouping messages into conversations (F28-b)", () => {
  const now = Date.parse("2026-10-21T15:00:00Z");
  it("a message joins the chat's open card within a day, but not a finished card or a stale one", () => {
    expect(joinsConversation({ status: "open", last_message_at: "2026-10-21T14:00:00Z" }, now)).toBe(true);
    expect(joinsConversation({ status: "in_progress", last_message_at: "2026-10-20T16:00:00Z" }, now)).toBe(true);
    expect(joinsConversation({ status: "open", last_message_at: new Date(now - CONVERSATION_IDLE_MS).toISOString() }, now)).toBe(false);
    expect(joinsConversation({ status: "done", last_message_at: "2026-10-21T14:59:00Z" }, now)).toBe(false);
    expect(joinsConversation({ status: "dismissed", last_message_at: "2026-10-21T14:59:00Z" }, now)).toBe(false);
  });

  it("Claude reads a card only after two quiet minutes with something new", () => {
    expect(QUIET_MS).toBe(120_000);
    expect(readyToRead({ ai_pending: true, last_message_at: new Date(now - QUIET_MS).toISOString() }, now)).toBe(true);
    expect(readyToRead({ ai_pending: true, last_message_at: new Date(now - 30_000).toISOString() }, now)).toBe(false);
    expect(readyToRead({ ai_pending: false, last_message_at: "2026-10-21T10:00:00Z" }, now)).toBe(false);
  });

  it("the timeline text lists the thread oldest first with who said what", () => {
    const text = threadText("Maria", [{ at: "a", sender: null, body: " thanks! " }, { at: "b", sender: "Maria G", body: "payment sent" }], (iso) => `<${iso}>`);
    expect(text).toBe("<a> · Maria: thanks!\n<b> · Maria G: payment sent");
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

  it("sorts urgent first, then the most recent activity", () => {
    const rows = [
      { id: 1, priority: "low" as const, last_message_at: "2026-10-21T10:00:00Z" },
      { id: 2, priority: "urgent" as const, last_message_at: "2026-10-20T10:00:00Z" },
      { id: 3, priority: "normal" as const, last_message_at: "2026-10-21T12:00:00Z" },
      { id: 4, priority: "normal" as const, last_message_at: "2026-10-21T09:00:00Z" },
    ];
    expect([...rows].sort(compareCards).map((r) => r.id)).toEqual([2, 3, 4, 1]);
  });
});

describe("ignore rules (F28-d)", () => {
  const timeTs = { chat: "TIME TS", kind: "regex" as const, pattern: "\\mcheck(ing|ed|in|out|[\\s/-]*(in|out))\\M" };
  const any = { chat: null, kind: "contains" as const, pattern: "Bom dia" };
  it("TIME TS check in / check out and the variations the team actually types make no card", () => {
    for (const body of ["JP Joao Paulo Amaral‎: Checking warehouse", "Tech Squad - Fabio: Checkout warehouse", "Roberto Pizini: Checking/ checkout Enfield", "Check in", "check-out", "CHECKED IN at the Womack house", "checkin"])
      expect(ignoredByRule("TIME TS", body, [timeTs])?.chat).toBe("TIME TS");
    expect(ignoredByRule("time ts", "checking kilowatts", [timeTs])).not.toBeNull();
  });
  it("other chats and other texts still make cards; a chat-less rule applies everywhere, ignoring case and accents", () => {
    expect(ignoredByRule("John Smith", "can you check in on the Crestron?", [timeTs])).toBeNull();
    expect(ignoredByRule("TIME TS", "the van needs gas", [timeTs])).toBeNull();
    expect(ignoredByRule("Maria", "bom dia, tudo bem?", [any])?.pattern).toBe("Bom dia");
    expect(ignoredByRule("Maria", "BÓM DIA", [any])).not.toBeNull();
    expect(ignoredByRule("Maria", "boa tarde", [any])).toBeNull();
    expect(ignoredByRule("Maria", "anything", [{ chat: null, kind: "regex", pattern: "(" }])).toBeNull();
  });
});
