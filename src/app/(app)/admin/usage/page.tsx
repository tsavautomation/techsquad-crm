import Link from "next/link";
import { notFound } from "next/navigation";
import { UsageTable, type UsageRow } from "@/components/admin/usage-table";
import { requireUser } from "@/lib/auth/session";
import { todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { addDays } from "@/lib/schedule/dates";
import { sumUsage } from "@/lib/usage/engine";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Usage") };
}

const RANGES = [7, 30, 90] as const;
type DayRow = { user_id: string; day: string; first_at: string; last_at: string; active_seconds: number; sessions: number; pages: number };

/** Admin › Usage (SPEC §9.1 ADM-b): who uses the CRM, how often, how long, and when they were last here. */
export default async function UsagePage(props: PageProps<"/admin/usage">) {
  const t = await getT();
  const me = await requireUser();
  if (!(me.isSysadmin || me.permissions.has("site.admin.members"))) notFound();
  const { days: d } = (await props.searchParams) as { days?: string };
  const days = (RANGES as readonly number[]).includes(Number(d)) ? Number(d) : 30;
  const today = todayET();
  const from = addDays(today, -(days - 1));
  const db = await recordsDb();
  const [{ data: people }, { data: usage }, { data: signIns }] = await Promise.all([
    db.from("profiles").select("id, email, first_name, last_name, active").is("contact_id", null).order("first_name"),
    db.from("usage_days").select("user_id, day, first_at, last_at, active_seconds, sessions, pages").gte("day", from).order("day", { ascending: false }),
    db.rpc("user_last_sign_in"),
  ]);
  const lastSignIn = new Map(((signIns ?? []) as { id: string; last_sign_in_at: string | null }[]).map((r) => [r.id, r.last_sign_in_at]));
  const byUser = new Map<string, DayRow[]>();
  for (const r of (usage ?? []) as DayRow[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  const rows: UsageRow[] = ((people ?? []) as { id: string; email: string; first_name: string | null; last_name: string | null; active: boolean }[])
    .map((p) => {
      const mine = byUser.get(p.id) ?? [];
      const todayRow = mine.find((r) => r.day === today);
      return {
        id: p.id,
        name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email,
        email: p.email,
        active: p.active,
        lastSeen: mine[0]?.last_at ?? null,
        lastSignIn: lastSignIn.get(p.id) ?? null,
        today: todayRow?.active_seconds ?? 0,
        totals: sumUsage(mine),
        days: mine.map((r) => ({ day: r.day, first_at: r.first_at, last_at: r.last_at, seconds: r.active_seconds, sessions: r.sessions, pages: r.pages })),
      };
    })
    .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") || a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("Usage")}</h1>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("Time is counted while the CRM is open on screen and the person is touching, scrolling or typing (a minute at a time; an idle tab stops counting). A pause of 30 minutes starts a new session. Counting began on 10/14/2026.")}
      </p>
      <div className="mb-3 flex gap-1 text-sm">
        {RANGES.map((n) => (
          <Link key={n} href={n === 30 ? "/admin/usage" : `/admin/usage?days=${n}`} className={`inline-flex h-9 items-center rounded-lg border px-3 ${n === days ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
            {t("Last {n} days", { n })}
          </Link>
        ))}
      </div>
      <UsageTable rows={rows} days={days} />
    </div>
  );
}
