import Link from "next/link";
import { MODULES } from "@/config/modules";
import { ModuleIcon } from "@/components/shell/module-icon";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
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
    </div>
  );
}
