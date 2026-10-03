import Link from "next/link";
import { notFound } from "next/navigation";
import { MergeGroup } from "@/components/data/merge-group";
import { requireUser } from "@/lib/auth/session";
import { findDuplicates } from "@/lib/insights/stats";
import { recordsDb } from "@/lib/records/data";
import type { Address } from "@/lib/records/values";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Data") };
}

// Data quality (the Portal design's "Dados"): incomplete records and possible duplicates, with Merge
// (F14-a, after the WebAuthor import as Fred asked on 2026-09-30).

type Contact = { id: number; title: string | null; first_name: string | null; last_name: string | null; main_phone: string | null; email: string | null };
type Org = { id: number; title: string | null; main_phone: string | null; main_email: string | null };
type Project = { id: number; title: string | null; job_address: Address | null; job_status: string | null };

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function Kpi({ value, label, alert }: { value: string; label: string; alert?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-card px-4 py-3.5 shadow-card", alert && "border-bad-border bg-gradient-to-b from-bad-bg to-card")}>
      <b className={cn("block text-[28px] leading-tight font-semibold tracking-tight", alert && "text-bad-fg")}>{value}</b>
      <span className="text-xs text-text-2">{label}</span>
    </div>
  );
}

export default async function DataPage(props: PageProps<"/data">) {
  const t = await getT();
  const user = await requireUser();
  const contactsT = getTable("contacts");
  if (!canOpen(user.permissions, contactsT, getTable)) notFound();
  const { active } = (await props.searchParams) as { active?: string };
  const onlyActive = active !== "all";
  const canEdit = canDo(user.permissions, contactsT, "modify", getTable);
  const canMergeT = (name: "contacts" | "organizations") => canDo(user.permissions, getTable(name), "modify", getTable) && canDo(user.permissions, getTable(name), "delete", getTable);
  const db = await recordsDb();

  const [{ data: c }, { data: o }, { data: p }] = await Promise.all([
    db.from("contacts").select("id, title, first_name, last_name, main_phone, email").is("deleted_at", null).is("archived_at", null),
    canOpen(user.permissions, getTable("organizations"), getTable) ? db.from("organizations").select("id, title, main_phone, main_email").is("deleted_at", null).is("archived_at", null) : Promise.resolve({ data: [] }),
    canOpen(user.permissions, getTable("projects"), getTable) ? db.from("projects").select("id, title, job_address, job_status").is("deleted_at", null).is("archived_at", null) : Promise.resolve({ data: [] }),
  ]);
  const contacts = (c ?? []) as Contact[];
  const orgs = (o ?? []) as Org[];
  const projects = ((p ?? []) as Project[]).filter((x) => !onlyActive || !["Complete", "Proposal Denied"].includes(x.job_status ?? ""));

  // Completeness.
  type Gap = { href: string; title: string; missing: string[] };
  const gaps: Gap[] = [
    ...contacts.map((x) => ({ href: `/projects/contacts/${x.id}`, title: x.title ?? `Contact #${x.id}`, missing: [!x.main_phone && "phone", !x.email && "email"].filter(Boolean) as string[] })),
    ...orgs.map((x) => ({ href: `/projects/organizations/${x.id}`, title: x.title ?? `Organization #${x.id}`, missing: [!x.main_phone && "phone", !x.main_email && "email"].filter(Boolean) as string[] })),
    ...projects.map((x) => ({ href: `/projects/projects/${x.id}`, title: x.title ?? `Project #${x.id}`, missing: [!x.job_address?.street && "job address"].filter(Boolean) as string[] })),
  ].filter((g) => g.missing.length);
  const slots = contacts.length * 2 + orgs.length * 2 + projects.length;
  const filled = slots - gaps.reduce((n, g) => n + g.missing.length, 0);
  const pct = slots ? Math.round((filled / slots) * 100) : 100;

  // Possible duplicates: same phone or email, or same name (contacts and organizations, each apart).
  const kinds = { phone: t("Same phone"), email: t("Same email"), name: t("Same name") };
  const dupeLabel = (g: { kind: keyof typeof kinds; value: string }) => `${kinds[g.kind]}: ${g.value}`;
  const byId = new Map(contacts.map((x) => [x.id, x]));
  const dupes = findDuplicates(contacts.map((x) => ({ id: x.id, name: [x.first_name, x.last_name].filter(Boolean).join(" ") || null, phone: x.main_phone, email: x.email })));
  const orgById = new Map(orgs.map((x) => [x.id, x]));
  const orgDupes = findDuplicates(orgs.map((x) => ({ id: x.id, name: x.title, phone: x.main_phone, email: x.main_email })));

  // Projects at the same address and unit.
  const places = new Map<string, number[]>();
  for (const x of projects) {
    const a = x.job_address;
    if (!a?.street) continue;
    const k = `${norm(a.street)}|${norm(a.address_2)}|${norm(a.zip)}`;
    places.set(k, [...(places.get(k) ?? []), x.id]);
  }
  const projectById = new Map(projects.map((x) => [x.id, x]));
  const samePlace = [...places.values()].filter((ids) => ids.length > 1);

  return (
    <div className="mx-auto max-w-[1500px]">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("Data")}</h1>
      <p className="mb-4 text-xs text-muted-foreground">{t("Incomplete records and possible duplicates, with Merge for the duplicates.")}</p>
      <div className="mb-[18px] grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi value={`${pct}%`} label={t("Complete overall")} />
        <Kpi value={String(gaps.length)} label={t("Incomplete records")} alert={gaps.length > 0} />
        <Kpi value={String(dupes.length + orgDupes.length)} label={t("Possible duplicates")} alert={dupes.length + orgDupes.length > 0} />
        <Kpi value={String(samePlace.length)} label={t("Projects at the same address")} />
      </div>

      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight">{t("Incomplete records")}</h2>
          <Link href={onlyActive ? "/data?active=all" : "/data"} className="text-[13px] text-primary underline-offset-2 hover:underline">
            {t(onlyActive ? "Include completed / lost projects" : "Only open projects")}
          </Link>
        </div>
        {gaps.length ? (
          <ul className="-mx-2 divide-y">
            {gaps.slice(0, 40).map((g) => (
              <li key={g.href} className="flex items-center gap-2 px-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{g.title}</span>
                  <span className="flex flex-wrap gap-1">
                    {g.missing.map((m) => (
                      <span key={m} className="rounded-md bg-warn-bg px-1.5 py-0.5 text-xs text-warn-fg">
                        no {m}
                      </span>
                    ))}
                  </span>
                </span>
                <Link href={canEdit ? `${g.href}/edit` : g.href} className="inline-flex h-9 shrink-0 items-center rounded-[10px] border bg-card px-3 text-[13px] hover:bg-muted">
                  {t(canEdit ? "Edit" : "Open")}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-text-2">{t("Everything has its phone, email and address.")}</p>
        )}
        {gaps.length > 40 && <p className="mt-1 text-xs text-muted-foreground">{t("+ {n} more", { n: gaps.length - 40 })}</p>}
      </section>

      <div className="xl:grid xl:grid-cols-2 xl:items-start xl:gap-3.5">
      <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-1 text-[15px] font-semibold tracking-tight">{t("Possible duplicate contacts")}</h2>
        <p className="mb-2 text-xs text-text-2">{t(canMergeT("contacts") ? "Same phone, same email or same name. Open them to compare; keep the right one and merge the others into it." : "Same phone, same email or same name. Open both to compare.")}</p>
        {dupes.length ? (
          <ul className="flex flex-col gap-2">
            {dupes.map((g) => (
              <MergeGroup
                key={g.kind + g.value + g.ids.join()}
                table="contacts"
                label={dupeLabel(g)}
                canMerge={canMergeT("contacts")}
                items={[...g.ids].sort((a, b) => a - b).map((id) => ({ id, title: byId.get(id)?.title ?? `Contact #${id}`, detail: [byId.get(id)?.main_phone, byId.get(id)?.email].filter(Boolean).join(" · "), href: `/projects/contacts/${id}` }))}
              />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-text-2">{t("No likely duplicates.")}</p>
        )}
      </section>

      {orgs.length > 0 && (
        <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
          <h2 className="mb-1 text-[15px] font-semibold tracking-tight">{t("Possible duplicate organizations")}</h2>
          <p className="mb-2 text-xs text-text-2">{t(canMergeT("organizations") ? "Same phone, same email or same name. Open them to compare; keep the right one and merge the others into it." : "Same phone, same email or same name. Open both to compare.")}</p>
          {orgDupes.length ? (
            <ul className="flex flex-col gap-2">
              {orgDupes.map((g) => (
                <MergeGroup
                  key={g.kind + g.value + g.ids.join()}
                  table="organizations"
                  label={dupeLabel(g)}
                  canMerge={canMergeT("organizations")}
                  items={[...g.ids].sort((a, b) => a - b).map((id) => ({ id, title: orgById.get(id)?.title ?? `Organization #${id}`, detail: [orgById.get(id)?.main_phone, orgById.get(id)?.main_email].filter(Boolean).join(" · "), href: `/projects/organizations/${id}` }))}
                />
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-text-2">{t("No likely duplicates.")}</p>
          )}
        </section>
      )}
      </div>

      {samePlace.length > 0 && (
        <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
          <h2 className="mb-1 text-[15px] font-semibold tracking-tight">{t("Projects at the same address")}</h2>
          <p className="mb-2 text-xs text-text-2">{t("Often fine (a new job at an old client), sometimes a duplicate.")}</p>
          <ul className="flex flex-col gap-2">
            {samePlace.map((ids) => (
              <li key={ids.join()} className="rounded-xl border bg-muted px-3 py-2">
                {ids.map((id) => (
                  <Link key={id} href={`/projects/projects/${id}`} className="block text-sm text-primary hover:underline">
                    {projectById.get(id)?.title ?? `Project #${id}`}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
