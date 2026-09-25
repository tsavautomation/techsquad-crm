import { notFound } from "next/navigation";
import { UserForm, type GroupChoice } from "@/components/admin/user-forms";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";

export const metadata = { title: "User" };

export default async function UserPage(props: PageProps<"/admin/users/[id]">) {
  const me = await requireUser();
  if (!me.permissions.has("site.admin.members")) notFound();
  const { id } = await props.params;
  const db = await recordsDb();
  const [{ data: p }, { data: g }, { data: m }] = await Promise.all([
    db.from("profiles").select("id, email, first_name, last_name, active").eq("id", id).maybeSingle(),
    db.from("groups").select("id, name, is_system, active").order("name"),
    db.from("group_members").select("group_id").eq("user_id", id),
  ]);
  if (!p) notFound();
  const groups: GroupChoice[] = ((g ?? []) as { id: number; name: string; is_system: boolean; active: boolean }[]).map((x) => ({ id: x.id, name: x.name, system: x.is_system, active: x.active }));
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">{name}</h1>
      <UserForm
        userId={p.id}
        email={p.email}
        initial={{ firstName: p.first_name ?? "", lastName: p.last_name ?? "", active: p.active, groupIds: ((m ?? []) as { group_id: number }[]).map((x) => x.group_id) }}
        groups={groups}
        can={{ edit: true, groups: me.permissions.has("site.admin.groups"), link: true }}
        isSysadmin={me.isSysadmin}
        isMe={me.id === p.id}
      />
    </div>
  );
}
