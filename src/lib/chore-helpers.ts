import {
  Chore,
  ChoreProofEntry,
  ChoreStatus,
  WeekdayKey,
} from "@/lib/chorepay-types";

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
  return new Date().toISOString().slice(0, 10);
}

export function parseIsoDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
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
  const anchorDate = chore.start_date ?? chore.created_at.slice(0, 10);
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

export function formatRepeatSchedule(chore: Chore) {
  if (!chore.recurring) {
    return "One-time";
  }

  const weekADays = getRepeatDaysForWeek(chore, 0);
  if (chore.repeat_pattern !== "biweekly") {
    return formatRepeatDays(weekADays);
  }

  const weekBDays = getRepeatDaysForWeek(chore, 1);
  return `Week A: ${formatRepeatDays(weekADays)} | Week B: ${formatRepeatDays(weekBDays)}`;
}

export function getProofEntries(chore: Chore): ChoreProofEntry[] {
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

export function getRollingRequirementDates(chore: Chore) {
  if (chore.chore_kind !== "rolling") {
    return [];
  }

  const startDate = chore.start_date ?? chore.created_at.slice(0, 10);
  const endDate = chore.due_date ?? startDate;
  const cursor = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const dates: string[] = [];

  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const weekday = weekdayMap[cursor.getDay()];
    const repeatDays = getRepeatDaysForDate(chore, iso);
    if (repeatDays.length === 0 || repeatDays.includes(weekday)) {
      dates.push(iso);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function getRollingProgress(chore: Chore) {
  const requiredDates = getRollingRequirementDates(chore);
  const proofEntries = getProofEntries(chore);
  const proofDateSet = new Set(proofEntries.map((entry) => entry.proof_date));
  const today = getTodayIsoDate();
  const completedDates = requiredDates.filter((date) => proofDateSet.has(date));
  const missedDates = requiredDates.filter((date) => date < today && !proofDateSet.has(date));
  const isComplete =
    requiredDates.length > 0 && completedDates.length === requiredDates.length;
  const isEligible = isComplete && missedDates.length === 0;

  return {
    requiredDates,
    completedDates,
    missedDates,
    isComplete,
    isEligible,
    progressLabel: `${completedDates.length} of ${requiredDates.length} days completed`,
    missedLabel:
      missedDates.length > 0
        ? `Missed ${missedDates.length} day${missedDates.length === 1 ? "" : "s"}`
        : null,
  };
}

export function isChoreExpired(chore: Chore) {
  if (chore.status === "paid" || chore.status === "approved") {
    return false;
  }

  const today = getTodayIsoDate();
  if (chore.chore_kind === "rolling") {
    const progress = getRollingProgress(chore);
    const endDate = chore.due_date ?? chore.start_date ?? chore.created_at.slice(0, 10);
    return endDate < today && !progress.isEligible;
  }

  return Boolean(
    chore.due_date &&
      chore.due_date < today &&
      (chore.status === "available" || chore.status === "rejected"),
  );
}

export function getComputedStatus(chore: Chore): ChoreStatus {
  if (isChoreExpired(chore)) {
    return "expired";
  }

  return chore.status;
}
