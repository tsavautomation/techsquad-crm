import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// F12 Claude API (SPEC §9.1 F12-a): one client for everything the CRM asks Claude. Needs
// ANTHROPIC_API_KEY (server only, never NEXT_PUBLIC_*). Today it reads driver's licence photos
// (src/lib/ai/extract.ts); phase 5 adds proof-reading of job reports and drafting emails through
// the outbox. Every caller goes through claude() so the key, timeouts and errors are handled once.

/** The model for new work (phase 5 proof-reading, drafting). Reading a card uses the cheaper one in extract.ts. */
export const DEFAULT_MODEL = "claude-opus-5-5";

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;

/** The shared SDK client (reads ANTHROPIC_API_KEY). Throws when the key is missing. */
export function claude(): Anthropic {
  if (!aiConfigured()) throw new Error("ANTHROPIC_API_KEY is not set");
  return (client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 }));
}

/** A plain-English reason for an API failure, for the screens. */
export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "The AI key was refused. Check ANTHROPIC_API_KEY.";
  if (e instanceof Anthropic.PermissionDeniedError) return "The AI key isn't allowed to use this model.";
  if (e instanceof Anthropic.RateLimitError) return "The AI service is busy (rate limit). Try again in a minute.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service.";
  if (e instanceof Anthropic.APIError) return `The AI service answered ${e.status ?? "with an error"}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

export type Ping = { ok: true; model: string; ms: number; reply: string } | { ok: false; message: string };

/** Admin › AI "Test connection": one tiny request, so the key and model are proven to work. */
export async function ping(model: string = DEFAULT_MODEL): Promise<Ping> {
  if (!aiConfigured()) return { ok: false, message: "ANTHROPIC_API_KEY is not set." };
  const started = Date.now();
  try {
    const res = await claude().messages.create({
      model,
      max_tokens: 64,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    });
    const reply = res.content.find((b) => b.type === "text")?.text.trim() ?? "";
    return { ok: true, model: res.model, ms: Date.now() - started, reply };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}
