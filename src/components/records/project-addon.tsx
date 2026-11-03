"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ownerProjectsAction } from "@/lib/projects/actions";
import type { Values } from "@/lib/rules/evaluate";
import { useT } from "@/i18n/client";

type Owned = Awaited<ReturnType<typeof ownerProjectsAction>>;

/**
 * PJ-b item 3: once the Job Owner is picked on a new project, the projects that client already has are listed
 * under the form ("Mario Marchionno has 3 properties"), so the office sees them before creating another one.
 */
export function ProjectAddon({ form, recordId }: { form: Values; recordId: number | null }) {
  const t = useT();
  const ownerId = typeof form.job_owner_id === "number" ? form.job_owner_id : null;
  const [owned, setOwned] = useState<{ id: number; rows: Owned } | null>(null);
  useEffect(() => {
    if (!ownerId) return;
    let live = true;
    void ownerProjectsAction(ownerId).then((rows) => live && setOwned({ id: ownerId, rows }));
    return () => {
      live = false;
    };
  }, [ownerId]);
  const rows = ownerId && owned?.id === ownerId ? owned.rows.filter((r) => r.id !== recordId) : [];
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl border bg-muted/40 px-4 py-3 text-sm">
      <p className="font-medium">{t(rows.length === 1 ? "This client already has 1 project" : "This client already has {n} projects", { n: rows.length })}</p>
      <ul className="mt-1 grid gap-0.5 text-[13px]">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={r.href} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">
              {r.title}
            </Link>
            <span className="text-text-2">
              {r.address ? ` · ${r.address}` : ""}
              {r.job_status ? ` · ${t(r.job_status)}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-text-2">{t("Another address for the same client is fine; the same address would be a duplicate.")}</p>
    </div>
  );
}
