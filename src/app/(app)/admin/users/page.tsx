import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";

export const metadata = { title: "Users" };

type Row = { id: string; email: string; first_name: string | null; last_name: string | null; active: boolean; group_members: { groups: { name: string } | null }[] };

export default async function UsersPage(props: PageProps<"/admin/users">) {
  const user = await requireUser();
  const canList = user.permissions.has("site.admin.members");
  const canInvite = user.permissions.has("site.admin.add_new_member");
  if (!canList && !canInvite) notFound();
  const { q, show } = (await props.searchParams) as { q?: string; show?: string };

  const db = await recordsDb();
  const [{ data }, { data: signIns }] = await Promise.all([
    db.from("profiles").select("id, email, first_name, last_name, active, group_members(groups(name))").order("first_name"),
    db.rpc("user_last_sign_in"),
  ]);
  const lastSeen = new Map(((signIns ?? []) as { id: string; last_sign_in_at: string | null }[]).map((r) => [r.id, r.last_sign_in_at]));
  const term = (q ?? "").trim().toLowerCase();
  const rows = ((data ?? []) as unknown as Row[])
    .filter((r) => show === "all" || r.active)
    .filter((r) => !term || `${r.first_name ?? ""} ${r.last_name ?? ""} ${r.email}`.toLowerCase().includes(term));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Users</h1>
        {canInvite && (
          <Link href="/admin/users/new" className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-foreground bg-foreground px-4 text-sm font-medium text-background">
            <UserPlus className="size-4" aria-hidden /> Invite
          </Link>
        )}
      </div>
      {canList ? (
        <>
          <form className="mb-3 flex gap-2">
            <input name="q" defaultValue={q} placeholder="Search name or email" className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="show" value="all" defaultChecked={show === "all"} className="size-5" /> Inactive too
            </label>
            <button className="h-11 rounded-lg border px-3 text-sm">Go</button>
          </form>
          <ul className="divide-y rounded-xl border">
            {rows.map((r) => {
              const seen = lastSeen.get(r.id);
              return (
                <li key={r.id}>
                  <Link href={`/admin/users/${r.id}`} className="block px-4 py-3 hover:bg-muted/50 active:bg-muted">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-base font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || r.email}</span>
                      {!r.active && <span className="rounded bg-muted px-1.5 text-xs">inactive</span>}
                      {r.active && lastSeen.size > 0 && !seen && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">never signed in</span>}
                    </span>
                    <span className="block text-sm text-muted-foreground">{r.email}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.group_members.map((m) => m.groups?.name).filter(Boolean).join(", ") || "No groups"}
                      {seen && ` · last sign-in ${formatDateTime(seen)}`}
                    </span>
                  </Link>
                </li>
              );
            })}
            {!rows.length && <li className="px-4 py-3 text-sm text-muted-foreground">No users match.</li>}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">You can invite people, but not see the user list.</p>
      )}
    </div>
  );
}
