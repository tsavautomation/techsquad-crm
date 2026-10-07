import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, FileText, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { formatDate, todayET } from "@/lib/dates";
import { pathOf } from "@/lib/files/paths";
import { fileUrls } from "@/lib/files/store";
import { recordsDb } from "@/lib/records/data";
import { addDays } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { recordHref, tableHref } from "@/registry/routes";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

// F23 Documents board (Fred 2026-10-07, the old CRM's "WIKI"): the company's papers grouped by
// category, each a card with its file. Adding and editing go through the ordinary record form.

export async function generateMetadata() {
  return { title: (await getT())("Documents") };
}

type Doc = { id: number; title: string | null; category: string | null; expires_on: string | null; notes: string | null };
type Att = { record_id: number; provider: string; provider_path: string; file_name: string; mime_type: string | null };

export default async function DocumentsPage(props: PageProps<"/administrative/documents">) {
  const user = await requireUser();
  const t = getTable("company_documents");
  if (!canOpen(user.permissions, t, getTable)) notFound();
  const tr = await getT();
  const db = await recordsDb();
  const sp = (await props.searchParams) as { archived?: string };
  const archived = sp.archived === "1";
  let q = db.from(t.name).select("id, title, category, expires_on, notes").is("deleted_at", null).order("title");
  q = archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  const { data } = await q;
  const docs = (data ?? []) as Doc[];
  const { data: files } = docs.length ? await db.from("attachments").select("record_id, provider, provider_path, file_name, mime_type").eq("table_name", t.name).eq("field", "file").in("record_id", docs.map((d) => d.id)).is("deleted_at", null) : { data: [] };
  const atts = (files ?? []) as Att[];
  const urls = atts.length ? await fileUrls(db, atts.map(pathOf)) : new Map<string, string>();
  const filesOf = (id: number) => atts.filter((a) => a.record_id === id).map((a) => ({ name: a.file_name, url: urls.get(pathOf(a)) ?? "", image: (a.mime_type ?? "").startsWith("image/") }));

  // Categories in the form's order (Form settings may add more); anything unknown goes under Other at the end.
  const options = t.fields.find((f) => f.name === "category")?.options ?? [];
  const groups = [...options.map((o) => ({ value: o.value, label: o.label, color: o.color })), ...[...new Set(docs.map((d) => d.category ?? ""))].filter((c) => !options.some((o) => o.value === c)).map((c) => ({ value: c, label: c || "Other", color: undefined as string | undefined }))]
    .map((g) => ({ ...g, docs: docs.filter((d) => (d.category ?? "") === g.value) }))
    .filter((g) => g.docs.length);
  const today = todayET();
  const soon = addDays(today, 30);
  const canAdd = canDo(user.permissions, t, "create", getTable);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Documents")}</h1>
          <p className="text-xs text-muted-foreground">{tr("The company's licences, insurance certificates and other papers, in one place.")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={archived ? tableHref(t) : `${tableHref(t)}?archived=1`} className="text-[13px] text-text-2 underline underline-offset-2">
            {archived ? tr("Current documents") : tr("Archived")}
          </Link>
          {canAdd && (
            <Link href={`${tableHref(t)}/new?back=${encodeURIComponent(tableHref(t))}`} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95">
              <Plus className="size-4" aria-hidden /> {tr("New Document")}
            </Link>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-2xl border bg-card px-[18px] py-4 text-sm text-muted-foreground shadow-card">{archived ? tr("No archived documents.") : tr("No documents yet. Add the first one with New Document.")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section key={g.value} className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                <span className="inline-block size-2.5 rounded-full" style={{ background: g.color ?? "#6b7280" }} aria-hidden />
                {tr(g.label)} <span className="font-normal text-muted-foreground">({g.docs.length})</span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.docs.map((d) => {
                  const expired = Boolean(d.expires_on && d.expires_on < today);
                  const expiring = Boolean(d.expires_on && !expired && d.expires_on <= soon);
                  const list = filesOf(d.id);
                  return (
                    <li key={d.id} className={cn("flex flex-col gap-2 rounded-xl border p-3", expired ? "border-bad-fg/40 bg-bad-bg/30" : expiring ? "border-warn-fg/40 bg-warn-bg/30" : "")}>
                      <Link href={recordHref(t, d.id)} className="text-sm font-semibold hover:underline">
                        {d.title || tr("Document #{id}", { id: d.id })}
                      </Link>
                      {list.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                          {list.map((f, i) => (
                            <li key={i}>
                              <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[13px] hover:bg-muted">
                                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                <span className="truncate">{f.name}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-warn-fg">{tr("No file attached.")}</p>
                      )}
                      {d.expires_on && (
                        <p className={cn("flex items-center gap-1 text-xs", expired ? "font-semibold text-bad-fg" : expiring ? "font-semibold text-warn-fg" : "text-text-2")}>
                          <CalendarClock className="size-3.5" aria-hidden />
                          {expired ? tr("Expired {date}", { date: formatDate(d.expires_on) }) : tr("Expires {date}", { date: formatDate(d.expires_on) })}
                        </p>
                      )}
                      {d.notes && <p className="line-clamp-2 text-xs text-text-2">{d.notes}</p>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
