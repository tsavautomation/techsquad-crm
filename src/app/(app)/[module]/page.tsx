import { notFound } from "next/navigation";
import { visibleModules } from "@/config/modules";
import { requireUser } from "@/lib/auth/session";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ModulePage(props: PageProps<"/[module]">) {
  const { module: slug } = await props.params;
  const user = await requireUser();
  // A module the user can't see is treated as not found, so it doesn't reveal what exists.
  const mod = visibleModules(user.permissions).find((m) => m.slug === slug);
  if (!mod) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-2xl font-semibold">{mod.title}</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {mod.tabs.map((tab) => (
          <li key={tab.slug}>
            <Card>
              <CardHeader>
                <CardTitle>{tab.title}</CardTitle>
                <CardDescription>List and forms arrive in milestone M5.</CardDescription>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
