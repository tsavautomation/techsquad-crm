import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claude, describeError } from "./claude";
import { scrubSummary, SUMMARY_MODEL, SUMMARY_SYSTEM, summaryPrompt } from "./review-apply";

// F19-d Site history: the running AI note on each project, rewritten after every reviewed Job Report
// (from that report's site facts) or rebuilt from the project's last reports on request.

export type SummaryResult = { ok: true; summary: string; ms: number } | { ok: false; message: string };

/** Ask Claude for the new note and store it. `items` are the facts or texts to fold in. */
export async function updateSiteSummary(db: SupabaseClient, projectId: number, items: { date: string | null; text: string }[]): Promise<SummaryResult> {
  if (!items.length) return { ok: false, message: "nothing new" };
  const { data } = await db.from("projects").select("site_summary").eq("id", projectId).maybeSingle();
  const previous = (data as { site_summary: string | null } | null)?.site_summary ?? null;
  const started = Date.now();
  try {
    const res = await claude().messages.create({ model: SUMMARY_MODEL, max_tokens: 1200, system: SUMMARY_SYSTEM, messages: [{ role: "user", content: summaryPrompt(previous, items) }] });
    const text = scrubSummary(res.content.find((b) => b.type === "text")?.text ?? "");
    if (!text) return { ok: false, message: "empty answer" };
    const { error } = await db.from("projects").update({ site_summary: text, site_summary_at: new Date().toISOString() }).eq("id", projectId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, summary: text, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}

/** Rebuild from the project's last reports (newest 30): one call, a few cents. */
export async function rebuildSiteSummary(db: SupabaseClient, projectId: number): Promise<SummaryResult> {
  const { data } = await db.from("job_reports").select("date, report, problems, materials_used, access_info").eq("project_id", projectId).is("deleted_at", null).order("date", { ascending: false }).order("id", { ascending: false }).limit(30);
  const rows = ((data ?? []) as { date: string | null; report: string | null; problems: string | null; materials_used: string | null; access_info: string | null }[]).reverse();
  const items = rows
    .map((r) => ({ date: r.date, text: [r.report, r.problems && `Problems: ${r.problems}`, r.materials_used && `Materials: ${r.materials_used}`, r.access_info && `Access: ${r.access_info}`].filter(Boolean).join("\n").slice(0, 3000) }))
    .filter((i) => i.text.trim());
  if (!items.length) return { ok: false, message: "This project has no Job Reports yet." };
  // Rebuilding starts from a blank note, so stale facts don't survive.
  await db.from("projects").update({ site_summary: null }).eq("id", projectId);
  return updateSiteSummary(db, projectId, items);
}
