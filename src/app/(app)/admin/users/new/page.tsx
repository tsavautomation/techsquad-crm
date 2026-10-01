import { notFound } from "next/navigation";
import { InviteForm, type GroupChoice } from "@/components/admin/user-forms";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Invite user") };
}

export default async function InviteUserPage() {
  const t = await getT();
  const user = await requireUser();
  if (!user.permissions.has("site.admin.add_new_member")) notFound();
  const db = await recordsDb();
  const { data } = await db.from("groups").select("id, name, is_system, active").order("name");
  const groups: GroupChoice[] = ((data ?? []) as { id: number; name: string; is_system: boolean; active: boolean }[]).map((g) => ({ id: g.id, name: g.name, system: g.is_system, active: g.active }));
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-2xl font-semibold">{t("Invite user")}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{t("They get an email with a link to choose their own password.")}</p>
      <InviteForm groups={groups} canSetGroups={user.permissions.has("site.admin.groups")} isSysadmin={user.isSysadmin} />
    </div>
  );
}
