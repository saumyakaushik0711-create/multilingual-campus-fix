import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, Coins, MapPin, Repeat2, Timer, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DEPARTMENTS,
  fmtInr,
  fmtMs,
  fmtUsd,
  formatLocation,
  reportLabel,
  type Department,
  type Ticket,
} from "@/lib/campusfix";
import { ConfidenceBadge, DeptBadge, UrgencyBadge } from "./meta";

interface Props {
  ticket: Ticket;
  onApprove: (id: string, d: Department) => void;
  onRemove: (id: string) => void;
  /** Signed-in staff can approve and delete; everyone else sees a sign-in prompt instead. */
  canManage: boolean;
  onNeedStaff: () => void;
}

export function TicketCard({ ticket: t, onApprove, onRemove, canManage, onNeedStaff }: Props) {
  const [reassign, setReassign] = useState<Department>(t.classification.department);
  const c = t.classification;
  const repeat = reportLabel(t.reportCount);

  return (
    <article className="animate-card-in rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-1.5">
        {t.status === "review" ? (
          <Badge variant="review">Human review</Badge>
        ) : (
          <DeptBadge department={t.department} />
        )}
        <UrgencyBadge urgency={c.urgency} />
        <ConfidenceBadge confidence={c.confidence} />
        {repeat && (
          <Badge variant="repeat" className="gap-1">
            <Repeat2 className="size-3" /> {repeat}
          </Badge>
        )}
        {t.status === "approved" && (
          <Badge variant="outline" className="gap-1">
            <Check className="size-3" /> Staff approved
          </Badge>
        )}
        {canManage && (
          <button
            onClick={() => onRemove(t.id)}
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
            aria-label="Delete ticket"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      <p className="mt-3 text-[15px] leading-snug">“{t.text}”</p>
      {t.duplicateTexts.length > 0 && (
        <details className="mt-1.5 text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium hover:text-foreground">
            {t.duplicateTexts.length} more report{t.duplicateTexts.length === 1 ? "" : "s"} merged
            here
          </summary>
          <ul className="mt-1.5 space-y-1 border-l-2 pl-3">
            {t.duplicateTexts.map((d, i) => (
              <li key={i}>“{d}”</li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-3 flex items-start gap-1.5 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
        <span
          className={
            formatLocation(c.location) === "Not specified" ? "text-muted-foreground" : "font-medium"
          }
        >
          {formatLocation(c.location)}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">AI: </span>
        {c.department} — {c.reason}
      </p>

      {t.status === "review" && !canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-review-soft p-3">
          <span className="text-xs font-semibold text-review">
            Waiting for a staff member to approve
          </span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={onNeedStaff}>
            Staff sign-in
          </Button>
        </div>
      )}

      {t.status === "review" && canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-review-soft p-3">
          <span className="text-xs font-semibold text-review">Assign to</span>
          <select
            value={reassign}
            onChange={(e) => setReassign(e.target.value as Department)}
            className="h-8 rounded-md border bg-card px-2 text-sm"
            aria-label="Reassign department"
          >
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <Button size="sm" onClick={() => onApprove(t.id, reassign)}>
            <Check /> Approve
          </Button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 font-mono text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Timer className="size-3.5" /> {fmtMs(t.latencyMs)}
        </span>
        <span className="flex items-center gap-1">
          <Coins className="size-3.5" /> {fmtUsd(t.costUsd)} · {fmtInr(t.costInr)}
        </span>
        <span>
          {t.promptTokens}+{t.outputTokens} tok
        </span>
        <span className="ml-auto font-sans">
          {formatDistanceToNow(t.lastReportedAt, { addSuffix: true })}
        </span>
      </div>
    </article>
  );
}
