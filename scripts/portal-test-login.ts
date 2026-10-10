// Dev only: a customer-portal test login (F6) on the linked DEV project, so the portal can be tried without
// inviting a real customer. Creates a test Contact, gives it access to the project with the most visits and
// creates the Auth user with a random password. The login is written to .portal-test-login.txt (git-ignored).
//
//   node --env-file=.env.local --import tsx scripts/portal-test-login.ts      (ALLOW_PROD=1 while dev and production share one project)
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SECRET_KEY!;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY missing in .env.local");
if (/cxobjsmlmdfocsbzpwlz/.test(url) && process.env.ALLOW_PROD !== "1") throw new Error("This looks like the production project. Refusing.");
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const email = "portal-test@example.invalid";
  const { data: v } = await db.from("visits").select("project_id").is("deleted_at", null).not("project_id", "is", null).limit(2000);
  const counts = new Map<number, number>();
  for (const r of (v ?? []) as { project_id: number }[]) counts.set(r.project_id, (counts.get(r.project_id) ?? 0) + 1);
  const projectId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!projectId) throw new Error("No project with visits on this database");

  let { data: contact } = await db.from("contacts").select("id").eq("email", email).maybeSingle();
  if (!contact) {
    const { data, error } = await db.from("contacts").insert({ type: "End Customer", first_name: "Portal", last_name: "Test", email, preferred_language: "Português", title: "Portal Test" }).select("id").single();
    if (error) throw error;
    contact = data;
  }
  const contactId = (contact as { id: number }).id;
  await db.from("portal_access").upsert({ project_id: projectId, contact_id: contactId, invited_at: new Date().toISOString() }, { onConflict: "project_id,contact_id" });

  const password = randomBytes(9).toString("base64url");
  const { data: existing } = await db.from("profiles").select("id").eq("contact_id", contactId).maybeSingle();
  if (existing) {
    const { error } = await db.auth.admin.updateUserById((existing as { id: string }).id, { password });
    if (error) throw error;
  } else {
    const { error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: "Portal", last_name: "Test", contact_id: String(contactId) } });
    if (error) throw error;
  }
  writeFileSync(".portal-test-login.txt", `${email}\n${password}\nproject ${projectId}\n`);
  console.log(`Portal test login ready for project ${projectId}; see .portal-test-login.txt`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
