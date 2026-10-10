import type { Metadata } from "next";
import { requireClient } from "@/lib/portal/session";
import { recordsDb } from "@/lib/records/data";
import { PortalTopBar } from "@/components/portal/shell";

export const metadata: Metadata = { title: "Tech Squad · Client portal" };

/** Customer portal (F6): a customer's own view of their projects. Staff are sent back to the app. */
export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requireClient();
  const db = await recordsDb();
  const { count } = await db.from("portal_projects").select("id", { count: "exact", head: true });
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <PortalTopBar name={name} projectsHref={(count ?? 0) > 1 ? "/portal" : null} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">{children}</main>
    </div>
  );
}
