import { notFound } from "next/navigation";
import { InviteForm } from "@/components/admin/user-forms";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Invite user") };
}

export default async function InviteUserPage() {
  const t = await getT();
  const user = await requireUser();
  if (!user.permissions.has("site.admin.add_new_member")) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-2xl font-semibold">{t("Invite user")}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{t("They get an email with a link to choose their own password. Set what they may do on their page afterwards.")}</p>
      <InviteForm />
    </div>
  );
}
