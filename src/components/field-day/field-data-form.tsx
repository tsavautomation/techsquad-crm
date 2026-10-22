"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, toDateTimeLocalET } from "@/lib/dates";
import { removeFieldEntryAction, setAttendanceAction, type FieldTimes } from "@/lib/field-day/field-data-actions";
import { formatDistance } from "@/lib/time-clock/clock";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// J-n + F29: the office's "Field data" card on a visit. One block per person on the visit with their three times
// (local Eastern), each with Clear and its own Save; the visit's status follows from the team (shown, not edited).
// Below, the time-clock entries behind the times, with Remove. Phones first: one column, 44 px controls.

export type FieldEntry = { id: number; kind: string; at: string; place: string; distance_m: number | null; lat: number | null; lng: number | null; who: string };
export type FieldPerson = { employeeId: number; name: string; times: FieldTimes };
type Local = { on_way_at: string; checked_in_at: string; checked_out_at: string };

const TIME_LABEL: Record<keyof Local, string> = { on_way_at: "On my way", checked_in_at: "Checked in", checked_out_at: "Checked out" };
const KIND_LABEL: Record<string, string> = { on_way: "On my way", visit_in: "Checked in", visit_out: "Checked out", clock_in: "Clock in", clock_out: "Clock out" };
const BOX = "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const BTN = "inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold disabled:opacity-60";

const toLocal = (iso: string | null) => (iso ? toDateTimeLocalET(iso).slice(0, 16) : "");

export function FieldDataForm({ visitId, status, people, entries }: { visitId: number; status: string; people: FieldPerson[]; entries: FieldEntry[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<number | null>(null);

  const remove = (id: number) => {
    setRemoving(id);
    start(async () => {
      const r = await removeFieldEntryAction(visitId, id);
      if (!r.ok) toast.error(t(r.message));
      setRemoving(null);
      router.refresh();
    });
  };

  return (
    <section className="mb-4 rounded-2xl border bg-card px-4 py-3 shadow-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left" aria-expanded={open}>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Wrench className="size-4 text-muted-foreground" aria-hidden /> {t("Field data (office)")}
        </span>
        <span className="text-xs text-muted-foreground">{open ? t("Hide") : t("Correct times or positions")}</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm">
            {t("Visit status: {status}", { status: t(status) })}
          </p>
          {people.length === 0 ? <p className="text-sm text-muted-foreground">{t("Nobody is on this visit.")}</p> : people.map((p) => <PersonTimes key={p.employeeId} visitId={visitId} person={p} />)}
          <p className="text-xs text-muted-foreground">{t("Per person: On my way, Checked in and Checked out. Clearing a time also removes that person's time-clock entry. Times are Eastern.")}</p>
          <h3 className="mt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("Time-clock entries on this visit")}</h3>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("None.")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {t(KIND_LABEL[e.kind] ?? e.kind)} · {formatDateTime(e.at)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {e.who} · {t(e.place)}
                      {formatDistance(e.distance_m) ? ` · ${formatDistance(e.distance_m)}` : ""}
                      {e.lat !== null && e.lng !== null && (
                        <>
                          {" · "}
                          <a href={`https://www.google.com/maps?q=${e.lat},${e.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline">
                            <MapPin className="size-3" aria-hidden /> {t("Map")}
                          </a>
                        </>
                      )}
                    </span>
                  </span>
                  <button type="button" onClick={() => remove(e.id)} disabled={pending} aria-label={t("Remove")} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive">
                    {removing === e.id && pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function PersonTimes({ visitId, person }: { visitId: number; person: FieldPerson }) {
  const t = useT();
  const router = useRouter();
  const [local, setLocal] = useState<Local>({ on_way_at: toLocal(person.times.on_way_at), checked_in_at: toLocal(person.times.checked_in_at), checked_out_at: toLocal(person.times.checked_out_at) });
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await setAttendanceAction(visitId, person.employeeId, { on_way_at: local.on_way_at || null, checked_in_at: local.checked_in_at || null, checked_out_at: local.checked_out_at || null });
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Field data saved."));
      router.refresh();
    });
  return (
    <fieldset className="rounded-xl border p-3">
      <legend className="px-1 text-sm font-semibold">{person.name}</legend>
      <div className="flex flex-col gap-2">
        {(Object.keys(TIME_LABEL) as (keyof Local)[]).map((k) => (
          <div key={k} className="text-sm font-medium">
            {t(TIME_LABEL[k])}
            <div className="mt-1 flex gap-2">
              <input type="datetime-local" value={local[k]} onChange={(e) => setLocal((l) => ({ ...l, [k]: e.target.value }))} className={BOX} aria-label={`${person.name}: ${t(TIME_LABEL[k])}`} />
              <button type="button" onClick={() => setLocal((l) => ({ ...l, [k]: "" }))} disabled={!local[k]} className={cn(BTN, "shrink-0 border bg-card hover:bg-muted")}>
                {t("Clear")}
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={save} disabled={pending} className={cn(BTN, "bg-primary text-primary-foreground hover:brightness-95")}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} {t("Save {name}", { name: person.name })}
        </button>
      </div>
    </fieldset>
  );
}
