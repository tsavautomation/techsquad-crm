import "server-only";
import { cache } from "react";
import { recordsDb } from "@/lib/records/data";

export type QueueRow = { table_name: string; record_id: number; workflow_id: string; level_id: number; level_title: string; level_color: string | null; entered_at: string };

/**
 * The records waiting for the signed-in user's workflow decision (my_workflow_queue), read once per
 * request: the Today page asks for it from two cards (the "Waiting for me" tile and the assigned
 * list), and it was the slowest call on the page (Fred 2026-10-20).
 */
export const myWorkflowQueue = cache(async (): Promise<QueueRow[]> => {
  const db = await recordsDb();
  const { data } = await db.rpc("my_workflow_queue");
  return (data ?? []) as QueueRow[];
});
