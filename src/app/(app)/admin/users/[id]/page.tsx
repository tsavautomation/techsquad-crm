import { notFound } from "next/navigation";
import { PermissionChecklist, type OtherPerson } from "@/components/admin/permission-checklist";
import { UserForm } from "@/components/admin/user-forms";
import { requireUser } from "@/lib/auth/session";
import { availableChecklist } from "@/lib/permissions/checklist";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("User") };
}

type Profile = { id: string; email: string; first_name: string | null; last_name: string | null; active: boolean; is_admin: boolean };

export default async function UserPage(props: PageProps<"/admin/users/[id]">) {
  const t = await getT();
  const me = await requireUser();
  if (!me.permissions.has("site.admin.members")) notFound();
  const { id } = await props.params;
  const db = await recordsDb();
  const [{ data: p }, { data: catalogue }, { data: grants }, { data: people }, { data: signIns }] = await Promise.all([
    db.from("profiles").select("id, email, first_name, last_name, active, is_admin").eq("id", id).maybeSingle(),
    db.from("permissions").select("key"),
    db.from("user_permissions").select("user_id, permission_key"),
    db.from("profiles").select("id, email, first_name, last_name, is_admin").eq("active", true).is("contact_id", null).neq("id", id).order("first_name"),
    db.rpc("user_last_sign_in"),
  ]);
  // F11-b: a login that never signed in can be deleted for good (administrators).
  const neverSignedIn = !((signIns ?? []) as { id: string; last_sign_in_at: string | null }[]).find((r) => r.id === id)?.last_sign_in_at;
  if (!p) notFound();
  const profile = p as Profile;
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
  const sections = availableChecklist(new Set(((catalogue ?? []) as { key: string }[]).map((x) => x.key)));
  const byUser = new Map<string, string[]>();
  for (const g of (grants ?? []) as { user_id: string; permission_key: string }[]) byUser.set(g.user_id, [...(byUser.get(g.user_id) ?? []), g.permission_key]);
  const others: OtherPerson[] = ((people ?? []) as Omit<Profile, "active">[]).map((o) => ({
    id: o.id,
    name: [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email,
    isAdmin: o.is_admin,
    keys: byUser.get(o.id) ?? [],
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-20">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{name}</h1>
      <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-3 text-[15px] font-semibold tracking-tight">{t("Login")}</h2>
        <UserForm userId={profile.id} email={profile.email} initial={{ firstName: profile.first_name ?? "", lastName: profile.last_name ?? "", active: profile.active }} can={{ edit: true, link: true, delete: me.isSysadmin && neverSignedIn }} isMe={me.id === profile.id} />
      </section>
      <PermissionChecklist key={profile.id} userId={profile.id} initialAdmin={profile.is_admin} initialKeys={byUser.get(profile.id) ?? []} sections={sections} others={others} canEdit={me.isSysadmin} isMe={me.id === profile.id} />
    </div>
  );
}
