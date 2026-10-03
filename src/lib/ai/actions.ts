"use server";

import { requireUser } from "@/lib/auth/session";
import { ping, type Ping } from "./claude";

/** Admin › AI: send one tiny request to Claude to prove the key works (administrators only). */
export async function testClaudeAction(): Promise<Ping> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can test the AI connection." };
  return ping();
}
