import { CheckIn, Chore, RrcSchedule, WeekdayKey } from "@/types/app";

export function getTodayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalDateFromTimestamp(timestamp: string) {
  return getTodayKey(new Date(timestamp));
}

export function getCheckInsForChore(checkIns: CheckIn[], choreId: string) {
  return checkIns
    .filter((entry) => entry.chore_id === choreId)
    .sort((left, right) => left.check_in_date.localeCompare(right.check_in_date));
}

export function getNormalizedCheckInsForChore(chore: Chore, checkIns: CheckIn[]) {
  const persisted = getCheckInsForChore(checkIns, chore.id);
  const seenDates = new Set(persisted.map((entry) => entry.check_in_date));
  const legacyEntries = (chore.proof_entries ?? [])
    .filter((entry) => !seenDates.has(entry.proof_date))
    .map((entry) => ({
      id: entry.id,
      chore_id: chore.id,
      parent_id: chore.parent_id,
      child_id: chore.child_id,
      photo_url: entry.photo_url,
      check_in_date: entry.proof_date,
      submitted_at: entry.submitted_at,
    }));

  return [...persisted, ...legacyEntries].sort((left, right) =>
    left.check_in_date.localeCompare(right.check_in_date),
  );
}

export function getCheckInForChoreDate(
  checkIns: CheckIn[],
  choreId: string,
  date = getTodayKey(),
) {
  return getCheckInsForChore(checkIns, choreId).find((entry) => entry.check_in_date === date) ?? null;
}

export function getCompletedChoresForDate(checkIns: CheckIn[], date = getTodayKey()) {
  return Array.from(
    new Set(
      checkIns
        .filter((entry) => entry.check_in_date === date)
        .map((entry) => entry.chore_id),
    ),
  );
}

function parseIsoDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(isoDate: string, days: number) {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() + days);
  return getTodayKey(date);
}

function addMonths(isoDate: string, months: number) {
  const source = parseIsoDate(isoDate);
  const target = new Date(source);
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(source.getDate(), lastDayOfTargetMonth));
  return getTodayKey(target);
}

function getDayDiff(fromIso: string, toIso: string) {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function startOfAnchoredWeek(isoDate: string, startsOn: WeekdayKey) {
  const date = parseIsoDate(isoDate);
  const diff = (date.getDay() - weekdayIndexByKey[startsOn] + 7) % 7;
  date.setDate(date.getDate() - diff);
  return getTodayKey(date);
}

const weekdayMap = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
} as const satisfies Record<number, WeekdayKey>;

const weekdayIndexByKey: Record<WeekdayKey, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const defaultBlockWeekDays: WeekdayKey[] = ["wednesday", "thursday"];
const defaultAlternatingWeekendDays: WeekdayKey[] = ["friday", "saturday", "sunday"];

function getFallbackRequiredDays(chore: Partial<Chore>) {
  if (chore.repeat_days_week_a && chore.repeat_days_week_a.length > 0) {
    return [...chore.repeat_days_week_a];
  }

  if (chore.repeat_days && chore.repeat_days.length > 0) {
    return [...chore.repeat_days];
  }

  return [];
}

export function getDefaultRrcSchedule(chore: Partial<Chore> = {}): RrcSchedule {
  const requiredDays = getFallbackRequiredDays(chore);
  return {
    cycleType: "weekly",
    weekStartsOn: "sunday",
    requiredDays,
    custodyPattern: {
      baseWeekendStartDate: chore.start_date ?? null,
      weekdayDays: [...defaultBlockWeekDays],
      alternatingWeekendDays: [...defaultAlternatingWeekendDays],
    },
    blockWeeks: [],
    requiredDateOffsets: [],
    restartRule: "next_cycle_start",
  };
}

