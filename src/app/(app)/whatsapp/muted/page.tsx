import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { UnmuteButton } from "@/components/whatsapp/unmute-button";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { canSeeWhatsApp, loadMuted } from "@/lib/whatsapp/load";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Muted chats") };
}

// F28-c WhatsApp › Muted chats (Fred 2026-10-22): the groups and contacts whose messages make no cards, with Unmute.

export default async function MutedChatsPage() {
  const tr = await getT();
  const user = await requireUser();
  if (!canSeeWhatsApp(user)) notFound();
  const muted = await loadMuted(await recordsDb());

  return (
    <div className="mx-auto max-w-[800px]">
      <Link href="/whatsapp" className="mb-3 inline-flex min-h-11 items-center gap-1 text-[13px] text-primary hover:underline md:min-h-0">
        <ChevronLeft className="size-4" aria-hidden /> {tr("Back to WhatsApp")}
      </Link>
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Muted chats")}</h1>
      <p className="mb-4 text-xs text-muted-foreground">{tr("Messages from these chats are kept but make no cards and are not read by the AI. Unmute to receive them on the board again; what arrived while muted stays out.")}</p>
      {muted.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{tr("Nothing is muted. Use Mute this chat on a card.")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card shadow-card">
          {muted.map((m) => (
            <li key={m.chat} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.chat}</p>
                <p className="text-xs text-text-2">{tr("Muted {when} by {who}", { when: formatDateTime(m.muted_at), who: m.muted_by_name ?? "?" })}</p>
              </div>
              <UnmuteButton chat={m.chat} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
