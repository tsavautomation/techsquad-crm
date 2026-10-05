import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// F17 AI review: the queue side, shared by the automations engine (which queues) and the runner
// (src/lib/ai/review.ts). Kept apart so the two modules don't import each other.

/** The automation row the review runs as (migration 20261005020000); its runs are logged under it. */
export const AI_REVIEW_AUTOMATION_ID = 900501;

export const AiSettingsSchema = z.object({
  /** Admin › AI: review new Job Reports with Claude (F17-d). */
  review_reports: z.boolean().default(true),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export async function loadAiSettings(db: SupabaseClient): Promise<AiSettings> {
  const { data } = await db.from("app_settings").select("value").eq("key", "ai").maybeSingle();
  const r = AiSettingsSchema.safeParse((data as { value: unknown } | null)?.value ?? {});
  return r.success ? r.data : AiSettingsSchema.parse({});
}

/**
 * Put a Job Report in the review queue. Only reports of the new era: one just added, or one that
 * was queued before (imported reports have no queue state and are never reviewed, F17-c).
 * Returns what happened, or null when there was nothing to do.
 */
export async function queueReportReview(db: SupabaseClient, id: number, event: string): Promise<string | null> {
  if (!(await loadAiSettings(db)).review_reports) return null;
  const { data } = await db.from("job_reports").select("ai_review_status, report").eq("id", id).maybeSingle();
  const row = data as { ai_review_status: string | null; report: string | null } | null;
  if (!row) return null;
  if (event !== "added" && !row.ai_review_status) return null; // an imported report, edited later
  if (!row.report?.trim()) return null;
  if (row.ai_review_status === "pending" || row.ai_review_status === "running") return null;
  const { error } = await db.from("job_reports").update({ ai_review_status: "pending" }).eq("id", id);
  if (error) throw new Error(`AI review queue: ${error.message}`);
  return "queued for AI review";
}
