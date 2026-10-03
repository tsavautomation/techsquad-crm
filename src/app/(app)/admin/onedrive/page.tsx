import { notFound } from "next/navigation";
import { OneDrivePanel } from "@/components/admin/onedrive-panel";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { loadSettings, oneDriveConfigured } from "@/lib/files/onedrive";
import { filesToMove } from "@/lib/files/onedrive-admin";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("OneDrive") };
}

/** Admin › OneDrive: connect the Microsoft account that stores all attachments. */
export default async function OneDrivePage(props: PageProps<"/admin/onedrive">) {
  const t = await getT();
  const me = await requireUser();
  if (!me.isSysadmin) notFound();
  const sp = (await props.searchParams) as { connected?: string; error?: string };
  const configured = oneDriveConfigured();
  const settings = configured ? await loadSettings().catch(() => null) : null;
  const pending = settings ? await filesToMove() : null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("OneDrive")}</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        {t("Every photo, video and file attached in the CRM is stored in this OneDrive, in TechSquad CRM / Projects / <project> / <form> / <date>. Signatures stay in the CRM.")}
      </p>

      {sp.connected && <p className="mb-3 rounded-[10px] bg-ok-bg px-3 py-2 text-sm text-ok-fg">{t("OneDrive connected. New uploads go there from now on.")}</p>}
      {sp.error && <p className="mb-3 rounded-[10px] bg-bad-bg px-3 py-2 text-sm text-bad-fg">{sp.error === "setup" ? "The OneDrive app keys aren't set yet (see the steps below)." : sp.error}</p>}

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Status")}</h2>
        {!configured ? (
          <p className="text-sm text-text-2">{t("Not set up yet: the Microsoft app keys (ONEDRIVE_CLIENT_ID and ONEDRIVE_CLIENT_SECRET) are missing.")}</p>
        ) : settings ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              <span className="mr-2 inline-block size-2.5 rounded-full bg-ok-fg align-middle" aria-hidden />
              {t("Connected to")} <b>{settings.name}</b> {settings.account && <span className="text-text-2">({settings.account})</span>} {t("since {date}", { date: formatDateTime(settings.connected_at) })}.
            </p>
            <OneDrivePanel connected toMove={pending?.count ?? 0} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-2">{t("Not connected. Uploads go to the CRM's own storage (50 MB per file).")}</p>
            {/* A plain request (not client navigation): the server redirects to Microsoft's sign-in. */}
            <form action="/api/onedrive/connect" method="get">
              <button type="submit" className="inline-flex h-11 w-fit items-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground">
                {t("Connect OneDrive")}
              </button>
            </form>
            <p className="text-xs text-muted-foreground">{t("You'll sign in with the Microsoft account that owns the OneDrive and allow the CRM to read and write files.")}</p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("How uploads from phones work")}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-2">
          <li>{t("Files go straight from the phone to OneDrive in 5 MB pieces, with a progress bar.")}</li>
          <li>{t("If a call comes in, the screen locks or the signal drops, the upload pauses and continues from where it stopped when the person is back in the CRM.")}</li>
          <li>{t("If the phone closes the page, choosing the same file again continues the upload instead of starting over.")}</li>
          <li>{t("The Save button waits until every file has arrived. The screen is kept awake during uploads where the phone allows it.")}</li>
        </ul>
      </section>
    </div>
  );
}
