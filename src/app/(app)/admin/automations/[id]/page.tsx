import Link from "next/link";
import { notFound } from "next/navigation";
import { AutomationEditor, type FieldMeta } from "@/components/admin/automation-editor";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import type { AutomationInput } from "@/lib/engine/automation-schema";
import { recordsDb } from "@/lib/records/data";
import { REGISTRY } from "@/registry";
import type { TableDef } from "@/registry/types";

export const metadata = { title: "Automation" };

const SYSTEM_FIELDS: FieldMeta[] = [
  { name: "submitted_at", label: "Date Submitted", type: "datetime" },
  { name: "created_at", label: "Date Created", type: "datetime" },
  { name: "updated_at", label: "Date Modified", type: "datetime" },
];

function fieldsFor(t: TableDef): FieldMeta[] {
  return [
    ...t.fields
      .filter((f) => !f.sensitive && f.type !== "richtext")
      .map((f) => ({ name: f.name, label: f.label, type: f.type, options: f.options?.map((o) => ({ label: o.label, value: o.value })), lookup: Boolean(f.lookup) })),
    ...(t.submit ? SYSTEM_FIELDS : SYSTEM_FIELDS.slice(1)),
  ];
}

/** /admin/automations/<id> edits one; /admin/automations/new?table=<name> creates one. */
export default async function AutomationPage(props: PageProps<"/admin/automations/[id]">) {
  const me = await requireUser();
  if (!me.permissions.has("projects.module.design_triggers") && !me.isSysadmin) notFound();
  const { id } = await props.params;
  const { table: tableParam } = (await props.searchParams) as { table?: string };
  const db = await recordsDb();

  if (id === "new") {
    const t = REGISTRY.find((x) => x.name === tableParam && !x.parent);
    if (!t)
      return (
        <div className="mx-auto max-w-xl">
          <h1 className="mb-4 text-2xl font-semibold">New automation</h1>
          <p className="mb-2 text-sm text-muted-foreground">Which kind of record is it about?</p>
          <ul className="divide-y rounded-xl border">
            {REGISTRY.filter((x) => !x.parent && x.module !== "utility").map((x) => (
              <li key={x.name}>
                <Link href={`/admin/automations/new?table=${x.name}`} className="flex min-h-12 items-center px-4 hover:bg-muted/50">
                  {x.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      );
    const initial: AutomationInput = { title: "", active: true, events: ["added"], conditions: { match: "all", rules: [] }, actions: [], notes: null };
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 text-2xl font-semibold">New {t.label} automation</h1>
        <AutomationEditor id={null} table={t.name} tableLabel={t.label} fields={fieldsFor(t)} initial={initial} editable={me.isSysadmin} />
      </div>
    );
  }

  const autoId = Number(id);
  if (!Number.isInteger(autoId)) notFound();
  const [{ data }, { data: runs }] = await Promise.all([
    db.from("automations").select("*").eq("id", autoId).maybeSingle(),
    db.from("automation_runs").select("id, record_id, event, status, detail, at").eq("automation_id", autoId).order("id", { ascending: false }).limit(20),
  ]);
  if (!data) notFound();
  const t = REGISTRY.find((x) => x.name === data.table_name);
  if (!t) notFound();
  const initial = { title: data.title, active: data.active, events: data.events, conditions: data.conditions, actions: data.actions, notes: data.notes } as unknown as AutomationInput;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin/automations" className="underline underline-offset-4">
          Automations
        </Link>{" "}
        · {t.label} · #{autoId}
      </p>
      <h1 className="mb-4 text-2xl font-semibold">{data.title}</h1>
      {!me.isSysadmin && <p className="mb-4 text-sm text-muted-foreground">Only System Administrators can change automations.</p>}
      <AutomationEditor id={autoId} table={t.name} tableLabel={t.label} fields={fieldsFor(t)} initial={initial} editable={me.isSysadmin} />

      <h2 className="mt-8 mb-2 text-lg font-semibold">Recent runs</h2>
      {!runs?.length ? (
        <p className="text-sm text-muted-foreground">It hasn&apos;t run yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border text-sm">
          {(runs as { id: number; record_id: number; event: string; status: string; detail: { actions?: string[]; error?: string }; at: string }[]).map((r) => (
            <li key={r.id} className="p-3">
              <span className="text-xs text-muted-foreground">{formatDateTime(r.at)}</span>
              <span className={`block ${r.status === "error" ? "text-destructive" : ""}`}>
                {t.itemLabel} #{r.record_id} · {r.event} · {r.status === "error" ? r.detail.error : r.detail.actions?.join("; ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
