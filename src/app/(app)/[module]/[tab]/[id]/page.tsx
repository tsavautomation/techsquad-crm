import { Fragment } from "react";
import { BackLink } from "@/components/shell/back-link";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { MASK } from "@/lib/crypto";
import { formatDateTime } from "@/lib/dates";
import { getRecord, recordsDb, userNames } from "@/lib/records/data";
import { loadRecord } from "@/lib/records/load";
import type { FileItem } from "@/lib/records/values";
import { evaluateRules, type Values } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { canDo, canLockAction, canOpen } from "@/registry/permissions";
import { recordHref, tableFromRoute, tableHref } from "@/registry/routes";
import type { FieldDef, TableDef } from "@/registry/types";
import { FieldValue } from "@/components/records/field-value";
import { FileGallery } from "@/components/records/file-gallery";
import { SensitiveValue } from "@/components/records/sensitive-value";
import { RecordToolbar } from "@/components/records/record-toolbar";
import { WorkflowPanel, type WorkflowPanelData } from "@/components/records/workflow-panel";
import { ChecklistPanel, FilesPod, NotesPanel, OpenFromLink } from "@/components/records/record-panels";
import { HistoryList, RelatedList, Section, SubListTable } from "@/components/records/record-sections";
import { canModule, loadChecklist, loadHistory, loadNotes, loadPeople, loadPodFiles, loadRelated, loadSubLists, type ModuleAction } from "@/lib/records/extras";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getLang, getT } from "@/i18n/server";
import { ReturnCardPanel, VisitFieldPanel } from "@/components/field-day/record-panels";
import { localized } from "@/i18n/registry";
import { MessagePanel } from "@/components/contact/message-panel";
import { PartnerStats } from "@/components/contact/partner-stats";
import { PerformancePanel } from "@/components/performance/performance-panel";
import { DeficiencyPanel } from "@/components/reports/deficiency-panel";
import { EmployeeDeficiencies } from "@/components/reports/employee-deficiencies";
import { PendingItems } from "@/components/project/pending-items";
import { SiteHistory } from "@/components/project/site-history";
import { ProposedVisitPanel } from "@/components/schedule/proposed-visit-panel";
import { RealityPanel } from "@/components/reports/reality-panel";
import { ScorecardPanel } from "@/components/reports/scorecard-panel";
import { ProjectHours } from "@/components/project/project-hours";
import { JobCosting } from "@/components/project/job-costing";
import { StockLevels } from "@/components/product/stock-levels";
import { PayRatePanel } from "@/components/employee/pay-rate-panel";
import { Timeline } from "@/components/contact/timeline";
import { loadMessagePanel } from "@/lib/messages/load";
import { loadTimeline } from "@/lib/records/timeline";


