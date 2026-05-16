"use client";

import { getTodayKey } from "@/lib/chore-progress";
import { getRoutineProgressDisplay } from "@/lib/chore-helpers";
import { CheckIn, Chore } from "@/types/app";

export type ChoreDebugState = {
  filteredCheckInsCount: number;
  message: string;
  persisted: boolean;
  rawStoredCheckInsCount: number;
} | null;

type ChoreDebugPanelProps = {
  chore: Chore;
  checkIns: CheckIn[];
  rawStoredCheckInsCount: number;
  visibleFilteredCheckInsCount: number;
  lastSaveState?: ChoreDebugState;
};

export function ChoreDebugPanel({
  chore,
  checkIns,
  rawStoredCheckInsCount,
  visibleFilteredCheckInsCount,
  lastSaveState = null,
}: ChoreDebugPanelProps) {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const todayKey = getTodayKey();
  const checkInsForThisChore = checkIns.filter((entry) => entry.chore_id === chore.id);
  const savedCheckInDates = checkInsForThisChore.map((entry) => entry.check_in_date);
  const completionBoolean = savedCheckInDates.includes(todayKey);
  const routineProgress = getRoutineProgressDisplay(chore, checkIns, todayKey);

  return (
    <div className="mt-3 rounded-2xl border border-amber-300/50 bg-black/75 px-3 py-3 text-left text-xs text-amber-100">
      <p className="font-black uppercase tracking-[0.18em] text-amber-200">Debug Panel</p>
      <div className="mt-2 space-y-1 font-mono">
        <p>chore id: {chore.id}</p>
        <p>child id: {chore.child_id}</p>
        <p>today normalized date: {todayKey}</p>
        <p>all saved checkIn dates for this chore: {savedCheckInDates.length > 0 ? savedCheckInDates.join(", ") : "none"}</p>
        <p>whether current chore qualifies as completed today: {String(routineProgress.todayCompleted)}</p>
        <p>exact boolean result of completion calculation: {String(completionBoolean)}</p>
        <p>whether the save actually persisted: {lastSaveState ? String(lastSaveState.persisted) : "no save attempt yet"}</p>
        <p>current raw stored checkIns count: {rawStoredCheckInsCount}</p>
        <p>current filtered checkIns count: {visibleFilteredCheckInsCount}</p>
        <p>current checkInsForThisChore count: {checkInsForThisChore.length}</p>
        <p>requiredDates length: {routineProgress.requiredDates.length}</p>
        <p>completedDates length: {routineProgress.completedDates.length}</p>
        <p>totalNeeded: {routineProgress.totalNeeded}</p>
        <p>progressCount: {routineProgress.progressCount}</p>
        <p>progressLabel: {routineProgress.progressLabel}</p>
        <p>requiredDates: {routineProgress.requiredDates.length > 0 ? routineProgress.requiredDates.join(", ") : "none"}</p>
        <p>completedDates: {routineProgress.completedDates.length > 0 ? routineProgress.completedDates.join(", ") : "none"}</p>
        <p>missedDates: {routineProgress.missedDates.length > 0 ? routineProgress.missedDates.join(", ") : "none"}</p>
        <p>last save returned filtered count: {lastSaveState ? String(lastSaveState.filteredCheckInsCount) : "n/a"}</p>
        <p>last save returned raw count: {lastSaveState ? String(lastSaveState.rawStoredCheckInsCount) : "n/a"}</p>
        <p>last save message: {lastSaveState?.message ?? "n/a"}</p>
      </div>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/45 p-2 text-[11px] leading-5 text-amber-100">
        {JSON.stringify(checkInsForThisChore, null, 2)}
      </pre>
    </div>
  );
}
