import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupForm } from "@/components/admin/user-forms";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";

export const metadata = { title: "Group" };

type Member = { profiles: { id: string; email: string; first_name: string | null; last_name: string | null; active: boolean } | null };

/** /admin/groups/new creates a group; /admin/groups/<id> edits one and lists its members. */
export default async function GroupPage(props: PageProps<"/admin/groups/[id]">) {
  const me = await requireUser();
  if (!me.permissions.has("site.admin.groups")) notFound();
  const { id } = await props.params;
  if (id === "new")
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="mb-4 text-2xl font-semibold">New group</h1>
        <GroupForm groupId={null} initial={{ name: "", active: true }} editable />
        <p className="mt-4 text-sm text-muted-foreground">A new group has no permissions until a System Administrator grants them on the Permissions screen.</p>
      </div>
    );

  const groupId = Number(id);
  if (!Number.isInteger(groupId)) notFound();
  const db = await recordsDb();
  const [{ data: g }, { data: members }] = await Promise.all([
    db.from("groups").select("id, name, is_system, active").eq("id", groupId).maybeSingle(),
    db.from("group_members").select("profiles(id, email, first_name, last_name, active)").eq("group_id", groupId),
  ]);
  if (!g) notFound();
  const people = ((members ?? []) as unknown as Member[]).map((m) => m.profiles).filter((p) => p !== null);
  people.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">{g.name}</h1>
      <GroupForm groupId={g.id} initial={{ name: g.name, active: g.active }} editable={!g.is_system || me.isSysadmin} />
      {me.isSysadmin && (
        <p className="mt-4 text-sm">
          <Link href={`/admin/permissions?group=${g.id}`} className="underline underline-offset-4">
            Edit this group&apos;s permissions
          </Link>
        </p>
      )}
      <h2 className="mt-8 mb-2 text-lg font-semibold">Members</h2>
      {g.name === "Everyone" ? (
        <p className="text-sm text-muted-foreground">Every signed-in user is in this group automatically.</p>
      ) : (
        <>
          <ul className="divide-y rounded-xl border">
            {people.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/users/${p.id}`} className="block px-4 py-3 hover:bg-muted/50">
                  <span className="text-base">{[p.first_name, p.last_name].filter(Boolean).join(" ") || p.email}</span>
                  {!p.active && <span className="ml-2 rounded bg-muted px-1.5 text-xs">inactive</span>}
                  <span className="block text-sm text-muted-foreground">{p.email}</span>
                </Link>
              </li>
            ))}
            {!people.length && <li className="px-4 py-3 text-sm text-muted-foreground">No members.</li>}
          </ul>
          <p className="mt-2 text-sm text-muted-foreground">To add or remove someone, open the person under Users and tick their groups.</p>
        </>
      )}
    </div>
  );
}
