import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ADMIN_SCREENS, canSeeScreen } from "@/lib/admin/screens";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await requireUser();
  const screens = ADMIN_SCREENS.filter((s) => canSeeScreen(s, user.permissions, user.isSysadmin));
  if (!screens.length) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold">Admin</h1>
      <ul className="divide-y rounded-xl border">
        {screens.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="flex min-h-16 items-center justify-between gap-3 px-4 py-2 hover:bg-muted/50 active:bg-muted">
              <span>
                <span className="block text-base font-medium">{s.title}</span>
                <span className="block text-sm text-muted-foreground">{s.description}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