export function normalizeRrcSchedule(chore: Partial<Chore>): RrcSchedule {
  const fallback = getDefaultRrcSchedule(chore);
  const raw = chore.rrc_schedule;
  const cycleType =
    raw?.cycleType === "two_week_custody_block" || raw?.cycleType === "one_month_block"
      ? raw.cycleType
      : "weekly";
  const requiredDays = raw?.requiredDays?.length
    ? [...raw.requiredDays]
    : fallback.requiredDays;

  if (cycleType === "two_week_custody_block" || cycleType === "one_month_block") {
    const cycleDayCount = cycleType === "one_month_block"
      ? Math.max(
          1,
          getDayDiff(
            chore.start_date ?? getTodayKey(),
            addMonths(chore.start_date ?? getTodayKey(), 1),
          ),
        )
      : 14;
    const explicitOffsets = raw?.requiredDateOffsets
      ?.filter((offset) => Number.isInteger(offset) && offset >= 0 && offset < cycleDayCount)
      .sort((left, right) => left - right) ?? [];
    const rawPattern = raw?.custodyPattern;
    return {
      cycleType,
      weekStartsOn: "sunday",
      requiredDays,
      requiredDateOffsets: explicitOffsets,
      custodyPattern: {
        baseWeekendStartDate:
          rawPattern?.baseWeekendStartDate ??
          chore.start_date ??
          fallback.custodyPattern?.baseWeekendStartDate ??
          null,
        weekdayDays:
          rawPattern?.weekdayDays?.length
            ? [...rawPattern.weekdayDays]
            : [...defaultBlockWeekDays],
        alternatingWeekendDays:
          rawPattern?.alternatingWeekendDays?.length
            ? [...rawPattern.alternatingWeekendDays]
            : [...defaultAlternatingWeekendDays],
      },
      blockWeeks: [],
      restartRule: "next_cycle_start",
    };
  }

  return {
    cycleType: "weekly",
    weekStartsOn: "sunday",
    requiredDays,
    requiredDateOffsets: [],
    custodyPattern: null,
    blockWeeks: [requiredDays],
    restartRule: "next_cycle_start",
  };
}

function getRepeatDaysForWeek(chore: Chore, weekIndex: 0 | 1 = 0) {
  if (chore.repeat_pattern === "biweekly") {
    return weekIndex === 0 ? chore.repeat_days_week_a : chore.repeat_days_week_b;
  }

  return chore.repeat_days_week_a.length > 0 ? chore.repeat_days_week_a : chore.repeat_days;
}

function getWeekIndexForDate(chore: Chore, isoDate: string): 0 | 1 {
  const anchorDate = chore.start_date ?? getLocalDateFromTimestamp(chore.created_at);
  const dayDiff = Math.max(0, getDayDiff(anchorDate, isoDate));
  return Math.floor(dayDiff / 7) % 2 === 0 ? 0 : 1;
}

function getRepeatDaysForDate(chore: Chore, isoDate: string) {
  return getRepeatDaysForWeek(chore, getWeekIndexForDate(chore, isoDate));
}

function isLegacyRecurringChoreScheduledForDate(chore: Chore, isoDate: string) {
  const weekday = weekdayMap[parseIsoDate(isoDate).getDay() as keyof typeof weekdayMap];
  const repeatDays = getRepeatDaysForDate(chore, isoDate);
  return repeatDays.length === 0 || repeatDays.includes(weekday);
}

function getNextCycleStartDate(chore: Chore, cycleStartDate: string) {
  const schedule = normalizeRrcSchedule(chore);
  if (schedule.cycleType === "one_month_block") {
    return addMonths(cycleStartDate, 1);
  }

  return addDays(cycleStartDate, schedule.cycleType === "two_week_custody_block" ? 14 : 7);
}

