import Link from "next/link";
import { notFound } from "next/navigation";
import { BounciePanel } from "@/components/admin/bouncie-panel";
import { requireUser } from "@/lib/auth/session";
import { bouncieConfigured, fetchVehicles, loadSettings, redirectUri } from "@/lib/bouncie/client";
import { reportedLabel } from "@/lib/bouncie/age";
import { matchVehicles, type FleetVehicle, type MapVehicle } from "@/lib/bouncie/match";
import { formatDateTime } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Bouncie") };
}

/** Admin › Bouncie: connect the Bouncie account whose trackers are in the vans (F8). */
export default async function BounciePage(props: PageProps<"/admin/bouncie">) {
  const t = await getT();
  const me = await requireUser();
  if (!me.isSysadmin) notFound();
  const sp = (await props.searchParams) as { connected?: string; error?: string };
  const configured = bouncieConfigured();
  const settings = configured ? await loadSettings().catch(() => null) : null;

  let vehicles: MapVehicle[] = [];
  let problem: string | null = null;
  if (settings) {
    try {
      const db = await recordsDb();
      const [live, { data: fleet }] = await Promise.all([fetchVehicles(), db.from("vehicles").select("id, title, vin, bouncie_imei, driver_id").is("deleted_at", null)]);
      const rows = (fleet ?? []) as FleetVehicle[];
      const ids = rows.map((r) => r.driver_id).filter((id): id is number => id !== null);
      const { data: emp } = ids.length ? await db.from("employees").select("id, title").in("id", ids) : { data: [] };
      vehicles = matchVehicles(live, rows, new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`])));
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("Bouncie")}</h1>
      <p className="mb-4 text-[12.5px] text-muted-foreground">{t("The Bouncie trackers in the vans put each vehicle on the Schedule › Map, live, next to the day's jobs. Only people who may open the Fleet list see the vehicles.")}</p>

      {sp.connected && <p className="mb-3 rounded-[10px] bg-ok-bg px-3 py-2 text-sm text-ok-fg">{t("Bouncie connected. The map shows the vehicles from now on.")}</p>}
      {sp.error && <p className="mb-3 rounded-[10px] bg-bad-bg px-3 py-2 text-sm text-bad-fg">{sp.error === "setup" ? t("The Bouncie app keys aren't set yet (see the steps below).") : sp.error}</p>}

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Status")}</h2>
        {!configured ? (
          <p className="text-sm text-text-2">{t("Not set up yet: the Bouncie app keys (BOUNCIE_CLIENT_ID and BOUNCIE_CLIENT_SECRET) are missing.")}</p>
        ) : settings ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              <span className="mr-2 inline-block size-2.5 rounded-full bg-ok-fg align-middle" aria-hidden />
              {t("Connected to")} <b>{settings.name}</b> {settings.account && <span className="text-text-2">({settings.account})</span>} {t("since {date}", { date: formatDateTime(settings.connected_at) })}.
            </p>
            <BounciePanel />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-2">{t("Not connected. The map shows the day's jobs but no vehicles.")}</p>
            {/* A plain request (not client navigation): the server redirects to Bouncie's sign-in. */}
            <form action="/api/bouncie/connect" method="get">
              <button type="submit" className="inline-flex h-11 w-fit items-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground">
                {t("Connect Bouncie")}
              </button>
            </form>
            <p className="text-xs text-muted-foreground">{t("You'll sign in with the Bouncie account that owns the trackers and allow the CRM to read the vehicles.")}</p>
          </div>
        )}
      </section>

      {settings && (
        <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Vehicles Bouncie reports")}</h2>
          {problem ? (
            <p className="text-sm text-bad-fg">{problem}</p>
          ) : !vehicles.length ? (
            <p className="text-sm text-text-2">{t("No vehicles yet. Add the trackers in the Bouncie app first.")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {vehicles.map((v) => {
                return (
                  <li key={v.imei} className="flex flex-col gap-0.5 py-2">
                    <span className="font-medium">
                      {v.name} <span className="font-normal text-text-2">· {v.vin ? `VIN ${v.vin}` : `IMEI ${v.imei}`}</span>
                    </span>
                    <span className="text-text-2">
                      {v.vehicleId ? (
                        <>
                          <Link href={`/administrative/vehicles/${v.vehicleId}`} className="underline underline-offset-4">
                            {v.vehicleTitle || t("Vehicle #{id}", { id: v.vehicleId })}
                          </Link>
                          {v.driverName ? ` · ${t("usual driver {name}", { name: v.driverName })}` : ` · ${t("no usual driver set")}`}
                        </>
                      ) : (
                        t("Not matched to a Fleet record: put this VIN (or the IMEI in Bouncie device) on the vehicle in Administrative › Fleet.")
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {reportedLabel(t, v.updatedAt)}
                      {v.address ? ` · ${v.address}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Setting it up (once)")}</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text-2">
          <li>{t("Go to bouncie.dev, sign in with the Bouncie account, open Account › Apps and press Create app.")}</li>
          <li>
            {t("Set the Redirect URI to exactly:")} <code className="rounded bg-muted px-1 text-xs">{redirectUri()}</code>
          </li>
          <li>{t("Copy the Client ID and Client Secret into the site's settings as BOUNCIE_CLIENT_ID and BOUNCIE_CLIENT_SECRET, then redeploy.")}</li>
          <li>{t("Come back here and press Connect Bouncie.")}</li>
          <li>{t("On each vehicle in Administrative › Fleet, fill in the VIN# (or the Bouncie device IMEI) and the Usual driver, so the map can say who is in which van.")}</li>
        </ol>
      </section>
    </div>
  );
}
