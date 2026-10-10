import { notFound } from "next/navigation";
import { KeyRound } from "lucide-react";
import { requireClient } from "@/lib/portal/session";
import { myProject } from "@/lib/portal/data";
import { recordsDb } from "@/lib/records/data";
import { Empty, Pill, PortalCard } from "@/components/portal/shell";
import { getT } from "@/i18n/server";

/** Passwords: the systems installed and their credentials, in clear (the customer is signed in; Fred 2026-10-10). */
export default async function PasswordsPage({ params }: PageProps<"/portal/p/[id]">) {
  await requireClient();
  const { id } = await params;
  const t = await getT();
  const p = await myProject(await recordsDb(), Number(id));
  if (!p) notFound();
  const lines = (p.system_credentials ?? "").split(/\r?\n/).filter((l) => l.trim());

  return (
    <div className="flex flex-col gap-4">
      {p.systems.length > 0 && (
        <PortalCard title={t("Your systems")}>
          <div className="flex flex-wrap gap-1.5">{p.systems.map((s) => <Pill key={s} tone="info">{s}</Pill>)}</div>
        </PortalCard>
      )}
      <PortalCard title={t("Logins and passwords")}>
        {lines.length === 0 ? (
          <Empty>{t("No credentials on file. Ask our office if you need them.")}</Empty>
        ) : (
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <pre className="min-w-0 flex-1 font-sans text-sm leading-6 break-words whitespace-pre-wrap select-all">{lines.join("\n")}</pre>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t("Keep this page private. Anyone with your portal login can read it.")}</p>
      </PortalCard>
    </div>
  );
}
