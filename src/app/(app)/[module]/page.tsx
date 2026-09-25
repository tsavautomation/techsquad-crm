import { notFound } from "next/navigation";
import { findModule, MODULES } from "@/config/modules";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function generateStaticParams() {
  return MODULES.map((m) => ({ module: m.slug }));
}

export default async function ModulePage(props: PageProps<"/[module]">) {
  const { module: slug } = await props.params;
  const mod = findModule(slug);
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