export async function generateMetadata(props: PageProps<"/[module]/[tab]/[id]">) {
  const { module, tab, id } = await props.params;
  const t = tableFromRoute(module, tab);
  const tr = await getT();
  const row = t && Number.isInteger(Number(id)) ? await getRecord(t, Number(id)) : null;
  return { title: row?.title ?? (t ? `${tr(t.itemLabel)} #${id}` : tr("Not found")) };
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default async function RecordPage(props: PageProps<"/[module]/[tab]/[id]">) {
  const tr = await getT();
  const { module, tab, id } = await props.params;
  const t = localized(tableFromRoute(module, tab), await getLang());
  const recordId = Number(id);
  if (!t || !Number.isInteger(recordId)) notFound();
  const user = await requireUser();
  if (!canOpen(user.permissions, t, getTable)) notFound();

  const rec = await loadRecord(t, recordId, user.permissions);
  if (!rec) notFound();
  const { row, values, labels } = rec;
  const { visible } = evaluateRules(t, values);
  const [names, computed] = await Promise.all([userNames([row], ["created_by", "updated_by"]), computedValues(t, recordId)]);

  const locked = row.locked === true;
  const perms = user.permissions;
  const canEdit = canDo(perms, t, "modify", getTable) && (!locked || canLockAction(perms, t, "modify_locked", getTable));
  // Fields kept off the form (old Pending 1–5, check-in times…) only show once they hold something;
  // a heading on a skipped field moves to the next field shown.
  const fields: FieldDef[] = [];
  let carry: string | undefined;
  for (const f of t.fields) {
    if (!visible.has(f.name) || (t.parent && f.name === t.parent.field)) continue;
    if ((f.formHidden && isBlank(values[f.name])) || (f.requires && !user.isSysadmin && !perms.has(f.requires))) {
      carry ??= f.heading;
      continue;
    }
    fields.push(carry && !f.heading ? { ...f, heading: carry } : f);
    carry = undefined;
  }

  // Record features (SPEC §1.3), each gated by WebAuthor's module permissions (SPEC §7.4).
  const db = await recordsDb();
  const [may, related, subLists] = await Promise.all([
    Promise.all(
      (["activity_history_view", "activity_history_add", "notes_allow_delete", "notes_allow_delete_of_my_notes", "files_view_files_pod", "files_add_new", "files_allow_delete", "audit_log"] as const).map(
        async (a) => [a, await canModule(perms, t, a)] as const,
      ),
    ).then((pairs) => Object.fromEntries(pairs) as Record<ModuleAction, boolean>),
    loadRelated(t, recordId, perms),
    loadSubLists(t, recordId, perms),
  ]);
  const [notes, checklist, podFiles, history, people] = await Promise.all([
    may.activity_history_view ? loadNotes(db, t, recordId) : Promise.resolve([]),
    loadChecklist(db, t, recordId),
    may.files_view_files_pod ? loadPodFiles(db, t, recordId) : Promise.resolve([]),
    may.audit_log ? loadHistory(db, t, recordId) : Promise.resolve([]),
    loadPeople(db), // notes' @tags and the checklist's "assign to" (F11-a)
    // Opening the record clears my tags on it from the alerts bell.
    db.from("record_mentions").update({ seen_at: new Date().toISOString() }).eq("user_id", user.id).eq("table_name", t.name).eq("record_id", recordId).is("seen_at", null),
  ]);
  const canModify = canDo(perms, t, "modify", getTable);
  // F4: contact log, message templates and the client timeline on Projects and Contacts.
  const client = t.detailAddon === "project" || t.detailAddon === "contact" ? t.name as "projects" | "contacts" : null;
  const [{ data: workflow }, messages, timeline] = await Promise.all([
    db.rpc("workflow_panel", { p_table: t.name, p_id: recordId }),
    client ? loadMessagePanel(db, user, client, recordId) : Promise.resolve(null),
    client ? loadTimeline(db, perms, client, recordId) : Promise.resolve(null),
  ]);

  // Phones: one column — header, workflow, add-on cards, toolbar, fields, sections (flex `order`).
  // Wide screens (xl): toolbar and fields on the left; workflow, cards and sections stacked on the right.
  // The column wrappers are `contents` on phones, so every block is ordered by the outer flex column.
  return (
    <div className="mx-auto max-w-[1600px]">
      <BackLink fallback={tableHref(t)} label={t.label} />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold break-words">{row.title ?? `${t.itemLabel} #${row.id}`}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>#{row.id}</span>
            {locked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                <Lock className="size-3" aria-hidden /> {tr("Submitted")}
              </span>
            )}
            {row.archived_at ? <span className="rounded-full bg-muted px-2 py-0.5">{tr("Archived")}</span> : null}
          </p>
        </div>
        {canEdit && (
          <Link href={`${recordHref(t, row.id)}/edit`} className={cn(buttonVariants(), "h-11 shrink-0 gap-1.5 px-4")}>
            <Pencil className="size-4" aria-hidden /> {tr("Edit")}
          </Link>
        )}
      </div>

      <div className="flex flex-col xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-start xl:gap-6">
      <div className="contents xl:col-start-2 xl:row-start-1 xl:block">
      {workflow && <WorkflowPanel table={t.name} id={recordId} data={workflow as WorkflowPanelData} />}
      {t.detailAddon === "visit" && row.status === "Proposed" && (
        <ProposedVisitPanel
          visitId={recordId}
          canDecide={canModify}
          reportId={typeof row.proposed_from_report_id === "number" ? row.proposed_from_report_id : null}
          missing={t.fields.filter((f) => f.required && f.name !== "status" && (row[f.name] === null || row[f.name] === undefined || row[f.name] === "")).map((f) => f.label)}
        />
      )}
      {t.detailAddon === "visit" && <VisitFieldPanel visitId={recordId} />}
      {t.detailAddon === "visit" && <RealityPanel table="visits" id={recordId} />}
      {t.detailAddon === "task" && <ReturnCardPanel taskId={recordId} />}
      {t.detailAddon === "organization" && <PartnerStats orgId={recordId} user={user} />}
      {t.detailAddon === "employee" && <PerformancePanel employeeId={recordId} user={user} />}
      {t.detailAddon === "employee" && <ScorecardPanel employeeId={recordId} user={user} />}
      {t.detailAddon === "employee" && <EmployeeDeficiencies employeeId={recordId} user={user} />}
      {t.detailAddon === "deficiency" && <DeficiencyPanel id={recordId} status={String(row.status ?? "")} canExcuse={canModify} />}
      {t.detailAddon === "project" && <SiteHistory projectId={recordId} user={user} />}
      {t.detailAddon === "project" && <PendingItems projectId={recordId} user={user} />}
      {t.name === "job_reports" && <RealityPanel table="job_reports" id={recordId} />}
      {t.detailAddon === "project" && <ProjectHours projectId={recordId} user={user} />}
      {t.detailAddon === "project" && <JobCosting projectId={recordId} user={user} />}
      {t.detailAddon === "employee" && <PayRatePanel employeeId={recordId} user={user} />}
      {t.detailAddon === "product" && <StockLevels productId={recordId} user={user} />}
      <div className="order-3 mt-6 flex flex-col gap-3 xl:mt-0">
        {messages && (messages.templates.length > 0 || messages.canLog) && (
          <Section id="message" title={client === "projects" ? tr("Contact the client") : tr("Contact")} open>
            <MessagePanel data={messages} projectId={client === "projects" ? recordId : null} />
          </Section>
        )}
        {timeline && (
          <Section id="timeline" title={tr("Timeline")} count={timeline.length} open={timeline.length > 0}>
            <Timeline items={timeline} />
          </Section>
        )}
        {subLists.map((s) => (
          <Section key={s.table.name} title={s.table.label} count={s.rows.length} open>
            <SubListTable list={s} baseHref={recordHref(t, recordId)} />
          </Section>
        ))}
        {related.length > 0 && (
          <Section title={tr("Related records")} count={related.reduce((n, r) => n + r.count, 0)} open>
            <RelatedList items={related} />
          </Section>
        )}
        <Section id="checklist" title={tr("Checklist")} count={checklist.filter((c) => !c.completed_at).length} open={checklist.some((c) => !c.completed_at)}>
          <ChecklistPanel
            table={t.name}
            id={recordId}
            people={people}
            items={checklist.map((c) => ({ ...c, canDelete: c.created_by === user.id || canModify }))}
          />
        </Section>
        <OpenFromLink />
        {may.activity_history_view && (
          <Section id="notes" title={tr("Notes")} count={notes.length}>
            <NotesPanel
              table={t.name}
              id={recordId}
              canAdd={may.activity_history_add}
              people={people}
              meId={user.id}
              notes={notes.map((n) => ({ ...n, canDelete: may.notes_allow_delete || (n.created_by === user.id && may.notes_allow_delete_of_my_notes) }))}
            />
          </Section>
        )}
        {may.files_view_files_pod && (
          <Section title={tr("Files")} count={podFiles.length}>
            <FilesPod table={t.name} id={recordId} files={podFiles} canAdd={may.files_add_new} canRemove={may.files_allow_delete} />
          </Section>
        )}
        {may.audit_log && (
          <Section title={tr("History")} count={history.length}>
            <HistoryList table={t} entries={history} recordId={recordId} canUndo={canEdit} />
          </Section>
        )}
      </div>
      </div>

      <div className="contents xl:col-start-1 xl:row-start-1 xl:block">
      <div className="order-2">
      <RecordToolbar
        table={t.name}
        id={recordId}
        listHref={tableHref(t)}
        locked={locked}
        archived={Boolean(row.archived_at)}
        can={{
          submit: Boolean(t.submit?.showButton) && canModify,
          lock: canLockAction(perms, t, "lock_unlock", getTable),
          archive: canDo(perms, t, "archive", getTable),
          delete: canDo(perms, t, "delete", getTable) && (!locked || canLockAction(perms, t, "delete_locked", getTable)),
        }}
      />

      <dl className="divide-y overflow-hidden rounded-2xl border bg-card shadow-card xl:grid xl:grid-cols-2 xl:divide-y-0">
        {fields.map((f) => (
          <Fragment key={f.name}>
            {f.heading && <h2 className="bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase xl:col-span-2 xl:border-b">{f.heading}</h2>}
            <div className={cn("grid gap-1 px-4 py-3 sm:grid-cols-3 sm:gap-4 xl:border-b", WIDE_TYPES.has(f.type) && "xl:col-span-2")}>
              <dt className="text-sm text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0 text-sm break-words sm:col-span-2">
                <DetailValue field={f} value={f.type === "computed" ? computed[f.name] : values[f.name]} labels={labels[f.name] ?? {}} />
              </dd>
            </div>
          </Fragment>
        ))}
      </dl>
      </div>
      </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {tr("Created {when}", { when: formatDateTime(String(row.created_at)) })}
        {row.created_by ? ` ${tr("by {who}", { who: names.get(row.created_by as string) ?? tr("someone") })}` : ""} · {tr("Modified {when}", { when: formatDateTime(String(row.updated_at)) })}
        {row.updated_by ? ` ${tr("by {who}", { who: names.get(row.updated_by as string) ?? tr("someone") })}` : ""}
      </p>
    </div>
  );
}

