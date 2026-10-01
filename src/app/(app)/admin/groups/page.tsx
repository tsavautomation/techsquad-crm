import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Groups") };
}

type Row = { id: number; name: string; is_system: boolean; active: boolean; group_members: { count: number }[]; group_permissions: { count: number }[] };

export default async function GroupsPage() {
  const t = await getT();
  const user = await requireUser();
  if (!user.permissions.has("site.admin.groups")) notFound();
  const db = await recordsDb();
  const { data } = await db.from("groups").select("id, name, is_system, active, group_members(count), group_permissions(count)").order("name");
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("Groups")}</h1>
        <Link href="/admin/groups/new" className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-4 text-sm font-medium hover:bg-muted">
          <Plus className="size-4" aria-hidden /> {t("New group")}
        </Link>
      </div>
      <ul className="divide-y rounded-2xl border bg-card shadow-card">
        {((data ?? []) as unknown as Row[]).map((g) => (
          <li key={g.id}>
            <Link href={`/admin/groups/${g.id}`} className="block px-4 py-3 hover:bg-muted/50 active:bg-muted">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-base font-medium">{g.name}</span>
                {g.is_system && <span className="rounded bg-muted px-1.5 text-xs">built-in</span>}
                {!g.active && <span className="rounded bg-muted px-1.5 text-xs">inactive</span>}
              </span>
              <span className="block text-sm text-muted-foreground">
                {g.name === "Everyone" ? t("Every signed-in user") : t("{n} member(s)", { n: g.group_members[0]?.count ?? 0 })} · {t("{n} permissions", { n: g.group_permissions[0]?.count ?? 0 })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
