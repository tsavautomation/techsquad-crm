import Link from "next/link";
import { notFound } from "next/navigation";
import { GmailPanel } from "@/components/admin/gmail-panel";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { googleConfigured } from "@/lib/google/client";
import { loadSettings, MAILBOX, redirectUri } from "@/lib/mail/client";
import { adminDb } from "@/lib/supabase/admin";
import { getT } from "@/i18n/server";

export const maxDuration = 300;

export async function generateMetadata() {
  return { title: (await getT())("Gmail intake") };
}

/** Admin › Gmail intake (F26-2): connect the CRM mailbox, see the last check, run one now. */
export default async function GmailPage(props: PageProps<"/admin/gmail">) {
  const t = await getT();
  const me = await requireUser();
  if (!me.isSysadmin) notFound();
  const sp = (await props.searchParams) as { connected?: string; error?: string };
  const configured = googleConfigured();
  const settings = configured ? await loadSettings().catch(() => null) : null;
  let counts = { waiting: 0, filed: 0, ignored: 0 };
  if (settings) {
    const db = adminDb();
    const [w, f, i] = await Promise.all([
      db.from("mail_messages").select("id", { count: "exact", head: true }).eq("status", "unassigned"),
      db.from("mail_messages").select("id", { count: "exact", head: true }).eq("status", "assigned"),
      db.from("mail_messages").select("id", { count: "exact", head: true }).eq("status", "ignored"),
    ]);
    counts = { waiting: w.count ?? 0, filed: f.count ?? 0, ignored: i.count ?? 0 };
  }

  const step = (n: number, text: React.ReactNode) => (
    <li className="flex gap-3 text-sm">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{n}</span>
      <span>{text}</span>
    </li>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin" className="underline underline-offset-4">
          {t("Admin")}
        </Link>
      </p>
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("Gmail intake")}</h1>
      <p className="mb-4 text-xs text-muted-foreground">{t("The CRM mailbox: forward project emails to {mailbox} with the project name or #number in the subject. Every five minutes the CRM reads it, puts each email on its project's timeline and files the attachments in OneDrive; what matches nothing waits in the Assign list on Today.", { mailbox: MAILBOX })}</p>

      {sp.connected && <p className="mb-3 rounded-[10px] bg-ok-bg px-3 py-2 text-sm text-ok-fg">{t("Mailbox connected. The first check reads the last 30 days.")}</p>}
      {sp.error && <p className="mb-3 rounded-[10px] bg-bad-bg px-3 py-2 text-sm text-bad-fg">{sp.error === "setup" ? t("The Google app keys aren't set yet (see the steps below).") : sp.error}</p>}

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Status")}</h2>
        {!configured ? (
          <p className="text-sm text-text-2">{t("Not set up yet: the Google app keys (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) are missing.")}</p>
        ) : settings ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="mr-2 inline-block size-2.5 rounded-full bg-ok-fg align-middle" aria-hidden />
              {t("Connected to")} <b>{settings.account || MAILBOX}</b> {t("since {date}", { date: formatDateTime(settings.connected_at) })}.
            </p>
            {settings.account && settings.account.toLowerCase() !== MAILBOX && <p className="rounded-[10px] bg-warn-bg px-3 py-2 text-warn-fg">{t("This is not {mailbox}. Disconnect and sign in with the CRM mailbox.", { mailbox: MAILBOX })}</p>}
            <p className="text-text-2">
              {settings.last_sync_at ? t("Last check {when}", { when: formatDateTime(settings.last_sync_at) }) : t("Not checked yet")} · {t("{n} emails read so far", { n: settings.read_total })}
            </p>
            {settings.last_sync_error && <p className="rounded-[10px] bg-bad-bg px-3 py-2 text-bad-fg">{settings.last_sync_error}</p>}
            <p className="text-text-2">{t("{a} on project timelines · {b} waiting in the Assign list · {c} ignored", { a: counts.filed, b: counts.waiting, c: counts.ignored })}</p>
            <GmailPanel />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-2">{t("Not connected. Nothing is read from the mailbox.")}</p>
            <form action="/api/gmail/connect" method="get">
              <button type="submit" className="inline-flex h-11 w-fit items-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground">
                {t("Connect the mailbox")}
              </button>
            </form>
            <p className="text-xs text-muted-foreground">{t("Sign in as {mailbox} and allow the CRM to read the mailbox (read-only: it never sends or deletes).", { mailbox: MAILBOX })}</p>
          </div>
        )}
      </section>

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Before the first connection (Google Cloud, once)")}</h2>
        <ol className="flex flex-col gap-2">
          {step(1, t("Open console.cloud.google.com, signed in as techsquadfl@gmail.com, and pick the project that holds the CRM's calendar keys."))}
          {step(2, t("APIs & Services › Library: search \"Gmail API\" and click Enable."))}
          {step(3, t("APIs & Services › OAuth consent screen › Audience: under Test users click Add users and add {mailbox}.", { mailbox: MAILBOX }))}
          {step(4, t("APIs & Services › OAuth consent screen › Data access: Add or remove scopes, tick \"…/auth/gmail.readonly\" and save."))}
          {step(5, t("Credentials › the CRM's OAuth client: Authorised redirect URIs must include {uri}.", { uri: redirectUri() }))}
          {step(6, t("Back here: Connect the mailbox, choose {mailbox}, allow.", { mailbox: MAILBOX }))}
        </ol>
      </section>
    </div>
  );
}
