import Link from "next/link";
import { notFound } from "next/navigation";
import { WaBoard } from "@/components/whatsapp/board";
import { PeriodSummary } from "@/components/whatsapp/period-summary";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { canSeeWhatsApp, DEFAULT_WINDOW, loadBoard, WINDOWS } from "@/lib/whatsapp/load";
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL } from "@/lib/whatsapp/triage-engine";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("WhatsApp") };
}

// F28 WhatsApp Monitor (Fred 2026-10-21): at a glance, what came in on WhatsApp Business in the last days.
// The capture PC forwards each notification; messages gather per chat, Claude reads the thread once it goes quiet
// (F28-b), and the team works the cards here; a card tied to a project also lives on that project's timeline.
// Red = urgent, yellow = needs something from us, green = nothing needed (Fred's three colours).

export default async function WhatsAppPage(props: PageProps<"/whatsapp">) {
  const tr = await getT();
  const user = await requireUser();
  if (!canSeeWhatsApp(user)) notFound();
  const { days: dParam } = (await props.searchParams) as { days?: string };
  const days = (WINDOWS as readonly number[]).includes(Number(dParam)) ? Number(dParam) : DEFAULT_WINDOW;
  const board = await loadBoard(await recordsDb(), days);
  const windowLabel = (d: number) => (d === 1 ? tr("Today") : tr("{n} days", { n: d }));

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("WhatsApp")}</h1>
          <p className="text-xs text-muted-foreground">{tr("Messages from the WhatsApp PC, read and sorted by AI. Red: urgent. Yellow: needs something from us. Green: nothing needed.")}</p>
        </div>
        <div className="flex rounded-[10px] border bg-muted p-0.5 text-[13px]" role="tablist" aria-label={tr("Period")}>
          {WINDOWS.map((d) => (
            <Link key={d} href={d === DEFAULT_WINDOW ? "/whatsapp" : `/whatsapp?days=${d}`} role="tab" aria-selected={d === days} className={cn("rounded-lg px-3 py-2 whitespace-nowrap", d === days ? "bg-card font-semibold shadow-card" : "text-text-2")}>
              {windowLabel(d)}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-6 md:overflow-visible">
        <div className={cn("flex min-w-[120px] flex-col rounded-2xl border px-4 py-3 shadow-card", board.urgentOpen ? "border-bad-border bg-bad-bg text-bad-fg" : "bg-card")}>
          <span className="text-2xl font-semibold tabular-nums">{board.urgentOpen}</span>
          <span className="text-xs font-medium">{tr("Urgent, still open")}</span>
        </div>
        {CATEGORIES.map((c) => (
          <div key={c} className="flex min-w-[120px] flex-col rounded-2xl border bg-card px-4 py-3 shadow-card">
            <span className="text-2xl font-semibold tabular-nums">{board.counts[c]}</span>
            <span className="text-xs text-text-2">
              <span aria-hidden>{CATEGORY_ICON[c]}</span> {tr(CATEGORY_LABEL[c])}
            </span>
          </div>
        ))}
      </div>

      <PeriodSummary days={days} empty={board.cards.length === 0} />

      <WaBoard cards={board.cards} people={board.people} />
    </div>
  );
}
