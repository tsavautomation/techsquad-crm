import { notFound } from "next/navigation";
import { Tiles } from "@/components/shell/tiles";
import { ADMIN_SCREENS, canSeeScreen } from "@/lib/admin/screens";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Admin") };
}

export default async function AdminPage() {
  const t = await getT();
  const user = await requireUser();
  const screens = ADMIN_SCREENS.filter((s) => canSeeScreen(s, user.permissions, user.isSysadmin));
  if (!screens.length) notFound();
  return (
    <div className="mx-auto max-w-[960px]">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("Admin")}</h1>
      <p className="mb-4 text-[12.5px] text-muted-foreground">{t("People, permissions, forms, files and automations")}</p>
      <Tiles items={screens.map((s) => ({ href: s.href, title: s.title, subtitle: s.description, icon: s.href === "/admin/forms" ? "form-settings" : s.href.split("/").pop()! }))} />
    </div>
  );
}
