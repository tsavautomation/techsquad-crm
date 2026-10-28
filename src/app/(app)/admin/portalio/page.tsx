import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalConnectForm, PortalPanel, ReviewFromForm } from "@/components/admin/portalio-panel";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { loadSettings, portalEnv } from "@/lib/portalio/client";
import { adminDb } from "@/lib/supabase/admin";
import { getT } from "@/i18n/server";

export const maxDuration = 300;

export async function generateMetadata() {
  return { title: (await getT())("Portal.io") };
}

/** Admin › Portal.io (PI-a): the connection, the sync and the webhook. */
export default async function PortalioPage() {
  const t = await getT();
  const me = await requireUser();
  if (!me.isSysadmin) notFound();
  const env = portalEnv();
  const settings = await loadSettings().catch(() => null);
  let counts = { total: 0, accepted: 0, review: 0, linked: 0 };
  if (settings) {
    const db = adminDb();
    const [a, b, c, d] = await Promise.all([
      db.from("portal_proposals").select("id", { count: "exact", head: true }),
      db.from("portal_proposals").select("id", { count: "exact", head: true }).in("status", ["Accepted", "Completed"]),
      settings.review_from
        ? db.from("portal_proposals").select("id", { count: "exact", head: true }).in("status", ["Accepted", "Completed"]).eq("link_status", "new").eq("archived", false).gte("accepted_at", `${settings.review_from}T00:00:00Z`)
        : db.from("portal_proposals").select("id", { count: "exact", head: true }).in("status", ["Accepted", "Completed"]).eq("link_status", "new").eq("archived", false),
      db.from("portal_proposals").select("id", { count: "exact", head: true }).eq("link_status", "linked"),
    ]);
    counts = { total: a.count ?? 0, accepted: b.count ?? 0, review: c.count ?? 0, linked: d.count ?? 0 };
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin" className="underline underline-offset-4">
          {t("Admin")}
        </Link>
      </p>
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("Portal.io")}</h1>
      <p className="mb-1 text-xs text-muted-foreground">{t("The CRM reads proposals from Portal.io (status, total, customer, job address, payment requests, change orders) once an hour and at once through the webhook. It never writes to Portal.io.")}</p>
      <p className="mb-4 text-xs text-muted-foreground">{t("Accepted proposals wait on Finance › Portal.io (and on Today) until someone links them to a project; no client or project is ever created by itself.")}</p>

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Status")}</h2>
        {!env ? (
          <p className="rounded-[10px] bg-bad-bg px-3 py-2 text-sm text-bad-fg">{t("The server has no Portal.io keys. Add PORTAL_ENV, PORTAL_SANDBOX_APP_ID / _SECRET and PORTAL_PROD_APP_ID / _SECRET to the environment (Vercel › Settings › Environment Variables) and deploy again.")}</p>
        ) : settings ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="mr-2 inline-block size-2.5 rounded-full bg-ok-fg align-middle" aria-hidden />
              {t("Connected as")} <b>{settings.display_name || settings.user_name}</b> ({settings.user_name}) {t("since {date}", { date: formatDateTime(settings.connected_at) })} · <b>{env.env === "production" ? t("production") : t("sandbox")}</b>
            </p>
            {settings.env !== env.env && <p className="rounded-[10px] bg-warn-bg px-3 py-2 text-warn-fg">{t("The connection was made on {a} but the server now points at {b}. Disconnect and connect again.", { a: settings.env, b: env.env })}</p>}
            <p className="text-text-2">
              {settings.last_sync_at ? t("Last sync {when}", { when: formatDateTime(settings.last_sync_at) }) : t("Not synced yet")}
              {settings.last_full_sync_at ? ` · ${t("everything read {when}", { when: formatDateTime(settings.last_full_sync_at) })}` : ""}
            </p>
            {settings.last_sync_error && <p className="rounded-[10px] bg-bad-bg px-3 py-2 text-bad-fg">{settings.last_sync_error}</p>}
            <p className="text-text-2">{t("{total} proposals mirrored · {accepted} accepted · {linked} linked to projects · {review} waiting for a project", counts)}</p>
            <p className="text-text-2">{settings.webhook ? t("Webhook registered ({url}) since {date}", { url: settings.webhook.url, date: formatDateTime(settings.webhook.created_at) }) : t("No webhook: changes arrive with the hourly sync. Register it once the CRM is on its public address.")}</p>
            <ReviewFromForm value={settings.review_from ?? ""} />
            <PortalPanel hasWebhook={Boolean(settings.webhook)} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-2">
              {t("Not connected. Server environment:")} <b>{env.env === "production" ? t("production") : t("sandbox")}</b>
            </p>
            <PortalConnectForm user={me.email} />
            <p className="text-xs text-muted-foreground">{t("Your Portal.io sign-in is sent once to Portal.io to obtain an API user key, which is kept encrypted. The password itself is never stored. The sandbox accepts your production password.")}</p>
          </div>
        )}
      </section>

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("How it works")}</h2>
        <ol className="flex flex-col gap-2 text-sm">
          {[
            t("Connect with the Portal.io administrator sign-in (fred@tsav.net). Then Sync everything, once."),
            t("Every hour the CRM reads what changed; with the webhook registered, a status change arrives within seconds."),
            t("An accepted proposal appears on Finance › Portal.io and on Today. Link to project creates the Approved Proposal transaction; New project asks you to pick or create the Job Owner first."),
            t("When a linked proposal changes in Portal.io, the card comes back with Refresh (update the transaction), Replace (new transaction, old one deleted) or Keep as is."),
            t("Switching from the sandbox to production: set PORTAL_ENV=production on Vercel, deploy, Disconnect here (this empties the mirror) and Connect again, then Sync everything."),
          ].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