export function getRrcCycleWindow(chore: Chore, todayKey = getTodayKey()) {
  const schedule = normalizeRrcSchedule(chore);

  if (schedule.cycleType === "one_month_block") {
    const anchor = chore.start_date ?? getLocalDateFromTimestamp(chore.created_at);
    let cycleStartDate = anchor;
    let nextCycleStartDate = addMonths(cycleStartDate, 1);

    if (todayKey < cycleStartDate) {
      while (todayKey < cycleStartDate) {
        nextCycleStartDate = cycleStartDate;
        cycleStartDate = addMonths(cycleStartDate, -1);
      }
    } else {
      while (todayKey >= nextCycleStartDate) {
        cycleStartDate = nextCycleStartDate;
        nextCycleStartDate = addMonths(cycleStartDate, 1);
      }
    }

    return {
      cycleId: `rrc-${schedule.cycleType}-${cycleStartDate}`,
      cycleStartDate,
      cycleEndDate: addDays(nextCycleStartDate, -1),
    };
  }

  if (schedule.cycleType === "two_week_custody_block") {
    const anchor =
      schedule.custodyPattern?.baseWeekendStartDate ??
      chore.start_date ??
      getLocalDateFromTimestamp(chore.created_at);
    const dayDiff = getDayDiff(anchor, todayKey);
    const cycleDays = 14;
    const cycleOffset = Math.floor(dayDiff / cycleDays);
    const cycleStartDate = addDays(anchor, cycleOffset * cycleDays);
    const cycleEndDate = addDays(cycleStartDate, cycleDays - 1);

    return {
      cycleId: `rrc-${schedule.cycleType}-${cycleStartDate}`,
      cycleStartDate,
      cycleEndDate,
    };
  }

  const cycleStartDate = startOfAnchoredWeek(todayKey, schedule.weekStartsOn);
  const cycleEndDate = addDays(cycleStartDate, 6);

  return {
    cycleId: `rrc-${schedule.cycleType}-${cycleStartDate}`,
    cycleStartDate,
    cycleEndDate,
  };
}

