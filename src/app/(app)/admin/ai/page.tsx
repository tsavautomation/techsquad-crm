import Link from "next/link";
import { notFound } from "next/navigation";
import { AiPanel } from "@/components/admin/ai-panel";
import { AiReviewSwitch } from "@/components/admin/ai-review-switch";
import { aiConfigured, DEFAULT_MODEL } from "@/lib/ai/claude";
import { REVIEW_MODEL } from "@/lib/ai/review-apply";
import { AI_REVIEW_AUTOMATION_ID, loadAiSettings } from "@/lib/ai/review-queue";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("AI") };
}

type RunRow = { id: number; record_id: number; status: string; at: string; detail: { actions?: string[]; error?: string } };

/** Admin › AI: is the Claude connection set up, does it answer (F12), and the Job Report review switch (F17). */
export default async function AiPage() {
  const t = await getT();
  const me = await requireUser();
  if (!me.isSysadmin) notFound();
  const configured = aiConfigured();
  const db = await recordsDb();
  const [settings, { data: runs }] = await Promise.all([
    loadAiSettings(db),
    db.from("automation_runs").select("id, record_id, status, at, detail").eq("automation_id", AI_REVIEW_AUTOMATION_ID).eq("event", "ai_review").order("at", { ascending: false }).limit(10),
  ]);
  const reportsT = getTable("job_reports");

  const step = (n: number, text: string) => (
    <li className="flex gap-3 text-sm">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{n}</span>
      <span>{text}</span>
    </li>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("AI")}</h1>
      <p className="mb-4 text-xs text-muted-foreground">{t("The CRM asks Claude (Anthropic) to read and write for us. The key stays on the server; nothing is sent to the AI unless a feature below asks for it.")}</p>

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Status")}</h2>
        {configured ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              <span className="mr-2 inline-block size-2.5 rounded-full bg-ok-fg align-middle" aria-hidden />
              {t("The AI key is set. Model for new work: {model}.", { model: DEFAULT_MODEL })}
            </p>
            <AiPanel />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-2">{t("Not set up yet: ANTHROPIC_API_KEY is missing. Follow the steps below.")}</p>
            <AiPanel disabled />
          </div>
        )}
      </section>

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Review of Job Reports")}</h2>
        <p className="mb-3 text-sm text-text-2">
          {t("After a technician saves a new Job Report, Claude ({model}) tidies the grammar in the language it was written, moves pending work into What's missing (so the return card is made), moves logins and passwords into Login and Passwords and the project's System Credentials, and stamps the report Reviewed by AI. The original text stays in History, with Undo. Reports imported from WebAuthor and the archive are never touched.", { model: REVIEW_MODEL })}
        </p>
        <AiReviewSwitch on={settings.review_reports} />
        {!configured && <p className="mt-2 text-xs text-muted-foreground">{t("Reports are only reviewed once the AI key is set.")}</p>}
        <h3 className="mt-4 mb-1 text-[13px] font-semibold">{t("Last reviews")}</h3>
        {!runs?.length ? (
          <p className="text-sm text-muted-foreground">{t("No report has been reviewed yet.")}</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {(runs as RunRow[]).map((r) => (
              <li key={r.id} className="p-3">
                <div className="flex flex-wrap justify-between gap-x-3">
                  <Link href={recordHref(reportsT, r.record_id)} className="font-medium underline underline-offset-4">
                    {reportsT.itemLabel} #{r.record_id}
                  </Link>
                  <span className="text-xs text-muted-foreground">{formatDateTime(r.at)}</span>
                </div>
                <p className={r.status === "error" ? "text-bad-fg" : "text-muted-foreground"}>{r.status === "error" ? r.detail.error : r.detail.actions?.join(" ")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("What the AI does")}</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <b>{t("Job Reports")}</b> · {t("Reviews every new report as above (switch on this page).")}
          </li>
          <li>
            <b>{t("Employees")}</b> · {t("Reads the expiry date from a driver's licence photo and pre-fills it. The person checks it before saving.")}
          </li>
          <li>
            <b>{t("Calendar and archive")}</b> · {t("Matches unclear Google Calendar entries and old report files to their projects (Admin › Google Calendar, Admin › Report archive).")}
          </li>
          <li className="text-text-2">
            <b>{t("Later")}</b> · {t("Drafting emails that wait in the outbox for approval.")}
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Setting it up (once)")}</h2>
        <ol className="flex flex-col gap-2">
          {step(1, t("Go to console.anthropic.com and sign in (or create the account) with info@techsquadfl.com."))}
          {step(2, t("Open Settings › Billing and add a payment method. Usage is pay-as-you-go; reading a photo costs a fraction of a cent."))}
          {step(3, t("Open Settings › API Keys › Create Key. Name it \"CRM\" and copy the key: it is shown only once."))}
          {step(4, t("In Vercel, open the techsquad-crm project › Settings › Environment Variables. Add ANTHROPIC_API_KEY with the key, for Production and Preview, then Save."))}
          {step(5, t("Open Deployments and redeploy the latest one. Come back here and press Test connection."))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">{t("For the computer you develop on, the same key goes in .env.local as ANTHROPIC_API_KEY.")}</p>
      </section>
    </div>
  );
}
