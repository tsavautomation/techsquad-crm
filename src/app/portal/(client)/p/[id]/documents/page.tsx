import { FileText } from "lucide-react";
import { requireClient } from "@/lib/portal/session";
import { filesFor, portalFileHref, projectDocuments } from "@/lib/portal/data";
import { recordsDb } from "@/lib/records/data";
import { Empty, PortalCard } from "@/components/portal/shell";
import { getT } from "@/i18n/server";

/** Documents the office picked for this customer: manuals, guides, warranty terms, signed forms. */
export default async function DocumentsPage({ params }: PageProps<"/portal/p/[id]">) {
  await requireClient();
  const { id } = await params;
  const t = await getT();
  const db = await recordsDb();
  const docs = await projectDocuments(db, Number(id));
  const files = await filesFor(db, "portal_documents", docs.map((d) => d.id));
  const groups = Map.groupBy(docs, (d) => d.category ?? "");

  return (
    <div className="flex flex-col gap-4">
      {docs.length === 0 && <Empty>{t("No documents shared yet.")}</Empty>}
      {[...groups.entries()].map(([category, list]) => (
        <PortalCard key={category} title={category ? t(category) : t("Documents")}>
          <ul className="divide-y">
            {list.map((d) => {
              const f = (files.get(d.id) ?? [])[0];
              const inner = (
                <>
                  <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{d.title}</p>
                    {d.notes && <p className="text-xs text-muted-foreground">{d.notes}</p>}
                  </div>
                </>
              );
              return (
                <li key={d.id}>
                  {f ? (
                    <a href={portalFileHref(f.id)} target="_blank" rel="noopener" className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 hover:bg-muted/50">
                      {inner}
                    </a>
                  ) : (
                    <div className="flex items-start gap-3 py-3">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </PortalCard>
      ))}
    </div>
  );
}
