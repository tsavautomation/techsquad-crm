import Link from "next/link";
import { notFound } from "next/navigation";
import { GmailConnectForm } from "@/components/admin/gmail-connect-form";
import { GmailPanel } from "@/components/admin/gmail-panel";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { loadSettings, MAILBOX } from "@/lib/mail/client";
import { adminDb } from "@/lib/supabase/admin";
import { getT } from "@/i18n/server";

export const maxDuration = 300;

export async function generateMetadata() {
  return { title: (await getT())("Gmail intake") };
}

/** Admin › Gmail intake (F26-2): connect the CRM mailbox with an app password, see the last check, run one now. */
export default async function GmailPage() {
  const t = await getT();
  const me = await requireUser();
  if (!me.isSysadmin) notFound();
  const settings = await loadSettings().catch(() => null);
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
      <p className="mb-1 text-xs text-muted-foreground">{t("The CRM mailbox: forward project emails to {mailbox} with the project name or #number in the subject. Every five minutes the CRM reads it, puts each email on its project's timeline and files the attachments in OneDrive; what matches nothing waits in the Assign list on Today.", { mailbox: MAILBOX })}</p>
      <p className="mb-4 text-xs text-muted-foreground">{t("A processed email leaves the Gmail inbox: filed ones go to the label Projects › the project, ignored ones to Ignored. Whatever is still in the inbox was not processed.")}</p>

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Status")}</h2>
        {settings ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="mr-2 inline-block size-2.5 rounded-full bg-ok-fg align-middle" aria-hidden />
              {t("Connected to")} <b>{settings.account}</b> {t("since {date}", { date: formatDateTime(settings.connected_at) })}.
            </p>
            {settings.account.toLowerCase() !== MAILBOX && <p className="rounded-[10px] bg-warn-bg px-3 py-2 text-warn-fg">{t("This is not {mailbox}. Disconnect and connect the CRM mailbox.", { mailbox: MAILBOX })}</p>}
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
            <GmailConnectForm mailbox={MAILBOX} />
            <p className="text-xs text-muted-foreground">{t("The CRM only reads the mailbox (IMAP, read-only): it never sends, moves or deletes anything. The password is stored encrypted.")}</p>
          </div>
        )}
      </section>

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Getting the app password (once, on the mailbox account)")}</h2>
        <ol className="flex flex-col gap-2">
          {step(1, t("In a browser, sign in to Google as {mailbox} and open myaccount.google.com › Security.", { mailbox: MAILBOX }))}
          {step(2, t("Under \"How you sign in to Google\", turn on 2-Step Verification (a phone number is enough)."))}
          {step(3, t("Open myaccount.google.com/apppasswords, type a name such as \"TechSquad CRM\" and click Create."))}
          {step(4, t("Google shows 16 letters in groups of four. Copy them (spaces don't matter) and paste them above, then Connect the mailbox."))}
          {step(5, t("Gmail › Settings › See all settings › Forwarding and POP/IMAP: IMAP must be enabled (it is by default)."))}
        </ol>
      </section>
    </div>
  );
}
