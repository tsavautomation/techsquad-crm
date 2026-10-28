import { STATUS_TONE } from "@/lib/finance/status";
import { getT } from "@/i18n/server";

// FIN-c: the one word everyone sees on a project: Paid / Current / Past Due / Delinquent / No data.

export async function PaymentStatusBadge({ status }: { status: string }) {
  const tr = await getT();
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[status] ?? STATUS_TONE["No data"]}`}>{tr(status)}</span>;
}
