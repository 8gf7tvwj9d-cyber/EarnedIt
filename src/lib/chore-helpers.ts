import {
  getDefaultRrcSchedule,
  getRequiredProgress,
  getRrcStatus,
  getTodayKey,
  isChoreScheduledForDate as getScheduledForDateFromProgress,
  getNormalizedCheckInsForChore,
  getLocalDateFromTimestamp,
  normalizeRrcSchedule,
} from "@/lib/chore-progress";
import {
  Chore,
  CheckIn,
  ChoreProofEntry,
  ChoreStatus,
  ResetFrequency,
  RrcSchedule,
  WeekdayKey,
} from "@/types/app";

export const weekdayOptions: { key: WeekdayKey; label: string; short: string }[] = [
  { key: "monday", label: "Monday", short: "Mon" },
  { key: "tuesday", label: "Tuesday", short: "Tue" },
  { key: "wednesday", label: "Wednesday", short: "Wed" },
  { key: "thursday", label: "Thursday", short: "Thu" },
  { key: "friday", label: "Friday", short: "Fri" },
  { key: "saturday", label: "Saturday", short: "Sat" },
  { key: "sunday", label: "Sunday", short: "Sun" },
];

const weekdayMap: Record<number, WeekdayKey> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

export function getTodayIsoDate() {
  return getTodayKey();
}

export function parseIsoDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatRepeatDays(repeatDays: WeekdayKey[]) {
  if (repeatDays.length === 0) {
    return "No repeat days";
  }

  return weekdayOptions
    .filter((option) => repeatDays.includes(option.key))
    .map((option) => option.short)
    .join(", ");
}

export function getRepeatDaysForWeek(chore: Chore, weekIndex: 0 | 1 = 0) {
  if (chore.repeat_pattern === "biweekly") {
    return weekIndex === 0 ? chore.repeat_days_week_a : chore.repeat_days_week_b;
  }

  return chore.repeat_days_week_a.length > 0 ? chore.repeat_days_week_a : chore.repeat_days;
}

export function getWeekIndexForDate(chore: Chore, isoDate: string): 0 | 1 {
  const anchorDate = chore.start_date ?? getLocalDateFromTimestamp(chore.created_at);
  const current = parseIsoDate(isoDate);
  const anchor = parseIsoDate(anchorDate);
  const dayDiff = Math.max(
    0,
    Math.floor((current.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24)),
  );

  return Math.floor(dayDiff / 7) % 2 === 0 ? 0 : 1;
}

export function getRepeatDaysForDate(chore: Chore, isoDate: string) {
  return getRepeatDaysForWeek(chore, getWeekIndexForDate(chore, isoDate));
}

export function isOneTimeChore(chore: Chore) {
  return chore.chore_kind === "one_time";
}

export function isOptionalChore(chore: Chore) {
  return chore.chore_kind === "optional";
}

export function isRoutineChore(chore: Chore) {
  return chore.chore_kind === "routine";
}

export function isTemplateChore(chore: Chore) {
  return chore.is_template;
}

export function isOptionalTemplateChore(chore: Chore) {
  return isOptionalChore(chore) && isTemplateChore(chore);
}

export function isOptionalInstanceChore(chore: Chore) {
  return isOptionalChore(chore) && !isTemplateChore(chore) && Boolean(chore.template_chore_id);
}

export function getChoreKindLabel(chore: Chore) {
  if (isOptionalChore(chore)) {
    return "Repeating chore";
  }

  if (isRoutineChore(chore)) {
    return "Required repeating chore";
  }

  return "One-time chore";
}

export function isChoreScheduledForDate(chore: Chore, isoDate: string) {
  return getScheduledForDateFromProgress(chore, isoDate);
}

export function getResetPeriodKey(isoDate: string, frequency: ResetFrequency) {
  if (frequency === "daily") {
    return isoDate;
  }

  const date = parseIsoDate(isoDate);
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return formatLocalIsoDate(start);
}

export function getResetLabel(frequency: ResetFrequency) {
  return frequency === "daily" ? "Resets tomorrow" : "Resets next week";
}

export function getCurrentPeriodKey(chore: Chore, today = getTodayIsoDate()) {
  return getResetPeriodKey(today, chore.reset_frequency);
}

