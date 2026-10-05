import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { TestSmsForm } from "@/components/admin/test-sms-form";
import { formatDateTime } from "@/lib/dates";
import { LATE_AUTOMATION_ID, RULE_AUTOMATION_ID } from "@/lib/reports/rule-run";
import { smsConfigured, smsTestMode } from "@/lib/sms/twilio";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

// Admin › Field day › Report rule: what the nightly jobs did (dry run or live), the last SMS, and the
// people whose phone number is missing or unusable (F18-c).

type Run = { id: number; event: string; status: string; at: string; detail: { date?: string; dry_run?: boolean; actions?: string[]; error?: string; skipped?: { employee_id: number; name: string; reason: string; phone: string | null; project: string }[] } };
type Sms = { id: string; to_number: string; status: string; error: string | null; created_at: string; test_mode: boolean; employee_id: number | null };

export async function ReportRuleStatus({ db }: { db: SupabaseClient }) {
  const tr = await getT();
  const [{ data: runs }, { data: sms }] = await Promise.all([
    db.from("automation_runs").select("id, event, status, at, detail").in("automation_id", [RULE_AUTOMATION_ID, LATE_AUTOMATION_ID]).order("at", { ascending: false }).limit(12),
    db.from("sms_outbox").select("id, to_number, status, error, created_at, test_mode, employee_id").order("created_at", { ascending: false }).limit(10),
  ]);
  const list = (runs ?? []) as Run[];
  const lastReminders = list.find((r) => r.event === "reminders");
  const bad = (lastReminders?.detail.skipped ?? []).filter((s) => s.reason === "no_phone" || s.reason === "bad_phone");
  const empT = getTable("employees");
  const EVENT: Record<string, string> = { reminders: "9 PM reminders", close: "Midnight close", late: "Late report" };

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-card">
      <h2 className="mb-1 font-semibold">{tr("Report rule: what happened")}</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {smsConfigured() ? (smsTestMode() ? tr("Twilio is set up. SMS test mode is on: every message goes to the test number.") : tr("Twilio is set up and messages go to the technicians' phones.")) : tr("Twilio is not set up yet: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are missing, so SMS stay queued.")}
      </p>
      {bad.length > 0 && (
        <div className="mb-3 rounded-[10px] bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          <p className="font-medium">{tr("No usable phone number on the Employee card:")}</p>
          <ul className="mt-1 list-disc pl-5">
            {bad.map((b) => (
              <li key={`${b.employee_id}-${b.project}`}>
                <Link href={recordHref(empT, b.employee_id)} className="underline underline-offset-2">
                  {b.name}
                </Link>{" "}
                {b.phone ? tr("has \"{phone}\", which is not a mobile number.", { phone: b.phone }) : tr("has no phone number.")}
              </li>
            ))}
          </ul>
        </div>
      )}
      <h3 className="mb-1 text-[13px] font-semibold">{tr("Last runs")}</h3>
      {!list.length ? (
        <p className="mb-3 text-sm text-muted-foreground">{tr("Nothing has run yet. The first run comes at 9:01 PM Eastern once the mode is Dry run or Live.")}</p>
      ) : (
        <ul className="mb-3 divide-y rounded-lg border text-sm">
          {list.map((r) => (
            <li key={r.id} className="p-2.5">
              <div className="flex flex-wrap justify-between gap-x-3">
                <span className="font-medium">
                  {tr(EVENT[r.event] ?? r.event)}
                  {r.detail.date ? ` · ${r.detail.date}` : ""}
                  {r.detail.dry_run ? ` · ${tr("dry run")}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">{formatDateTime(r.at)}</span>
              </div>
              <p className={r.status === "error" ? "text-bad-fg" : "text-muted-foreground"}>{r.status === "error" ? r.detail.error : r.detail.actions?.join("; ")}</p>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mb-1 text-[13px] font-semibold">{tr("Last SMS")}</h3>
      {!sms?.length ? (
        <p className="mb-3 text-sm text-muted-foreground">{tr("No SMS yet.")}</p>
      ) : (
        <ul className="mb-3 divide-y rounded-lg border text-sm">
          {(sms as Sms[]).map((m) => (
            <li key={m.id} className="flex flex-wrap justify-between gap-x-3 p-2.5">
              <span>
                {m.to_number}
                {m.test_mode ? ` · ${tr("test")}` : ""} · <span className={m.status === "failed" ? "text-bad-fg" : m.status === "sent" ? "text-ok-fg" : "text-warn-fg"}>{tr(m.status)}</span>
                {m.error ? ` · ${m.error}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
      <TestSmsForm />
    </section>
  );
}
