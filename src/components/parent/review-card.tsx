/* eslint-disable @next/next/no-img-element */

import { StatusBadge } from "@/components/status-badge";
import { AppIcon, getChoreIcon } from "@/components/ui-icons";
import { formatCurrency, formatDate, formatReadableDateTime, formatShortDateTime } from "@/lib/format";
import {
  getChoreKindLabel,
  getComputedStatus,
  getOptionalChoreState,
  getProofEntries,
  getRequiredRollingStreakStatus,
  getRoutineProgressDisplay,
  isOptionalChore,
  isRoutineChore,
} from "@/lib/chore-helpers";
import { CheckIn, Chore } from "@/types/app";

export function ReviewCard({
  chore,
  chores,
  checkIns,
  childName,
  isRejecting,
  onOpenLightbox,
  rejectionNote,
  onApprove,
  onReject,
  onRejectingChange,
  onRejectionNoteChange,
}: {
  chore: Chore;
  chores: Chore[];
  checkIns: CheckIn[];
  childName: string;
  isRejecting: boolean;
  onOpenLightbox: (src: string, alt: string) => void;
  rejectionNote: string;
  onApprove: (choreId: string) => void;
  onReject: (choreId: string, note: string) => void;
  onRejectingChange: (value: string | null) => void;
  onRejectionNoteChange: (value: string) => void;
}) {
  const proofEntries = getProofEntries(chore, checkIns);
  const routineProgress = isRoutineChore(chore)
    ? getRoutineProgressDisplay(chore, checkIns)
    : null;
  const streakStatus = isRoutineChore(chore)
    ? getRequiredRollingStreakStatus(chore, checkIns, chore.child_id)
    : null;
  const brokenStreak = Boolean(streakStatus?.isBroken);
  const canApprove = !isRoutineChore(chore) || Boolean(streakStatus?.canApprove);
  const optionalState = isOptionalChore(chore)
    ? getOptionalChoreState(chores, chore, undefined, checkIns)
    : null;

  return (
    <article className={`parent-card card-spotlight rounded-[26px] border p-4 ${brokenStreak ? "border-rose-300 bg-rose-950/35 shadow-[0_12px_28px_rgba(127,29,29,0.28)]" : "border-white/12"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="kicker-icon mt-0.5"><AppIcon className="h-4 w-4" name={getChoreIcon(chore.title)} /></span>
          <div>
            <p className="text-[1.05rem] font-black text-white">{chore.title}</p>
            <div className="title-underline mt-2" />
            <p className="mt-1 text-sm text-slate-200">{formatCurrency(chore.amount_cents)} for {childName}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="label-chip label-chip-soft">{getChoreKindLabel(chore)}</span>
              {isOptionalChore(chore) ? <span className="label-chip label-chip-soft">{optionalState?.resetLabel}</span> : null}
              {isRoutineChore(chore) ? <span className="label-chip label-chip-soft"><AppIcon className="h-3 w-3" name="repeat" /> {brokenStreak ? "Streak broken" : "Repeating"}</span> : null}
            </div>
          </div>
        </div>
        <StatusBadge
          label={brokenStreak ? "streak broken" : undefined}
          status={getComputedStatus(chore, checkIns)}
          tone={brokenStreak ? "broken" : undefined}
        />
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-200">{chore.description}</p>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-300">Submitted {formatShortDateTime(chore.submitted_at)}</p>

      {routineProgress ? (
        <div className={`mt-3 rounded-[22px] px-3 py-3 text-sm ${brokenStreak ? "bg-rose-100/92 text-rose-950" : "bg-white/12 text-slate-100"}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold">{streakStatus?.progressCount} of {streakStatus?.requiredCount} check-ins complete</p>
            <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] ${brokenStreak ? "bg-rose-200 text-rose-900" : "bg-white/16 text-white"}`}>{routineProgress.streakLabel}</span>
          </div>
          <div className={`mt-3 h-3 overflow-hidden rounded-full ${brokenStreak ? "bg-slate-300" : "soft-progress-rail"}`}>
            <div className={brokenStreak ? "h-full rounded-full bg-slate-500" : "soft-progress-fill"} style={{ width: `${routineProgress.progressPercent}%` }} />
          </div>
          {brokenStreak && streakStatus?.missedDate ? (
            <div className="mt-2 space-y-1">
              <p className="font-bold text-rose-900">Streak broken: missed {formatDate(streakStatus.missedDate)}</p>
              {streakStatus.nextRestartDate ? (
                <p className="text-sm text-rose-900">Restarts {formatDate(streakStatus.nextRestartDate)}</p>
              ) : null}
            </div>
          ) : (
            <p className={`mt-2 ${routineProgress.isEligible ? "text-emerald-200" : "text-slate-200"}`}>Reward locked until every required check-in is complete.</p>
          )}
        </div>
      ) : null}

      {proofEntries.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">Proof photos</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {proofEntries.map((entry) => (
              <button key={entry.id} className="review-photo rounded-2xl p-2 text-left" onClick={() => onOpenLightbox(entry.photo_url, `${chore.title} proof for ${entry.proof_date}`)} type="button">
                <img alt={`${chore.title} proof for ${entry.proof_date}`} className="h-32 w-full rounded-xl object-cover" src={entry.photo_url} />
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{entry.label ?? "Proof"} - {entry.proof_date}</p>
                <p className="text-xs text-slate-600">Uploaded {entry.uploaded_at ? formatReadableDateTime(entry.uploaded_at) : "time unavailable"}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isRejecting ? (
        <div className="mt-3 space-y-2">
          <textarea className="field-surface min-h-22 w-full rounded-2xl px-4 py-3 text-sm text-slate-900" placeholder="Optional note to explain what should change" value={rejectionNote} onChange={(event) => onRejectionNoteChange(event.target.value)} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className="action-button flex-1 rounded-2xl bg-rose-600 px-4 py-3 font-black text-white" onClick={() => { onReject(chore.id, rejectionNote); onRejectingChange(null); onRejectionNoteChange(""); }} type="button">Confirm reject</button>
            <button className="action-button rounded-2xl border border-white/18 bg-white/10 px-4 py-3 font-black text-white" onClick={() => { onRejectingChange(null); onRejectionNoteChange(""); }} type="button">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button className={`action-button flex-1 rounded-2xl px-4 py-3 font-black text-white ${!canApprove ? "cursor-not-allowed bg-slate-500/80" : "bg-emerald-600"}`} disabled={!canApprove} onClick={() => onApprove(chore.id)} type="button">{!canApprove ? "Approval locked" : "Approve"}</button>
          <button className="action-button flex-1 rounded-2xl bg-rose-600 px-4 py-3 font-black text-white" onClick={() => onRejectingChange(chore.id)} type="button">Reject</button>
        </div>
      )}
    </article>
  );
}