export function getProofEntriesForCurrentReset(
  chore: Chore,
  today = getTodayIsoDate(),
  checkIns: CheckIn[] = [],
) {
  const entries = getProofEntries(chore, checkIns);
  const currentKey = getResetPeriodKey(today, chore.reset_frequency);
  return entries.filter(
    (entry) =>
      getProofDateCandidates(entry).some(
        (candidate) => getResetPeriodKey(candidate, chore.reset_frequency) === currentKey,
      ),
  );
}

export function getOptionalInstanceForPeriod(
  chores: Chore[],
  template: Chore,
  today = getTodayIsoDate(),
) {
  const currentPeriodKey = getCurrentPeriodKey(template, today);
  return chores.find(
    (chore) =>
      chore.template_chore_id === template.id &&
      chore.instance_period_key === currentPeriodKey,
  );
}

export function getOptionalTemplate(chores: Chore[], chore: Chore) {
  if (isOptionalTemplateChore(chore)) {
    return chore;
  }

  if (!chore.template_chore_id) {
    return null;
  }

  return chores.find((entry) => entry.id === chore.template_chore_id) ?? null;
}

export function getOptionalChoreState(
  chores: Chore[],
  chore: Chore,
  today = getTodayIsoDate(),
  checkIns: CheckIn[] = [],
) {
  const template = getOptionalTemplate(chores, chore) ?? chore;
  const scheduledToday = isChoreScheduledForDate(template, today);
  const currentPeriodKey = getCurrentPeriodKey(template, today);
  const currentInstance = isOptionalTemplateChore(chore)
    ? getOptionalInstanceForPeriod(chores, chore, today)
    : chore;
  const currentEntries = currentInstance
    ? getProofEntriesForCurrentReset(currentInstance, today, checkIns)
    : [];
  const completionCount = currentEntries.length;
  const remainingCompletions = currentInstance ? 0 : template.max_completions_per_reset || 1;
  const canSubmitToday = Boolean(
    scheduledToday &&
      (isOptionalTemplateChore(chore)
        ? !template.manual_availability && !currentInstance
        : chore.status === "available" || chore.status === "rejected"),
  );
  const helperLabel = currentInstance
    ? currentInstance.status === "rejected"
      ? "Needs another photo before resubmitting"
      : `Submitted for ${template.reset_frequency === "daily" ? "today" : "this period"}`
    : template.manual_availability
      ? "Parent needs to make this available"
      : `Can be done once ${template.reset_frequency === "daily" ? "today" : "this period"}`;

  return {
    scheduledToday,
    currentPeriodKey,
    currentInstance,
    completionCount,
    remainingCompletions,
    canSubmitToday,
    isOptional: true,
    helperLabel,
    resetLabel: getResetLabel(template.reset_frequency),
  };
}

export function formatRepeatSchedule(chore: Chore) {
  if (!chore.recurring && isOneTimeChore(chore)) {
    return "One-time";
  }

  if (isRoutineChore(chore) || (isOptionalChore(chore) && chore.rrc_schedule)) {
    const schedule = normalizeRrcSchedule(chore);
    const dateLabel = isRoutineChore(chore) ? "required dates" : "days available";

    if (schedule.cycleType === "two_week_custody_block") {
      return schedule.requiredDateOffsets?.length
        ? `Two-week block: ${schedule.requiredDateOffsets.length} ${dateLabel}`
        : "Two-week block";
    }

    if (schedule.cycleType === "one_month_block") {
      return schedule.requiredDateOffsets?.length
        ? `One-month block: ${schedule.requiredDateOffsets.length} ${dateLabel}`
        : "One-month block";
    }

    return `Weekly: ${formatRepeatDays(schedule.requiredDays)}`;
  }

  const weekADays = getRepeatDaysForWeek(chore, 0);
  if (chore.repeat_pattern !== "biweekly") {
    return formatRepeatDays(weekADays);
  }

  const weekBDays = getRepeatDaysForWeek(chore, 1);
  return `Week A: ${formatRepeatDays(weekADays)} | Week B: ${formatRepeatDays(weekBDays)}`;
}

