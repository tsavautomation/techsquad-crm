/**
 * Creates missing logins and syncs names + group memberships from scripts/data/users.ts.
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
import { USERS } from "./data/users";
import { GROUPS } from "./lib/permissions-map";

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
  const known = new Set(GROUPS.map((g) => g.slug));
  for (const u of USERS) for (const g of u.groups) if (!known.has(g)) throw new Error(`${u.email}: unknown group ${g}`);

  const { data: groups, error: gErr } = await db.from("groups").select("id, slug");
  if (gErr) throw gErr;
  const groupId = new Map(groups.map((g) => [g.slug, g.id as number]));
  console.log(`Database: ${groups.length} groups.`);

  const existing = new Map((await allAuthUsers()).map((u) => [u.email?.toLowerCase(), u]));
  const links: string[] = [];

  for (const u of USERS) {
    if (only && !only.has(u.email.toLowerCase())) continue;
    let authUser = existing.get(u.email.toLowerCase());
    const label = `${u.firstName} ${u.lastName} <${u.email}>`;

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

    // Names + groups (for a user created in a dry run there is nothing to sync yet).
    if (!authUser) {
      console.log(`    groups → ${u.groups.join(", ")}`);
      continue;
    }
    const { data: current } = await db.from("group_members").select("group_id").eq("user_id", authUser.id);
    const have = new Set((current ?? []).map((r) => r.group_id as number));
    const want = new Set(u.groups.map((g) => groupId.get(g)!));
    const add = [...want].filter((id) => !have.has(id));
    const remove = [...have].filter((id) => !want.has(id));
    const slug = (id: number) => groups.find((g) => g.id === id)?.slug;
    if (add.length) console.log(`    add to       ${add.map(slug).join(", ")}`);
    if (remove.length) console.log(`    remove from  ${remove.map(slug).join(", ")}`);

    if (apply) {
      const { error: pErr } = await db
        .from("profiles")
        .update({ first_name: u.firstName, last_name: u.lastName })
        .eq("id", authUser.id);
      if (pErr) throw pErr;
      if (add.length) {
        const { error } = await db.from("group_members").insert(add.map((group_id) => ({ group_id, user_id: authUser!.id })));
        if (error) throw error;
      }
      if (remove.length) {
        const { error } = await db.from("group_members").delete().eq("user_id", authUser.id).in("group_id", remove);
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
