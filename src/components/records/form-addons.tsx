"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/dates";
import type { Values } from "@/lib/rules/evaluate";
import { visitConflictsAction, visitContextAction, type Conflict, type VisitContext } from "@/lib/schedule/actions";
import { useT } from "@/i18n/client";

const maps = (a: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
const waze = (a: string) => `https://waze.com/ul?q=${encodeURIComponent(a)}&navigate=yes`;
const parking = (a: string) => maps(`parking near ${a}`);

/** Visit form (F1): project warnings and links, double-booking check, parking notes from the last visit. */
export function VisitAddon({ form, recordId, setMany }: { form: Values; recordId: number | null; setMany: (v: Values) => void }) {
  const tr = useT();
  const projectId = typeof form.project_id === "number" ? form.project_id : null;
  const [ctx, setCtx] = useState<{ id: number; data: VisitContext | null } | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const filled = useRef<number | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    void visitContextAction(projectId).then((data) => {
      if (!live) return;
      setCtx({ id: projectId, data });
      // New visit, empty parking notes: offer what the last visit to this project said.
      if (!recordId && data?.lastAccessNotes && !form.access_notes && filled.current !== projectId) {
        filled.current = projectId;
        setMany({ access_notes: data.lastAccessNotes });
      }
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the project changes
  }, [projectId]);

  const people = [form.technician_id, ...((form.team_ids as number[] | null) ?? [])].filter((x): x is number => typeof x === "number");
  const key = JSON.stringify([people, form.starts_at, form.duration]);
  useEffect(() => {
    const start = typeof form.starts_at === "string" ? form.starts_at : null;
    if (!start || !people.length) return;
    let live = true;
    const t = setTimeout(() => void visitConflictsAction(people, start, Number(form.duration ?? 60), recordId).then((c) => live && setConflicts(c)), 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers the inputs
  }, [key]);

  const info = projectId && ctx?.id === projectId ? ctx.data : null;
  const shownConflicts = people.length && form.starts_at ? conflicts : [];
  if (!info && !shownConflicts.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {shownConflicts.map((c) => (
        <p key={`${c.visitId}-${c.who}`} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {tr("{who} already has", { who: c.who })}{" "}
          <Link href={`/schedule/visits/${c.visitId}`} className="underline underline-offset-2">
            {c.title}
          </Link>{" "}
          {tr("from {start} to {end}.", { start: formatDateTime(c.start), end: formatDateTime(c.end).split(" ").slice(1).join(" ") })}
        </p>
      ))}
      {info?.delinquent && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{tr("This client is marked Delinquent. Check with accounting before sending a tech.")}</p>}
      {info && !info.address && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{tr("This project has no job address, so maps won't work. Add it on the project.")}</p>}
      {info?.address && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="w-full text-muted-foreground">{info.address}</span>
          {[
            ["Google Maps", maps(info.address)],
            ["Waze", waze(info.address)],
            [tr("Parking nearby"), parking(info.address)],
          ].map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-lg border px-3 hover:bg-muted">
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