export function getProofEntries(chore: Chore, checkIns: CheckIn[] = []): ChoreProofEntry[] {
  const derivedEntries = getNormalizedCheckInsForChore(chore, checkIns).map((entry) => ({
    id: entry.id,
    proof_date: entry.check_in_date,
    photo_url: entry.photo_url,
    submitted_at: entry.submitted_at,
  }));

  if (derivedEntries.length > 0) {
    return derivedEntries;
  }

  if (chore.proof_entries.length > 0) {
    return chore.proof_entries;
  }

  if (!chore.photo_url) {
    return [];
  }

  return [
    {
      id: `${chore.id}-legacy-proof`,
      proof_date: (chore.submitted_at ?? chore.updated_at).slice(0, 10),
      photo_url: chore.photo_url,
      submitted_at: chore.submitted_at ?? chore.updated_at,
    },
  ];
}

export function getProofDateCandidates(entry: ChoreProofEntry) {
  const dates = new Set<string>([entry.proof_date]);

  if (entry.submitted_at) {
    dates.add(formatLocalIsoDate(new Date(entry.submitted_at)));
  }

  return [...dates];
}

export function getRollingRequirementDates(chore: Chore) {
  if (!isRoutineChore(chore)) {
    return [];
  }

  const startDate = chore.start_date ?? getLocalDateFromTimestamp(chore.created_at);
  const endDate = chore.due_date ?? startDate;
  const cursor = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const dates: string[] = [];

  while (cursor <= end) {
    const iso = formatLocalIsoDate(cursor);
    const weekday = weekdayMap[cursor.getDay()];
    const repeatDays = getRepeatDaysForDate(chore, iso);
    if (repeatDays.length === 0 || repeatDays.includes(weekday)) {
      dates.push(iso);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function getRollingProgress(chore: Chore, checkIns: CheckIn[] = []) {
  const progress = getRequiredProgress(chore, checkIns, getTodayIsoDate());
  return {
    requiredDates: progress.requiredDates,
    completedDates: progress.completedDates,
    missedDates: progress.missedDates,
    isComplete: progress.completedDates.length >= progress.totalNeeded,
    streakAlive: progress.streakAlive,
    isEligible: progress.isEligible,
    progressLabel: progress.progressLabel,
    missedLabel: progress.missedLabel,
    streakLabel: progress.streakLabel,
    canCheckInToday: progress.canCheckInToday,
    nextRestartDate: progress.nextRestartDate,
  };
}

export function getRequiredRollingStreakStatus(
  chore: Chore,
  checkIns: CheckIn[] = [],
  childId?: string,
  todayKey = getTodayIsoDate(),
) {
  const relevantCheckIns = childId
    ? checkIns.filter((entry) => entry.child_id === childId)
    : checkIns;
  const status = getRrcStatus(chore, relevantCheckIns, childId, todayKey);

  return {
    cycleId: status.cycleId,
    cycleStartDate: status.cycleStartDate,
    cycleEndDate: status.cycleEndDate,
    requiredDates: status.requiredDates,
    completedDates: status.completedDates,
    approvedDates: status.approvedDates,
    missedDate: status.missedDate,
    isBroken: status.isBroken,
    isComplete: status.isComplete,
    canCheckInToday: status.canCheckInToday,
    canRestartToday: status.canRestartToday,
    nextRestartDate: status.nextRestartDate,
    progressCount: status.progressCount,
    requiredCount: status.requiredCount,
    canApprove: status.isComplete && !status.isBroken,
  };
}

export function getRoutineProgressDisplay(
  chore: Chore,
  checkIns: CheckIn[] = [],
  today = getTodayIsoDate(),
) {
  return getRequiredProgress(chore, checkIns, today);
}

export function getRoutineDraftSchedule(sourceChore?: Chore): RrcSchedule {
  return sourceChore ? normalizeRrcSchedule(sourceChore) : getDefaultRrcSchedule();
}

export function isChoreExpired(chore: Chore, checkIns: CheckIn[] = []) {
  if (chore.status === "paid" || chore.status === "approved") {
    return false;
  }

  const today = getTodayIsoDate();
  if (isRoutineChore(chore)) {
    const progress = getRollingProgress(chore, checkIns);
    const endDate = chore.due_date ?? chore.start_date ?? getLocalDateFromTimestamp(chore.created_at);
    return endDate < today && !progress.isEligible;
  }

  return Boolean(
    chore.due_date &&
      chore.due_date < today &&
      (chore.status === "available" || chore.status === "rejected"),
  );
}

export function getComputedStatus(chore: Chore, checkIns: CheckIn[] = []): ChoreStatus {
  if (isChoreExpired(chore, checkIns)) {
    return "expired";
  }

  return chore.status;
}
