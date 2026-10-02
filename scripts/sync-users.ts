/**
 * Creates missing logins and syncs names + permissions from scripts/data/users.ts and user-permissions.ts.
 *
 *   npx tsx --env-file=.env.local scripts/sync-users.ts           # dry run: shows what would change
 *   npx tsx --env-file=.env.local scripts/sync-users.ts --apply   # makes the changes
 *   ... --only fred@tsav.net,jessica@tsav.net                     # limit to some users
 *
 * New users get a personal sign-up link (they set their own password). Links are
 * written to .invite-links.txt (git-ignored) — never printed — for an admin to send.
 * Users who were invited but never signed in get a fresh link on each --apply.
 */
import { writeFileSync } from "node:fs";
import { createClient, type User } from "@supabase/supabase-js";
import { USER_PERMISSIONS, seedKeys } from "./data/user-permissions";
import { USERS } from "./data/users";

const apply = process.argv.includes("--apply");
const onlyArg = process.argv[process.argv.indexOf("--only") + 1];
const only = process.argv.includes("--only") && onlyArg ? new Set(onlyArg.toLowerCase().split(",")) : null;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const site = process.env.INVITE_SITE_URL ?? "https://techsquad-crm.vercel.app";
if (!url || !secret) throw new Error("Run with --env-file=.env.local (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY)");

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function allAuthUsers(): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
}

function confirmLink(hashedToken: string, type: "invite" | "recovery") {
  const next = encodeURIComponent("/auth/update-password");
  return `${site}/auth/confirm?token_hash=${hashedToken}&type=${type}&next=${next}`;
}

async function main() {
  const { data: catalogue, error: cErr } = await db.from("permissions").select("key");
  if (cErr) throw cErr;
  const known = new Set(catalogue.map((p) => p.key as string));
  for (const u of USERS) {
    const seed = USER_PERMISSIONS[u.email];
    if (!seed) throw new Error(`${u.email}: no entry in scripts/data/user-permissions.ts`);
    for (const k of seedKeys(seed)) if (!known.has(k)) throw new Error(`${u.email}: unknown permission ${k}`);
  }
  console.log(`Database: ${known.size} permission keys.`);

  const existing = new Map((await allAuthUsers()).map((u) => [u.email?.toLowerCase(), u]));
  const links: string[] = [];

  for (const u of USERS) {
    if (only && !only.has(u.email.toLowerCase())) continue;
    let authUser = existing.get(u.email.toLowerCase());
    const label = `${u.firstName} ${u.lastName} <${u.email}>`;
    const seed = USER_PERMISSIONS[u.email];
    const want = new Set(seedKeys(seed));

    if (!authUser) {
      console.log(`+ create login   ${label}`);
      if (apply) {
        const { data, error } = await db.auth.admin.generateLink({
          type: "invite",
          email: u.email,
          options: { data: { first_name: u.firstName, last_name: u.lastName } },
        });
        if (error) throw new Error(`${u.email}: ${error.message}`);
        authUser = data.user;
        links.push(`${label}\n${confirmLink(data.properties.hashed_token, "invite")}\n`);
      }
    } else if (!authUser.last_sign_in_at) {
      console.log(`~ new link       ${label} (invited, never signed in)`);
      if (apply) {
        const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email: u.email });
        if (error) throw new Error(`${u.email}: ${error.message}`);
        links.push(`${label}\n${confirmLink(data.properties.hashed_token, "recovery")}\n`);
      }
    } else {
      console.log(`= existing       ${label}`);
    }

    // Names + permissions (for a user created in a dry run there is nothing to sync yet).
    if (!authUser) {
      console.log(`    ${seed.admin ? "administrator" : `${want.size} permissions`}`);
      continue;
    }
    const [{ data: profile }, { data: current }] = await Promise.all([
      db.from("profiles").select("is_admin").eq("id", authUser.id).maybeSingle(),
      db.from("user_permissions").select("permission_key").eq("user_id", authUser.id),
    ]);
    const have = new Set((current ?? []).map((r) => r.permission_key as string));
    const add = [...want].filter((k) => !have.has(k));
    const remove = [...have].filter((k) => !want.has(k));
    if (Boolean(profile?.is_admin) !== seed.admin) console.log(`    administrator ${seed.admin ? "yes" : "no"}`);
    if (add.length) console.log(`    add          ${add.length}: ${add.slice(0, 6).join(", ")}${add.length > 6 ? ", …" : ""}`);
    if (remove.length) console.log(`    remove       ${remove.length}: ${remove.slice(0, 6).join(", ")}${remove.length > 6 ? ", …" : ""}`);

    if (apply) {
      const { error: pErr } = await db
        .from("profiles")
        .update({ first_name: u.firstName, last_name: u.lastName, is_admin: seed.admin })
        .eq("id", authUser.id);
      if (pErr) throw pErr;
      if (add.length) {
        const { error } = await db.from("user_permissions").insert(add.map((permission_key) => ({ permission_key, user_id: authUser!.id })));
        if (error) throw error;
      }
      if (remove.length) {
        const { error } = await db.from("user_permissions").delete().eq("user_id", authUser.id).in("permission_key", remove);
        if (error) throw error;
      }
    }
  }

  // Logins that exist in Supabase but are not in the list (report only; never deleted automatically).
  const listed = new Set(USERS.map((u) => u.email.toLowerCase()));
  for (const [email] of existing) if (email && !listed.has(email)) console.log(`! not in list    ${email} (left unchanged)`);

  if (apply && links.length) {
    writeFileSync(".invite-links.txt", `Sign-up links generated ${new Date().toISOString()}\n\n${links.join("\n")}`, "utf8");
    console.log(`\n${links.length} sign-up link(s) written to .invite-links.txt`);
  }
  console.log(apply ? "\nDone." : "\nDry run only — re-run with --apply to make these changes.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
