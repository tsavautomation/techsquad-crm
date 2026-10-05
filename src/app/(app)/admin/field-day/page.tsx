import Link from "next/link";
import { notFound } from "next/navigation";
import { FieldDayEditor } from "@/components/admin/field-day-editor";
import { ReportRuleStatus } from "@/components/admin/report-rule-status";
import { requireUser } from "@/lib/auth/session";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Field day") };
}

/** F2 settings (SPEC §9.1 F2-c, F2-d): who receives return cards, due days, lists per service type. */
export default async function FieldDayPage() {
  const tr = await getT();
  const user = await requireUser(); // also loads Form settings, so the option lists are current
  if (!user.permissions.has("projects.module.design_design")) notFound();
  const db = await recordsDb();
  const [settings, { data: emp }] = await Promise.all([loadFieldDay(db), db.from("employees").select("id, title, status").is("deleted_at", null).order("title")]);
  const live = (name: string, table: string) => (getTable(table).fields.find((f) => f.name === name)?.options ?? []).filter((o) => !o.retired).map((o) => ({ value: o.value, label: o.label }));
  const people = ((emp ?? []) as { id: number; title: string | null; status: string | null }[]).filter((e) => e.status !== "Inactive" || e.id === settings.scheduler_employee_id).map((e) => ({ id: e.id, name: e.title ?? `#${e.id}` }));

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin" className="underline underline-offset-4">
          {tr("Admin")}
        </Link>
      </p>
      <h1 className="mb-1 text-2xl font-semibold">{tr("Field day")}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{tr("Return cards for visits that weren't finished, and what each service type needs.")}</p>
      <FieldDayEditor initial={settings} people={people} reasons={live("partial_reason", "job_reports")} services={live("service_type", "visits")} />
      <div className="mt-6">
        <ReportRuleStatus db={db} />
      </div>
    </div>
  );
}