export function getRequiredDatesForRrcCycle(
  chore: Chore,
  cycleWindow: { cycleStartDate: string; cycleEndDate: string },
) {
  const schedule = normalizeRrcSchedule(chore);
  const requiredDates: string[] = [];
  const activeStartDate =
    chore.start_date ??
    schedule.custodyPattern?.baseWeekendStartDate ??
    getLocalDateFromTimestamp(chore.created_at);
  const activeEndDate = chore.due_date;
  const cursor = parseIsoDate(cycleWindow.cycleStartDate);
  const end = parseIsoDate(cycleWindow.cycleEndDate);

  while (cursor <= end) {
    const isoDate = getTodayKey(cursor);
    const weekday = weekdayMap[cursor.getDay() as keyof typeof weekdayMap];
    const offset = getDayDiff(cycleWindow.cycleStartDate, isoDate);

    if (
      isoDate >= activeStartDate &&
      (!activeEndDate || isoDate <= activeEndDate)
    ) {
      if (schedule.cycleType === "weekly") {
        const requiredDays = new Set(schedule.requiredDays);
        if (requiredDays.has(weekday)) {
          requiredDates.push(isoDate);
        }
      } else if (schedule.requiredDateOffsets?.length) {
        if (schedule.requiredDateOffsets.includes(offset)) {
          requiredDates.push(isoDate);
        }
      } else if (schedule.cycleType === "two_week_custody_block") {
        const requiredDays = new Set(schedule.requiredDays);
        const weekdayDays = new Set(schedule.custodyPattern?.weekdayDays ?? []);
        const weekendDays = new Set(schedule.custodyPattern?.alternatingWeekendDays ?? []);
        const isCustodyWeekendDate = offset === 0 || offset >= 12;
        const allowedForOffset = isCustodyWeekendDate ? weekendDays : weekdayDays;

        if (requiredDays.has(weekday) && allowedForOffset.has(weekday)) {
          requiredDates.push(isoDate);
        }
      } else {
        const weekIndex = Math.floor(offset / 7);
        const daysForWeek = schedule.blockWeeks[weekIndex] ?? [];
        if (daysForWeek.includes(weekday)) {
          requiredDates.push(isoDate);
        }
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return requiredDates;
}

export function getRrcStatus(
  chore: Chore,
  checkIns: CheckIn[],
  childId?: string,
  todayKey = getTodayKey(),
) {
  const cycleWindow = getRrcCycleWindow(chore, todayKey);
  const requiredDates = getRequiredDatesForRrcCycle(chore, cycleWindow);
  const relevantCheckIns = getNormalizedCheckInsForChore(
    chore,
    childId ? checkIns.filter((entry) => entry.child_id === childId) : checkIns,
  );
  const savedDates = new Set(
    relevantCheckIns
      .map((entry) => entry.check_in_date)
      .filter(
        (date) =>
          date >= cycleWindow.cycleStartDate &&
          date <= cycleWindow.cycleEndDate,
      ),
  );
  const missedDate = requiredDates.find((requiredDate) => requiredDate < todayKey && !savedDates.has(requiredDate)) ?? null;
  const isBroken = Boolean(missedDate);
  const completedDates = requiredDates.filter(
    (requiredDate) =>
      savedDates.has(requiredDate) && (!missedDate || requiredDate < missedDate),
  );
  const isComplete =
    !isBroken &&
    requiredDates.length > 0 &&
    requiredDates.every((requiredDate) => savedDates.has(requiredDate));
  const nextRestartDate = isBroken
    ? getNextCycleStartDate(chore, cycleWindow.cycleStartDate)
    : null;
  const canCheckInToday =
    !isBroken &&
    requiredDates.includes(todayKey) &&
    !savedDates.has(todayKey) &&
    chore.status !== "submitted" &&
    chore.status !== "approved" &&
    chore.status !== "paid";

  return {
    cycleId: cycleWindow.cycleId,
    cycleStartDate: cycleWindow.cycleStartDate,
    cycleEndDate: cycleWindow.cycleEndDate,
    requiredDates,
    completedDates,
    approvedDates:
      chore.status === "approved" || chore.status === "paid" ? [...completedDates] : [],
    missedDate,
    isBroken,
    isComplete,
    canCheckInToday,
    canRestartToday:
      !isBroken &&
      todayKey === cycleWindow.cycleStartDate &&
      completedDates.length === 0,
    nextRestartDate,
    progressCount: completedDates.length,
    requiredCount: requiredDates.length,
  };
}

export function isChoreScheduledForDate(chore: Chore, isoDate: string) {
  if (!chore.recurring) {
    return Boolean(
      (!chore.start_date || chore.start_date <= isoDate) &&
        (!chore.due_date || chore.due_date >= isoDate),
    );
  }

  if (chore.chore_kind === "routine" || (chore.chore_kind === "optional" && chore.rrc_schedule)) {
    const cycleWindow = getRrcCycleWindow(chore, isoDate);
    return getRequiredDatesForRrcCycle(chore, cycleWindow).includes(isoDate);
  }

  return isLegacyRecurringChoreScheduledForDate(chore, isoDate);
}

function getLegacyRequiredDatesForChore(chore: Chore) {
  const startDate = chore.start_date ?? getLocalDateFromTimestamp(chore.created_at);
  const endDate = chore.due_date ?? startDate;
  const cursor = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const dates: string[] = [];

  while (cursor <= end) {
    const isoDate = getTodayKey(cursor);
    if (isLegacyRecurringChoreScheduledForDate(chore, isoDate)) {
      dates.push(isoDate);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function getRequiredDatesForChore(chore: Chore, date = getTodayKey()) {
  if (chore.chore_kind === "routine") {
    return getRequiredDatesForRrcCycle(chore, getRrcCycleWindow(chore, date));
  }

  return getLegacyRequiredDatesForChore(chore);
}

export function getRequiredProgress(
  chore: Chore,
  checkIns: CheckIn[],
  date = getTodayKey(),
) {
  if (chore.chore_kind === "routine") {
    const status = getRrcStatus(chore, checkIns, chore.child_id, date);
    const progressCount = status.progressCount;
    const totalNeeded = Math.max(status.requiredCount, 1);
    const progressPercent =
      totalNeeded > 0 ? Math.min(100, Math.round((progressCount / totalNeeded) * 100)) : 0;

    return {
      requiredDates: status.requiredDates,
      completedDates: status.completedDates,
      missedDates: status.missedDate ? [status.missedDate] : [],
      todayCompleted: !status.isBroken && status.completedDates.includes(date),
      totalNeeded,
      progressCount,
      progressLabel: `${progressCount} of ${totalNeeded} check-ins complete`,
      progressPercent,
      isEligible: status.isComplete,
      streakAlive: !status.isBroken,
      streakLabel: status.isBroken ? "Streak broken" : "Streak alive",
      missedLabel: status.missedDate ? `Missed ${status.missedDate}` : null,
      cycleId: status.cycleId,
      cycleStartDate: status.cycleStartDate,
      cycleEndDate: status.cycleEndDate,
      canCheckInToday: status.canCheckInToday,
      nextRestartDate: status.nextRestartDate,
    };
  }

  const requiredDates = getLegacyRequiredDatesForChore(chore);
  const savedDates = new Set(
    getNormalizedCheckInsForChore(chore, checkIns).map((entry) => entry.check_in_date),
  );
  const completedDates = requiredDates.filter((requiredDate) => savedDates.has(requiredDate));
  const missedDates = requiredDates.filter((requiredDate) => requiredDate < date && !savedDates.has(requiredDate));
  const totalNeeded = Math.max(chore.total_required_completions ?? requiredDates.length, 1);

  return {
    requiredDates,
    completedDates,
    missedDates,
    todayCompleted: savedDates.has(date),
    totalNeeded,
    progressCount: completedDates.length,
    progressLabel: `${completedDates.length} of ${totalNeeded} days completed`,
    progressPercent: Math.min(100, Math.round((completedDates.length / totalNeeded) * 100)),
    isEligible: completedDates.length >= totalNeeded && missedDates.length === 0,
    streakAlive: missedDates.length === 0,
    streakLabel: missedDates.length === 0 ? "Streak alive" : "Streak broken",
    missedLabel:
      missedDates.length > 0
        ? `Missed ${missedDates.length} day${missedDates.length === 1 ? "" : "s"}`
        : null,
    cycleId: null,
    cycleStartDate: chore.start_date ?? getLocalDateFromTimestamp(chore.created_at),
    cycleEndDate: chore.due_date ?? chore.start_date ?? getLocalDateFromTimestamp(chore.created_at),
    canCheckInToday: !savedDates.has(date),
    nextRestartDate: null,
  };
}

export function getOptionalProgress(
  chore: Chore,
  checkIns: CheckIn[],
  date = getTodayKey(),
) {
  const todayCheckIn = getCheckInForChoreDate(checkIns, chore.id, date);
  return {
    todayCheckIn,
    completedToday: Boolean(todayCheckIn),
  };
}

export function getRollingChoreAvailability(
  chore: Chore,
  checkIns: CheckIn[],
  date = getTodayKey(),
) {
  if (chore.chore_kind === "routine") {
    const status = getRrcStatus(chore, checkIns, chore.child_id, date);
    return {
      alreadyCheckedInToday: status.completedDates.includes(date),
      canCheckInToday: status.canCheckInToday,
      isScheduled: status.requiredDates.includes(date),
      isBroken: status.isBroken,
      nextRestartDate: status.nextRestartDate,
    };
  }

  const alreadyCheckedInToday = Boolean(getCheckInForChoreDate(checkIns, chore.id, date));
  const isScheduled = isChoreScheduledForDate(chore, date);

  return {
    alreadyCheckedInToday,
    canCheckInToday: isScheduled && !alreadyCheckedInToday,
    isScheduled,
    isBroken: false,
    nextRestartDate: null,
  };
}

export function getChildEarningsTotal(chores: Chore[], childId: string) {
  return chores
    .filter((chore) => chore.child_id === childId && chore.status === "approved")
    .reduce((sum, chore) => sum + chore.amount_cents, 0);
}
