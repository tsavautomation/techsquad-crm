import { getT } from "@/i18n/server";

// PI-f: the one word everyone sees on a project: Paid / Current / Overdue / No data.

export const STATUS_TONE: Record<string, string> = {
  Paid: "bg-ok-bg text-ok-fg",
  Current: "bg-info-bg text-info-fg",
  Overdue: "bg-bad-bg text-bad-fg",
  "No data": "bg-muted text-text-2",
};

export async function PaymentStatusBadge({ status }: { status: string }) {
  const tr = await getT();
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[status] ?? STATUS_TONE["No data"]}`}>{tr(status)}</span>;
}
