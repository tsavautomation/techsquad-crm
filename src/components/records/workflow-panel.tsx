"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/dates";
import { moveWorkflowAction } from "@/lib/records/workflow-actions";
import { cn } from "@/lib/utils";

export type WorkflowPanelData = {
  workflow: { id: string; name: string; start_on: "submit" | "create" };
  state: { level_id: number; title: string; color: string | null; entered_at: string; allow_comments: boolean } | null;
  may_act: boolean;
  outcomes: { id: number; title: string; kind: "goto" | "override" | "unsubmit"; target_color: string | null }[];
  levels: { id: number; title: string; color: string | null; place: number }[];
  events: { id: number; outcome: string; comment: string | null; at: string; from: string | null; to: string | null; to_color: string | null; actor: string }[];
};

function StageChip({ title, color }: { title: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium">
      <span className="size-2.5 rounded-full ring-1 ring-black/10" style={{ background: color ?? "#ddd" }} aria-hidden />
      {title}
    </span>
  );
}

/** Current stage, the outcomes this user may take, and the timeline (SPEC §6). */
export function WorkflowPanel({ table, id, data }: { table: string; id: number; data: WorkflowPanelData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [comment, setComment] = useState("");
  const [override, setOverride] = useState<number | null>(null);
  const [target, setTarget] = useState<number | "">("");

  function take(outcome: WorkflowPanelData["outcomes"][number], targetLevel: number | null = null) {
    if (outcome.kind === "unsubmit" && !confirm("Remove this record from the workflow? It will be unlocked and its status cleared.")) return;
    start(async () => {
      const r = await moveWorkflowAction(table, id, outcome.id, targetLevel, comment);
      if (!r.ok) return void toast.error(r.message);
      toast.success(outcome.title);
      setComment("");
      setOverride(null);
      router.refresh();
    });
  }

  const { state } = data;
  return (
    <section aria-label={data.workflow.name} className="mb-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{data.workflow.name}</h2>
        {state ? (
          <StageChip title={state.title} color={state.color} />
        ) : (
          <span className="text-sm text-muted-foreground">{data.workflow.start_on === "submit" ? "Starts when the record is submitted" : "Not started"}</span>
        )}
      </div>
      {state && <p className="mt-1 text-xs text-muted-foreground">In this stage since {formatDateTime(state.entered_at)}</p>}

      {state && data.may_act && data.outcomes.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {state.allow_comments && (
            <input
              aria-label="Comment (optional)"
              placeholder="Comment (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {data.outcomes.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={pending}
                onClick={() => (o.kind === "override" ? setOverride(o.id) : take(o))}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-50",
                  o.kind === "unsubmit" && "text-destructive",
                )}
              >
                {o.target_color && <span className="size-2.5 rounded-full ring-1 ring-black/10" style={{ background: o.target_color }} aria-hidden />}
                {o.title}
                {o.kind === "goto" && <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />}
              </button>
            ))}
          </div>
          {override !== null && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-2">
              <label htmlFor="wf-override" className="text-sm">
                Move to
              </label>
              <select
                id="wf-override"
                value={target}
                onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : "")}
                className="h-11 flex-1 rounded-lg border border-input bg-background px-3 text-base"
              >
                <option value="">Choose a stage…</option>
                {data.levels.filter((l) => l.id !== state.level_id).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pending || target === ""}
                onClick={() => take(data.outcomes.find((o) => o.id === override)!, target === "" ? null : target)}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-foreground px-4 text-sm text-background disabled:opacity-50"
              >
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Move
              </button>
            </div>
          )}
        </div>
      )}
      {state && !data.may_act && <p className="mt-2 text-xs text-muted-foreground">Your group can see this stage but not move it.</p>}

      {data.events.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">Timeline ({data.events.length})</summary>
          <ol className="mt-2 flex flex-col gap-2 border-l pl-4">
            {data.events.map((e) => (
              <li key={e.id} className="text-sm">
                <p>
                  <span className="font-medium">{e.outcome}</span>
                  {e.to && (
                    <>
                      {" → "}
                      <StageChip title={e.to} color={e.to_color} />
                    </>
                  )}
                  {!e.to && <span className="text-muted-foreground"> (left the workflow)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.actor} · {formatDateTime(e.at)}
                </p>
                {e.comment && <p className="mt-0.5 rounded bg-muted/50 px-2 py-1 text-xs">“{e.comment}”</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
