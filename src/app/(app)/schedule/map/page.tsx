import { notFound } from "next/navigation";
import { MapView } from "@/components/schedule/map-view";
import { requireUser } from "@/lib/auth/session";
import { bouncieConfigured, isConnected } from "@/lib/bouncie/client";
import { VEHICLES_PERMISSION } from "@/lib/bouncie/match";
import { todayET } from "@/lib/dates";
import { loadMapDay } from "@/lib/schedule/map";
import { getTable } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Map") };
}

/** Schedule › Map (F8): the day's job stops with their technicians, and the vans live from Bouncie. */
export default async function MapPage(props: PageProps<"/schedule/map">) {
  const tr = await getT();
  const user = await requireUser();
  if (!canOpen(user.permissions, getTable("visits"), getTable)) notFound();
  const sp = (await props.searchParams) as { date?: string; tech?: string };
  const tech = sp.tech && /^\d+$/.test(sp.tech) ? Number(sp.tech) : null;
  const { date, stops, people, office } = await loadMapDay(sp.date);
  const canVehicles = user.isSysadmin || user.permissions.has(VEHICLES_PERMISSION);
  const vehiclesMode = !canVehicles ? "hidden" : bouncieConfigured() && (await isConnected()) ? "on" : "off";

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="mb-3 text-2xl font-semibold">{tr("Map")}</h1>
      <MapView date={date} today={todayET()} tech={tech} stops={stops} people={people} office={office} vehiclesMode={vehiclesMode} isAdmin={user.isSysadmin} />
    </div>
  );
}
