/* eslint-disable @next/next/no-img-element */

import type { ReactNode } from "react";
import { EmptyState } from "@/components/parent/parent-ui";
import { StatusBadge } from "@/components/status-badge";
import { AppIcon, getChoreIcon } from "@/components/ui-icons";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  formatRepeatSchedule,
  getChoreKindLabel,
  getComputedStatus,
  getOptionalChoreState,
  getProofEntries,
  getRequiredRollingStreakStatus,
  getRoutineProgressDisplay,
  isOptionalChore,
  isRoutineChore,
} from "@/lib/chore-helpers";
import { CheckIn, ChildProfile, Chore } from "@/types/app";

export function ChoreGroup({
  title,
  allChores,
  checkIns,
  chores,
  childProfiles,
  isCollapsible,
  isOpen = true,
  onEdit,
  onDeleteChore,
  onOpenChange,
  onOpenLightbox,
  sortControl,
}: {
  title: string;
  allChores: Chore[];
  checkIns: CheckIn[];
  chores: Chore[];
  childProfiles: ChildProfile[];
  isCollapsible?: boolean;
  isOpen?: boolean;
  onEdit: (chore: Chore) => void;
  onDeleteChore: (choreId: string) => void;
  onOpenChange?: (next: boolean) => void;
  onOpenLightbox: (src: string, alt: string) => void;
  sortControl?: ReactNode;
}) {
  return (
    <div className="section-shell rounded-[32px] p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="kicker-row text-slate-600"><span className="kicker-icon"><AppIcon className="h-4 w-4" name="spark" /></span>{title}</div>
          <div className="title-underline mt-2" />
        </div>
        <div className="flex items-center gap-2">
          <span className="stat-chip stat-chip-soft">{chores.length}</span>
          {sortControl}
          {isCollapsible ? (
            <button className="hero-button-secondary rounded-full px-3 py-2 text-xs font-black" onClick={() => onOpenChange?.(!isOpen)} type="button">
              {isOpen ? "Hide" : "Show"}
            </button>
          ) : null}
        </div>
      </div>
      {isOpen ? (
      <div className="space-y-3">
        {chores.length === 0 ? <EmptyState copy={`No chores in ${title.toLowerCase()} right now.`} /> : chores.map((chore) => {
          const routineProgress = isRoutineChore(chore)
            ? getRoutineProgressDisplay(chore, checkIns)
            : null;
          const streakStatus = isRoutineChore(chore)
            ? getRequiredRollingStreakStatus(chore, checkIns, chore.child_id)
            : null;
          const brokenStreak = Boolean(streakStatus?.isBroken);
          const optionalState = isOptionalChore(chore)
            ? getOptionalChoreState(allChores, chore, undefined, checkIns)
            : null;
          const proofEntries = getProofEntries(chore, checkIns);
          const latestProofImage = proofEntries[proofEntries.length - 1]?.photo_url ?? null;
          return (
            <article key={chore.id} className={`parent-card card-spotlight rounded-[26px] border p-4 shadow-[0_10px_24px_rgba(56,44,103,0.06)] ${brokenStreak ? "border-rose-300 bg-rose-950/35" : "border-white/12"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="kicker-icon mt-0.5"><AppIcon className="h-4 w-4" name={getChoreIcon(chore.title)} /></span>
                  <div>
                    <p className="text-[1.05rem] font-black text-white">{chore.title}</p>
                    <div className="title-underline mt-2" />
                    <p className="mt-1 text-sm leading-6 text-slate-200">{chore.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="label-chip label-chip-soft">{getChoreKindLabel(chore)}</span>
                      {isOptionalChore(chore) ? <span className="label-chip label-chip-soft">{optionalState?.helperLabel}</span> : null}
                      {isRoutineChore(chore) ? <span className="label-chip label-chip-soft">{brokenStreak ? "Streak broken" : routineProgress?.streakLabel}</span> : null}
                    </div>
                  </div>
                </div>
                <StatusBadge
                  label={brokenStreak ? "streak broken" : undefined}
                  status={getComputedStatus(chore, checkIns)}
                  tone={brokenStreak ? "broken" : undefined}
                />
              </div>
              {routineProgress ? (
                <div className={`mt-3 rounded-[22px] px-3 py-3 text-sm ${brokenStreak ? "bg-rose-100/92 text-rose-950" : "bg-white/12 text-slate-100"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold">{brokenStreak ? "Streak broken" : routineProgress.streakLabel}</p>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] ${brokenStreak ? "bg-rose-200 text-rose-900" : "bg-white/16 text-white"}`}>
                      {streakStatus?.progressCount} of {streakStatus?.requiredCount}
                    </span>
                  </div>
                  <div className={`mt-3 h-3 overflow-hidden rounded-full ${brokenStreak ? "bg-slate-300" : "soft-progress-rail"}`}>
                    <div className={brokenStreak ? "h-full rounded-full bg-slate-500" : "soft-progress-fill"} style={{ width: `${routineProgress.progressPercent}%` }} />
                  </div>
                  <p className={`mt-2 ${brokenStreak ? "font-bold text-rose-900" : "text-slate-200"}`}>
                    {brokenStreak && streakStatus?.missedDate
                      ? `Missed check-in on ${formatDate(streakStatus.missedDate)}`
                      : `${streakStatus?.progressCount} of ${streakStatus?.requiredCount} check-ins complete`}
                  </p>
                  {brokenStreak && streakStatus?.nextRestartDate ? (
                    <p className="mt-1 text-sm text-rose-900">Restarts {formatDate(streakStatus.nextRestartDate)}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3 grid gap-2 text-sm text-slate-200">
                <p>{formatCurrency(chore.amount_cents)}</p>
                <p>{formatRepeatSchedule(chore)}</p>
                <p>Assigned to {childProfiles.find((child) => child.id === chore.child_id)?.name ?? "Unknown"}</p>
                <p>{isRoutineChore(chore) ? `${streakStatus?.progressCount} of ${streakStatus?.requiredCount} check-ins complete` : isOptionalChore(chore) ? optionalState?.resetLabel : "One-time reward after approval"}</p>
              </div>
              {latestProofImage ? (
                <button className="mt-3 block w-full" onClick={() => onOpenLightbox(latestProofImage, `${chore.title} proof`)} type="button">
                  <img alt={`${chore.title} proof`} className="h-40 w-full rounded-[22px] object-cover ring-1 ring-white/12" src={latestProofImage} />
                </button>
              ) : null}
              {chore.rejection_note ? <p className="mt-3 rounded-2xl bg-rose-50/90 px-3 py-2 text-sm text-rose-800">{chore.rejection_note}</p> : null}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button className="action-button flex-1 rounded-2xl border border-white/18 bg-white/10 px-4 py-3 font-black text-white" onClick={() => onEdit(chore)} type="button">Edit</button>
                <button className="action-button flex-1 rounded-2xl border border-rose-300/30 bg-rose-400/16 px-4 py-3 font-black text-rose-100" onClick={() => onDeleteChore(chore.id)} type="button">Delete</button>
              </div>
            </article>
          );
        })}
      </div>
      ) : (
        <EmptyState copy={`${title} is tucked away until you want to look through it.`} />
      )}
    </div>
  );
}
