import { Clock } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime, toDateTimeLocalET } from "@/lib/dates";
import { CORRECTION_FIELDS, FIELD_LABEL, isApprover, loadCorrections } from "@/lib/field-day/corrections";
import { myEmployeeIds } from "@/lib/field-day/load";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";
import { CorrectionForm, DecideButtons } from "./correction-form";

// F22-a on the visit page: the technician asks for a correction here; the approvers decide here (or from the bell).

const STATUS: Record<string, string> = { pending: "bg-warn-bg text-warn-fg", approved: "bg-ok-bg text-ok-fg", rejected: "bg-bad-bg text-bad-fg" };
const STATUS_TEXT: Record<string, string> = { pending: "Waiting for approval", approved: "Approved", rejected: "Rejected" };

export async function CorrectionsPanel({ visitId }: { visitId: number }) {
  const [user, tr, db] = await Promise.all([requireUser(), getT(), recordsDb()]);
  const { data } = await db.from("visits").select("id, technician_id, on_way_at, checked_in_at, checked_out_at, visits_team(target_id)").eq("id", visitId).maybeSingle();
  const v = data as { id: number; technician_id: number | null; on_way_at: string | null; checked_in_at: string | null; checked_out_at: string | null; visits_team: { target_id: number }[] } | null;
  if (!v) return null;
  const [mine, approver, list] = await Promise.all([myEmployeeIds(db, user), isApprover(db, user), loadCorrections(db, visitId)]);
  const going = [v.technician_id, ...v.visits_team.map((x) => x.target_id)].some((id) => id !== null && mine.includes(id));
  // Only times that were actually recorded can be corrected.
  const options = CORRECTION_FIELDS.filter((f) => v[f]).map((f) => ({ field: f, label: FIELD_LABEL[f], current: toDateTimeLocalET(v[f]) }));
  if (!going && !list.length) return null;
  if (going && !options.length && !list.length) return null;

  return (
    <section id="corrections" className="mb-4 scroll-mt-20 rounded-2xl border bg-card px-4 py-3 shadow-card">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Clock className="size-4" aria-hidden /> {tr("Time corrections")}
      </h2>
      {list.length > 0 && (
        <ul className="mb-3 flex flex-col divide-y text-sm">
          {list.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
              <div className="min-w-0">
                <p>
                  <span className="font-medium">{c.employee}</span> · {tr(FIELD_LABEL[c.field])}: {c.previous_at ? formatDateTime(c.previous_at) : "—"} → <span className="font-semibold">{formatDateTime(c.requested_at)}</span>
                </p>
                <p className="text-xs text-text-2">
                  {c.reason}
                  {c.decision_note ? ` · ${c.decision_note}` : ""}
                </p>
              </div>
              {c.status === "pending" && approver ? <DecideButtons id={c.id} /> : <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[c.status]}`}>{tr(STATUS_TEXT[c.status])}</span>}
            </li>
          ))}
        </ul>
      )}
      {going && options.length > 0 && <CorrectionForm visitId={visitId} options={options} />}
    </section>
  );
}
