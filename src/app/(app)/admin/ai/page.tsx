import { notFound } from "next/navigation";
import { AiPanel } from "@/components/admin/ai-panel";
import { aiConfigured, DEFAULT_MODEL } from "@/lib/ai/claude";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("AI") };
}

/** Admin › AI: is the Claude connection set up, and does it answer (F12). */
export default async function AiPage() {
  const t = await getT();
  const me = await requireUser();
  if (!me.isSysadmin) notFound();
  const configured = aiConfigured();

  const step = (n: number, text: string) => (
    <li className="flex gap-3 text-sm">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-semibold">{n}</span>
      <span>{text}</span>
    </li>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("AI")}</h1>
      <p className="mb-4 text-[12.5px] text-muted-foreground">{t("The CRM asks Claude (Anthropic) to read and write for us. The key stays on the server; nothing is sent to the AI unless a feature below asks for it.")}</p>

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
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("What the AI does")}</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <b>{t("Today")}</b> · {t("Employees: reads the expiry date from a driver's licence photo and pre-fills it. The person checks it before saving.")}
          </li>
          <li className="text-text-2">
            <b>{t("Later (phase 5)")}</b> · {t("Proof-reading of job reports, filling fields from what technicians write, and drafting emails that wait in the outbox for approval.")}
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
        <p className="mt-3 text-[12.5px] text-muted-foreground">{t("For the computer you develop on, the same key goes in .env.local as ANTHROPIC_API_KEY.")}</p>
      </section>
    </div>
  );
}
