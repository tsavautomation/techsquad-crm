"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { assignProjectAction, ignoreVisitAction, searchProjectsAction, type ProjectHit } from "@/lib/google/actions";
import { clock } from "@/lib/schedule/dates";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type OrphanVisit = { id: number; title: string; start: string | null; notes: string | null; technician: string | null; status: string | null; fromGoogle: boolean };
type Props = { visits: OrphanVisit[]; total: number; page: number; pageSize: number; q: string; canEdit: boolean; canDelete: boolean };

const when = (start: string | null) => {
  if (!start) return "";
  const [y, m, d] = start.slice(0, 10).split("-").map(Number);
  return `${m}/${d}/${y} ${clock(start.slice(11, 16))}`;
};

/** One row: the visit as Google described it, a project search box, Not a job. */
function Row({ v, canEdit, canDelete }: { v: OrphanVisit; canEdit: boolean; canDelete: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProjectHit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(async () => setHits(q.trim().length < 2 ? [] : await searchProjectsAction(q)), 250);
    return () => clearTimeout(id);
  }, [q]);

  const assign = (p: ProjectHit) =>
    start(async () => {
      const r = await assignProjectAction(v.id, p.id);
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Visit put on {project}", { project: p.title }));
      setOpen(false);
      router.refresh();
    });
  const ignore = () =>
    start(async () => {
      if (!confirm(t("Remove this visit from the CRM? The Google event stays as it is."))) return;
      const r = await ignoreVisitAction(v.id);
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Visit removed"));
      router.refresh();
    });

  return (
    <li className={cn("flex flex-col gap-2 px-3 py-2.5 md:flex-row md:items-start md:gap-4", pending && "opacity-60")}>
      <div className="min-w-0 md:w-[42%]">
        <Link href={`/schedule/visits/${v.id}`} className="block truncate text-sm font-medium underline-offset-4 hover:underline">
          {v.title}
        </Link>
        <p className="text-xs text-text-2">
          {when(v.start)}
          {v.technician ? ` · ${v.technician}` : ""}
          {v.status && v.status !== "Done" ? ` · ${t(v.status)}` : ""}
        </p>
        {v.notes && <p className="truncate text-xs text-muted-foreground">{v.notes}</p>}
      </div>
      {canEdit && (
        <div className="relative min-w-0 grow">
          <div className="flex h-11 items-center gap-2 rounded-[10px] border bg-card px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              className="min-w-0 grow bg-transparent text-base outline-none md:text-sm"
              placeholder={t("Type the project's name…")}
              aria-label={t("Project for visit {id}", { id: v.id })}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
          </div>
          {open && hits.length > 0 && (
            <ul className="absolute left-0 right-0 top-12 z-20 max-h-64 overflow-auto rounded-[10px] border bg-card py-1 shadow-md">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => assign(h)}>
                    <span className="text-sm">{h.title}</span>
                    {h.address && <span className="text-xs text-text-2">{h.address}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {canDelete && (
        <button type="button" className="inline-flex h-11 shrink-0 items-center rounded-[10px] border px-3 text-sm font-medium hover:bg-muted" disabled={pending} onClick={ignore}>
          {t("Not a job")}
        </button>
      )}
    </li>
  );
}

export function NeedsProjectList({ visits, total, page, pageSize, q, canEdit, canDelete }: Props) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState(q);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => `/schedule/needs-project?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  return (
    <div>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/schedule/needs-project${text.trim() ? `?q=${encodeURIComponent(text.trim())}` : ""}`);
        }}
      >
        <input className="h-11 min-w-0 grow rounded-[10px] border bg-card px-3 text-base md:max-w-sm md:text-sm" placeholder={t("Search these visits…")} value={text} onChange={(e) => setText(e.target.value)} aria-label={t("Search")} />
        <button type="submit" className="inline-flex h-11 items-center rounded-[10px] border px-4 text-sm font-medium hover:bg-muted">
          {t("Search")}
        </button>
      </form>
      <p className="mb-2 text-sm text-text-2">{total ? t("{n} visits without a project", { n: total }) : t("Every visit has its project.")}</p>
      {visits.length > 0 && (
        <ul className="divide-y rounded-2xl border bg-card shadow-card">
          {visits.map((v) => (
            <Row key={v.id} v={v} canEdit={canEdit} canDelete={canDelete} />
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav className="mt-3 flex items-center gap-2 text-sm" aria-label={t("Pages")}>
          {page > 1 && (
            <Link href={href(page - 1)} className="inline-flex h-10 items-center rounded-lg border px-3 hover:bg-muted">
              {t("Previous")}
            </Link>
          )}
          <span className="text-text-2">{t("Page {a} of {b}", { a: page, b: pages })}</span>
          {page < pages && (
            <Link href={href(page + 1)} className="inline-flex h-10 items-center rounded-lg border px-3 hover:bg-muted">
              {t("Next")}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
