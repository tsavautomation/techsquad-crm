import Link from "next/link";
import { visibleModules } from "@/config/modules";
import { requireUser } from "@/lib/auth/session";
import { ModuleIcon } from "@/components/shell/module-icon";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const user = await requireUser();
  const modules = visibleModules(user.permissions);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-2xl font-semibold">Dashboard</h1>
      {modules.length === 0 ? (
        <p className="text-muted-foreground">
          You don&apos;t have access to any modules yet. Ask an administrator to add you to a group.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <Link key={m.slug} href={`/${m.slug}`} className="rounded-xl focus-visible:outline-2">
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ModuleIcon name={m.icon} className="size-5" />
                    {m.title}
                  </CardTitle>
                  <CardDescription>{m.tabs.map((t) => t.title).join(" · ")}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <p className="mt-6 text-sm">
        <Link href="/lists" className="underline underline-offset-4">
          Lists
        </Link>{" "}
        <span className="text-muted-foreground">: Brands, Suppliers, Knowledge Base Categories</span>
      </p>
      {user.permissions.has("projects.module.design_design") && (
        <p className="mt-2 text-sm">
          <Link href="/admin/catalogue" className="underline underline-offset-4">
            Field catalogue
          </Link>{" "}
          <span className="text-muted-foreground">: every table, field and rule carried over from WebAuthor</span>
        </p>
      )}
      {user.permissions.has("projects.module.design_triggers") && (
        <p className="mt-2 text-sm">
          <Link href="/admin/automations" className="underline underline-offset-4">
            Automations
          </Link>{" "}
          <span className="text-muted-foreground">: what runs when records change, the run log and sent emails</span>
        </p>
      )}
    </div>
  );
}
