import Link from "next/link";
import { notFound } from "next/navigation";
import { SharedAlertsEditor } from "@/components/admin/shared-alerts-editor";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { loadSharedAlerts } from "@/lib/requests/load";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Shared alerts") };
}

/** F26-c (Fred 2026-10-21): who gets the project request alerts. One clear clears it for everyone. */
export default async function SharedAlertsPage() {
  const tr = await getT();
  const user = await requireUser();
  if (!user.isSysadmin && !user.permissions.has("projects.module.design_design")) notFound();
  const db = await recordsDb();
  const [settings, { data }] = await Promise.all([loadSharedAlerts(db), db.from("profiles").select("id, email, first_name, last_name, active, contact_id").is("contact_id", null).order("first_name")]);
  const people = ((data ?? []) as { id: string; email: string; first_name: string | null; last_name: string | null; active: boolean }[])
    .filter((p) => p.active || settings.request_recipient_emails.includes(p.email.toLowerCase()))
    .map((p) => ({ email: p.email.toLowerCase(), name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email }));

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin" className="underline underline-offset-4">
          {tr("Admin")}
        </Link>
      </p>
      <h1 className="mb-1 text-2xl font-semibold">{tr("Shared alerts")}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{tr("Project requests (RFIs, change orders) ring in the bell of everyone ticked here. Whoever clears one clears it for everyone; the request line keeps who read, acknowledged or cleared it and when.")}</p>
      <SharedAlertsEditor people={people} initial={settings.request_recipient_emails} />
    </div>
  );
}
