/**
 * Load the logins WebAuthor never exported (the grid export leaves Password fields empty): the
 * Organizations "Login" / "Password" and the Projects "System Credentials", read from the WebAuthor
 * record pages into a JSON file, and written encrypted onto the existing CRM records. Only empty
 * CRM fields are filled, so anything typed into the CRM since the import stays.
 *
 *   npx tsx --env-file=.env.local scripts/import-webauthor-credentials.ts <file.json> [--apply]
 *
 * File shape: { org: [{ id, name, login, password }], prj: [{ id, title, cred }] } (ids = WebAuthor record ids = CRM ids).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { encrypt } from "../src/lib/crypto";

const FILE = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!FILE) throw new Error("pass the JSON file");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
type Org = { id: number; name: string | null; login: string | null; password: string | null };
type Prj = { id: number; title: string | null; cred: string | null };

async function main() {
  const { org, prj } = JSON.parse(readFileSync(FILE, "utf8")) as { org: Org[]; prj: Prj[] };
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+$/g, "").trim();
  let orgLogins = 0, orgPw = 0, prjCred = 0, kept = 0, missing = 0;
  for (const o of org) {
    const login = clean(o.login), pw = clean(o.password);
    if (!login && !pw) continue;
    const { data } = await db.from("organizations").select("id, title, portal_login, portal_password").eq("id", o.id).maybeSingle();
    if (!data) { missing++; console.log(`  ! organization #${o.id} ${o.name} not in the CRM`); continue; }
    const patch: Record<string, string> = {};
    if (login && !data.portal_login) patch.portal_login = login;
    if (pw && !data.portal_password) patch.portal_password = encrypt(pw);
    if (!Object.keys(patch).length) { kept++; continue; }
    if (patch.portal_login) orgLogins++;
    if (patch.portal_password) orgPw++;
    console.log(`  organization #${o.id} ${data.title}: ${Object.keys(patch).join(" + ")}`);
    if (APPLY) { const { error } = await db.from("organizations").update(patch).eq("id", o.id); if (error) throw new Error(error.message); }
  }
  for (const p of prj) {
    const cred = clean(p.cred);
    if (!cred) continue;
    const { data } = await db.from("projects").select("id, title, system_credentials").eq("id", p.id).maybeSingle();
    if (!data) { missing++; console.log(`  ! project #${p.id} ${p.title} not in the CRM`); continue; }
    if (data.system_credentials) { kept++; continue; }
    prjCred++;
    console.log(`  project #${p.id} ${data.title}: system credentials (${cred.length} chars)`);
    if (APPLY) { const { error } = await db.from("projects").update({ system_credentials: encrypt(cred) }).eq("id", p.id); if (error) throw new Error(error.message); }
  }
  console.log(`\n${APPLY ? "Written" : "Would write"}: ${orgLogins} organization logins, ${orgPw} organization passwords, ${prjCred} project credentials; ${kept} already filled in the CRM (left alone), ${missing} records missing.`);
  if (!APPLY) console.log("Dry run. Add --apply.");
}
main().catch((e) => { console.error(e); process.exit(1); });
