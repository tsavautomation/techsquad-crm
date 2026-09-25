import Link from "next/link";
import { notFound } from "next/navigation";
import { PermissionMatrix, type Perm } from "@/components/admin/permission-matrix";
import { usedPermissionKeys } from "@/lib/admin/permission-usage";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";

export const metadata = { title: "Permissions" };

type Group = { id: number; name: string; slug: string; active: boolean };

/** Editable permission matrix, one group at a time (PLAN M12). System Administrators only. */
export default async function PermissionsPage(props: PageProps<"/admin/permissions">) {
  const me = await requireUser();
  if (!me.isSysadmin) notFound();
  const { group } = (await props.searchParams) as { group?: string };
  const db = await recordsDb();
  const { data: g } = await db.from("groups").select("id, name, slug, active").order("name");
  const groups = ((g ?? []) as Group[]).filter((x) => x.slug !== "system_administrators");
  const current = groups.find((x) => String(x.id) === group) ?? groups.find((x) => x.slug === "everyone")!;
  const everyoneId = groups.find((x) => x.slug === "everyone")?.id;

  const [{ data: catalogue }, { data: grants }] = await Promise.all([
    db.from("permissions").select("key, module, area, kind, label, description").order("module").order("area").order("kind").order("label"),
    db.from("group_permissions").select("group_id, permission_key").in("group_id", [current.id, everyoneId ?? current.id]),
  ]);
  const used = usedPermissionKeys();
  const perms: Perm[] = ((catalogue ?? []) as Omit<Perm, "used">[]).map((p) => ({ ...p, used: used.has(p.key) }));
  const rows = (grants ?? []) as { group_id: number; permission_key: string }[];
  const granted = rows.filter((r) => r.group_id === current.id).map((r) => r.permission_key);
  const viaEveryone = current.id === everyoneId ? [] : rows.filter((r) => r.group_id === everyoneId).map((r) => r.permission_key);

  return (
    <div className="mx-auto max-w-3xl pb-20">
      <h1 className="text-2xl font-semibold">Permissions</h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        What each group may see and do. A person gets everything from all their groups plus Everyone. System Administrators always have everything.
      </p>
      <nav aria-label="Groups" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {groups.map((x) => (
          <Link
            key={x.id}
            href={`/admin/permissions?group=${x.id}`}
            className={`shrink-0 rounded-full border px-3 py-2 text-sm ${x.id === current.id ? "border-foreground bg-foreground text-background" : "hover:bg-muted"} ${x.active ? "" : "opacity-60"}`}
          >
            {x.name}
          </Link>
        ))}
      </nav>
      <PermissionMatrix key={current.id} groupId={current.id} groupName={current.name} perms={perms} granted={granted} viaEveryone={viaEveryone} />
    </div>
  );
}
