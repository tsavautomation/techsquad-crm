import { notFound } from "next/navigation";
import { GoogleCalendarPanel } from "@/components/admin/google-calendar-panel";
import { aiConfigured } from "@/lib/ai/claude";
import { requireUser } from "@/lib/auth/session";
import { googleConfigured, listCalendars, loadSettings, redirectUri, type GCalendar } from "@/lib/google/client";
import { DEFAULT_FROM, importBusy } from "@/lib/google/sync";
import { formatDateTime } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { adminDb } from "@/lib/supabase/admin";
import { getT } from "@/i18n/server";

export const maxDuration = 300;

export async function generateMetadata() {
  return { title: (await getT())("Google Calendar") };
}

/** Admin › Google Calendar (F15): connect the shared calendar, read its history into visits, keep both in sync. */
export default async function GoogleCalendarPage(props: PageProps<"/admin/google-calendar">) {
  const t = await getT();
  const me = await requireUser();
  if (!me.isSysadmin) notFound();
  const sp = (await props.searchParams) as { connected?: string; error?: string };
  const configured = googleConfigured();
  const settings = configured ? await loadSettings().catch(() => null) : null;

  let calendars: GCalendar[] = [];
  let problem: string | null = null;
  let employees: { id: number; name: string }[] = [];
  let needsProject = 0;
  if (settings) {
    try {
      calendars = await listCalendars();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
    const db = await recordsDb();
    const [{ data: emp }, np] = await Promise.all([
      db.from("employees").select("id, title, status").is("deleted_at", null).neq("status", "Inactive").order("title"),
      adminDb().from("visits").select("id", { count: "exact", head: true }).is("project_id", null).is("deleted_at", null),
    ]);
    employees = ((emp ?? []) as { id: number; title: string | null }[]).map((e) => ({ id: e.id, name: e.title ?? `#${e.id}` }));
    needsProject = np.count ?? 0;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("Google Calendar")}</h1>
      <p className="mb-4 text-xs text-muted-foreground">{t("The shared Tech Squad calendar: its years of visits come into the CRM, and from then on visits made here appear there and changes there come back here, every hour.")}</p>

      {sp.connected && <p className="mb-3 rounded-[10px] bg-ok-bg px-3 py-2 text-sm text-ok-fg">{t("Google account connected. Now choose the calendar below.")}</p>}
      {sp.error && <p className="mb-3 rounded-[10px] bg-bad-bg px-3 py-2 text-sm text-bad-fg">{sp.error === "setup" ? t("The Google app keys aren't set yet (see the steps below).") : sp.error}</p>}

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Status")}</h2>
        {!configured ? (
          <p className="text-sm text-text-2">{t("Not set up yet: the Google app keys (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) are missing.")}</p>
        ) : settings ? (
          <p className="text-sm">
            <span className="mr-2 inline-block size-2.5 rounded-full bg-ok-fg align-middle" aria-hidden />
            {t("Connected to")} <b>{settings.account || "Google"}</b> {t("since {date}", { date: formatDateTime(settings.connected_at) })}.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-2">{t("Not connected. Visits stay in the CRM only.")}</p>
            <form action="/api/google/connect" method="get">
              <button type="submit" className="inline-flex h-11 w-fit items-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground">
                {t("Connect Google Calendar")}
              </button>
            </form>
            <p className="text-xs text-muted-foreground">{t("Sign in with the Google account that owns the calendar (techsquadfl@gmail.com) and allow the CRM to see and change its calendars.")}</p>
          </div>
        )}
      </section>

      {settings && (
        <GoogleCalendarPanel
          account={settings.account}
          calendars={calendars}
          calendarProblem={problem}
          calendarId={settings.calendar_id}
          colorMap={settings.color_map}
          nameMap={settings.name_map}
          nameStats={settings.name_stats}
          aiMatch={settings.ai_match}
          aiAvailable={aiConfigured()}
          employees={employees}
          importState={settings.import}
          busy={importBusy(settings.import)}
          hasSyncToken={Boolean(settings.sync_token)}
          lastSyncAt={settings.last_sync_at}
          lastSyncError={settings.last_sync_error}
          needsProject={needsProject}
          defaultFrom={DEFAULT_FROM}
        />
      )}

      <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Setting it up (once)")}</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text-2">
          <li>{t("Go to console.cloud.google.com signed in as techsquadfl@gmail.com and open the project that already has the Maps key (\"My First Project\").")}</li>
          <li>{t("APIs & Services › Library: search \"Google Calendar API\" and press Enable.")}</li>
          <li>{t("APIs & Services › OAuth consent screen (Google Auth Platform): app name \"TechSquad CRM\", your e-mail as support and developer contact, audience External. Under Audience press Publish app, so the connection doesn't expire after 7 days. Skip verification (only our own account uses it).")}</li>
          <li>{t("Data access › Add or remove scopes: tick \"…/auth/calendar\" (See, edit, share, and permanently delete all the calendars) and save.")}</li>
          <li>
            {t("Clients › Create client: Web application, name \"TechSquad CRM\". Add this Authorized redirect URI exactly:")} <code className="rounded bg-muted px-1 text-xs">{redirectUri()}</code>
          </li>
          <li>{t("Copy the Client ID and Client secret into the site's settings as GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then redeploy.")}</li>
          <li>{t("Come back here and press Connect Google Calendar. On Google's warning \"Google hasn't verified this app\" choose Advanced › Go to TechSquad CRM.")}</li>
          <li>{t("Choose the calendar, check the colours, then Read the calendar and Create visits. Visits that didn't find their project wait in Schedule › Needs a project.")}</li>
        </ol>
      </section>
    </div>
  );
}