/** Field types that take the whole row when the fields sit in two columns (wide screens). */
const WIDE_TYPES = new Set<FieldDef["type"]>(["textarea", "richtext", "file", "image", "signature", "address"]);

const isBlank = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** Computed fields: Projects › Approved / Invoiced / Paid (SPEC §2.3) and Visits (SPEC §9.1 F9-d). */
async function computedValues(t: TableDef, id: number): Promise<Values> {
  const comps = t.fields.filter((f) => f.type === "computed");
  if (!comps.length) return {};
  const db = await recordsDb();
  const out: Values = {};
  if (comps.some((f) => f.computed?.kind === "sum")) {
    const { data } = await db.rpc("project_financials", { p_project_ids: [id] });
    Object.assign(out, ((data as Values[] | null) ?? [])[0] ?? {});
  }
  const days = comps.filter((f) => f.computed?.kind === "visit_days");
  if (days.length) {
    const { data } = await db.rpc("project_visit_days", { p_project_ids: [id] });
    for (const f of days) out[f.name] = ((data as { visit_days: number }[] | null) ?? [])[0]?.visit_days ?? 0;
  }
  return out;
}

function DetailValue({ field: f, value, labels }: { field: FieldDef; value: unknown; labels: Record<string, string> }) {
  const none = <span className="text-muted-foreground">—</span>;

  if (f.type === "computed") return <>{f.computed?.kind === "visit_days" ? Number(value ?? 0) : money.format(Number(value ?? 0))}</>;

  if (f.type === "file" || f.type === "image" || f.type === "signature") {
    const files = (value as FileItem[] | undefined) ?? [];
    if (!files.length) return none;
    return <FileGallery files={files} signature={f.type === "signature"} />;
  }

  if ((f.type === "lookup" || f.type === "group") && f.multiple) {
    const ids = (value as number[] | undefined) ?? [];
    if (!ids.length) return none;
    const target = f.type === "lookup" && f.lookup ? getTable(f.lookup.table) : undefined;
    return (
      <ul className="flex flex-wrap gap-1.5">
        {ids.map((x) => (
          <li key={x} className="rounded-full border px-2.5 py-0.5 text-xs">
            {target?.tab ? (
              <Link href={recordHref(target, x)} className="hover:underline">
                {labels[String(x)] ?? `#${x}`}
              </Link>
            ) : (
              (labels[String(x)] ?? `#${x}`)
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (f.type === "lookup" || f.type === "user") {
    if (value === null || value === undefined) return none;
    const target = f.type === "lookup" && f.lookup ? getTable(f.lookup.table) : undefined;
    const href = target && (target.tab || target.module === "utility") ? recordHref(target, value as number) : undefined;
    return <FieldValue field={f} value={value} display={labels[String(value)]} href={href} />;
  }

  if (f.type === "richtext") {
    if (!value) return none;
    // Sanitised on save (lib/records/save.ts), so it is safe to render as HTML.
    return <div className="prose prose-sm max-w-none break-words [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: String(value) }} />;
  }

  if (f.type === "ssn" || f.type === "ein") {
    if (!value) return none;
    const d = String(value).replace(/\D/g, "");
    const formatted = f.type === "ssn" ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : `${d.slice(0, 2)}-${d.slice(2)}`;
    if (f.sensitive) return value === MASK ? <span className="tracking-widest">{MASK}</span> : <SensitiveValue value={formatted} />;
    return <>{formatted}</>;
  }

  if (f.sensitive && !f.shownInClear && typeof value === "string" && value && value !== MASK) return <SensitiveValue value={value} />;
  return <FieldValue field={f} value={value} />;
}
