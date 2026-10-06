"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveFieldDayAction } from "@/lib/field-day/actions";
import type { FieldDaySettings } from "@/lib/field-day/day";
import { currentPosition } from "@/lib/time-clock/geo-client";
import { useT } from "@/i18n/client";

// Admin › Field day (F2): one screen, one Save.

type Option = { value: string; label: string };
const BOX = "w-full rounded-lg border bg-card px-3 text-base";
const lines = (s: string) => s.split(/\r?\n/);

export function FieldDayEditor({ initial, people, reasons, services }: { initial: FieldDaySettings; people: { id: number; name: string }[]; reasons: Option[]; services: Option[] }) {
  const t = useT();
  const [s, setS] = useState<FieldDaySettings>(initial);
  const [text, setText] = useState(() => Object.fromEntries(services.map((o) => [o.value, { checklist: (initial.service_lists[o.value]?.checklist ?? []).join("\n"), tools: (initial.service_lists[o.value]?.tools ?? []).join("\n") }])));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tc, setTc] = useState(initial.time_clock);
  const [locating, setLocating] = useState(false);

  const save = () =>
    start(async () => {
      const service_lists = { ...s.service_lists };
      for (const [k, v] of Object.entries(text)) service_lists[k] = { checklist: lines(v.checklist), tools: lines(v.tools) };
      const r = await saveFieldDayAction({ ...s, service_lists, time_clock: tc });
      setMsg(r.ok ? { ok: true, text: t("Saved.") } : { ok: false, text: t(r.message) });
    });

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="mb-1 font-semibold">{t("Return cards")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("When a Job Report says Partial or Not done, a task goes to this person with the missing items as its checklist.")}</p>
        <label className="block text-sm font-medium">
          {t("Who schedules returns")}
          <select className={`${BOX} mt-1 h-11`} value={s.scheduler_employee_id ?? ""} onChange={(e) => setS({ ...s, scheduler_employee_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{t("Nobody (the card is only on the Tasks board)")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {s.scheduler_employee_id && !people.some((p) => p.id === s.scheduler_employee_id) && <option value={s.scheduler_employee_id}>{t("Employee #{id} (not imported yet)", { id: s.scheduler_employee_id })}</option>}
          </select>
        </label>
        <h3 className="mt-4 mb-2 text-sm font-medium">{t("Days until the card is due, by reason")}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {reasons.map((r) => (
            <label key={r.value} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-sm">
              {r.label}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={90}
                className="h-10 w-20 rounded-md border bg-card px-2 text-right text-base"
                value={s.return_days[r.value] ?? 3}
                onChange={(e) => setS({ ...s, return_days: { ...s.return_days, [r.value]: Math.max(0, Math.min(90, Number(e.target.value) || 0)) } })}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="mb-1 font-semibold">{t("Time clock")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("Where the office is (for “at the office”), the normal start of the day, and when people are reminded to clock out.")}</p>
        <label className="block text-sm font-medium">
          {t("Office address")}
          <input className={`${BOX} mt-1 h-11`} value={tc.office_address} onChange={(e) => setTc({ ...tc, office_address: e.target.value, office_lat: null, office_lng: null })} placeholder="123 Main St, Miami, FL 33101" />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-50"
            disabled={locating}
            onClick={() => {
              setLocating(true);
              void currentPosition().then((g) => {
                setLocating(false);
                if (!g) return setMsg({ ok: false, text: t("Couldn't read this phone's location. Allow location for this site and try again.") });
                setTc({ ...tc, office_lat: Math.round(g.lat * 1e6) / 1e6, office_lng: Math.round(g.lng * 1e6) / 1e6 });
              });
            }}
          >
            {locating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MapPin className="size-4" aria-hidden />} {t("I'm at the office now: use this phone's location")}
          </button>
          <span className="text-muted-foreground">{tc.office_lat !== null && tc.office_lng !== null ? t("Position set ({lat}, {lng})", { lat: tc.office_lat, lng: tc.office_lng }) : t("No position yet: the address is looked up when you save.")}</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            {t("Counts as “there” within (metres)")}
            <input type="number" inputMode="numeric" min={50} max={2000} className={`${BOX} mt-1 h-11`} value={tc.radius_m} onChange={(e) => setTc({ ...tc, radius_m: Math.max(50, Math.min(2000, Number(e.target.value) || 150)) })} />
          </label>
          <label className="block text-sm font-medium">
            {t("Normal start of the day")}
            <input type="time" className={`${BOX} mt-1 h-11`} value={tc.start_time} onChange={(e) => setTc({ ...tc, start_time: e.target.value || "08:00" })} />
          </label>
          <label className="block text-sm font-medium">
            {t("Clock-out reminder, field people")}
            <input type="time" className={`${BOX} mt-1 h-11`} value={tc.reminder.Field} onChange={(e) => setTc({ ...tc, reminder: { ...tc.reminder, Field: e.target.value || "17:00" } })} />
          </label>
          <label className="block text-sm font-medium">
            {t("Clock-out reminder, office people")}
            <input type="time" className={`${BOX} mt-1 h-11`} value={tc.reminder.Office} onChange={(e) => setTc({ ...tc, reminder: { ...tc.reminder, Office: e.target.value || "18:00" } })} />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("Each employee's group (Field / Office) is on their Employee record.")}</p>
        <h3 className="mt-4 text-sm font-semibold">{t("Forgotten check-outs")}</h3>
        <p className="mb-2 text-xs text-muted-foreground">{t("After midnight, anyone still on site or clocked in is checked out at this time and sees a red warning the next morning.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            {t("Automatic check-out time")}
            <input type="time" className={`${BOX} mt-1 h-11`} value={tc.auto_checkout.time} onChange={(e) => setTc({ ...tc, auto_checkout: { ...tc.auto_checkout, time: e.target.value || "16:00" } })} />
          </label>
          <label className="block text-sm font-medium">
            {t("Later time for the people below")}
            <input type="time" className={`${BOX} mt-1 h-11`} value={tc.auto_checkout.late_time} onChange={(e) => setTc({ ...tc, auto_checkout: { ...tc.auto_checkout, late_time: e.target.value || "17:00" } })} />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {people.map((p) => {
            const on = tc.auto_checkout.late_employee_ids.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => setTc({ ...tc, auto_checkout: { ...tc.auto_checkout, late_employee_ids: on ? tc.auto_checkout.late_employee_ids.filter((id) => id !== p.id) : [...tc.auto_checkout.late_employee_ids, p.id] } })}
                className={`h-9 rounded-full border px-3 text-[13px] ${on ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground"}`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="mb-1 font-semibold">{t("Per service type")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("The checklist is added to a visit when the tech checks in; the tools show on the visit as “Bring”. One per line.")}</p>
        {services.length === 0 ? (
          <p className="text-sm">
            {t("There are no service types yet.")}{" "}
            <Link href="/admin/forms/visits" className="underline underline-offset-4">
              {t("Add them in Form settings › Visits › Service type.")}
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {services.map((o) => (
              <fieldset key={o.value} className="rounded-xl border p-3">
                <legend className="px-1 text-sm font-semibold">{o.label}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["checklist", "tools"] as const).map((k) => (
                    <label key={k} className="block text-sm">
                      {k === "checklist" ? t("Checklist") : t("Tools to bring")}
                      <textarea
                        rows={5}
                        className={`${BOX} mt-1 py-2`}
                        value={text[o.value]?.[k] ?? ""}
                        onChange={(e) => setText({ ...text, [o.value]: { ...{ checklist: "", tools: "" }, ...text[o.value], [k]: e.target.value } })}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="mb-1 font-semibold">{t("Report rule")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {t("Every visit someone checked in or out of needs a Job Report from each person who went. At 9 PM the people still missing one get an SMS; after midnight the missing ones become deficiencies, and a report filed later counts as Late. Dry run only writes the log: nothing is sent and nothing is recorded.")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            {t("Mode")}
            <select className={`${BOX} mt-1 h-11`} value={s.report_rule.mode} onChange={(e) => setS({ ...s, report_rule: { ...s.report_rule, mode: e.target.value as FieldDaySettings["report_rule"]["mode"] } })}>
              <option value="off">{t("Off")}</option>
              <option value="dry_run">{t("Dry run (log only)")}</option>
              <option value="live">{t("Live (SMS and deficiencies)")}</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            {t("First visit date it applies to")}
            <input type="date" className={`${BOX} mt-1 h-11`} value={s.report_rule.since ?? ""} onChange={(e) => setS({ ...s, report_rule: { ...s.report_rule, since: e.target.value || null } })} />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("Without a start date every past visit counts, including the thousands imported from Google Calendar. Set the day you switch the rule on.")}</p>
        <h3 className="mt-4 mb-2 text-sm font-medium">{t("Report vs. reality")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            {t("Minutes of difference before a mismatch is flagged")}
            <input type="number" inputMode="numeric" min={5} max={240} className={`${BOX} mt-1 h-11`} value={s.report_rule.threshold_min} onChange={(e) => setS({ ...s, report_rule: { ...s.report_rule, threshold_min: Number(e.target.value) || 30 } })} />
          </label>
          <label className="block text-sm font-medium">
            {t("Grace for parking, added to the estimated drive (minutes)")}
            <input type="number" inputMode="numeric" min={0} max={120} className={`${BOX} mt-1 h-11`} value={s.report_rule.grace_min} onChange={(e) => setS({ ...s, report_rule: { ...s.report_rule, grace_min: Number(e.target.value) || 0 } })} />
          </label>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:border-0 md:p-0">
        <Button type="button" className="h-11 flex-1 md:flex-none md:px-8" onClick={save} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Save")}
        </Button>
        {msg && (
          <p role="status" className={msg.ok ? "text-sm text-ok-fg" : "text-sm text-destructive"}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
