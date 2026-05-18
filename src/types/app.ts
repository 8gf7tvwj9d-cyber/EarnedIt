export type UserRole = "parent" | "child";
export type ChoreKind = "one_time" | "optional" | "routine";
export type RepeatPattern = "weekly" | "biweekly";
export type ResetFrequency = "daily" | "weekly";
export type RoutinePayoutRule = "all_or_nothing" | "partial";
export type RoutineMissBehavior = "fail_period" | "reset_streak";
export type RrcCycleType =
  | "weekly"
  | "one_week_block"
  | "two_week_custody_block"
  | "one_month_block";
export type RrcRestartRule = "next_cycle_start";
export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
export type RrcWeekStartsOn = WeekdayKey;

export type ChoreStatus =
  | "available"
  | "submitted"
  | "approved"
  | "rejected"
  | "paid"
  | "expired";

export type RrcCustodyPattern = {
  baseWeekendStartDate: string | null;
  weekdayDays: WeekdayKey[];
  alternatingWeekendDays: WeekdayKey[];
};

export type RrcSchedule = {
  cycleType: RrcCycleType;
  weekStartsOn: RrcWeekStartsOn;
  requiredDays: WeekdayKey[];
  requiredDateOffsets?: number[];
  custodyPattern: RrcCustodyPattern | null;
  blockWeeks: WeekdayKey[][];
  restartRule: RrcRestartRule;
};

export type User = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
};

export type ChildProfile = {
  id: string;
  parent_id: string;
  name: string;
  user_id: string;
};

export type Chore = {
  id: string;
  parent_id: string;
  child_id: string;
  is_template: boolean;
  template_chore_id: string | null;
  instance_period_key: string | null;
  title: string;
  description: string;
  amount_cents: number;
  start_date: string | null;
  due_date: string | null;
  recurring: boolean;
  repeat_days: WeekdayKey[];
  repeat_pattern: RepeatPattern;
  repeat_days_week_a: WeekdayKey[];
  repeat_days_week_b: WeekdayKey[];
  chore_kind: ChoreKind;
  reset_frequency: ResetFrequency;
  max_completions_per_reset: number;
  manual_availability: boolean;
  total_required_completions: number | null;
  payout_rule: RoutinePayoutRule;
  miss_behavior: RoutineMissBehavior;
  only_when_child_present: boolean;
  rrc_schedule?: RrcSchedule | null;
  status: ChoreStatus;
  rejection_note: string | null;
  photo_url: string | null;
  proof_entries: ChoreProofEntry[];
  submitted_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChoreProofEntry = {
  id: string;
  proof_date: string;
  photo_url: string;
  submitted_at: string;
};

export type CheckIn = {
  id: string;
  chore_id: string;
  parent_id: string;
  child_id: string;
  photo_url: string;
  check_in_date: string;
  submitted_at: string;
};

export type Payout = {
  id: string;
  parent_id: string;
  child_id: string;
  amount_cents: number;
  paid_method: string;
  paid_at: string;
  notes: string | null;
};

export type PaymentLineItem = {
  choreId: string;
  amountCents: number;
  statusLabel: string;
};

export type AppSession = {
  currentUserId: string | null;
};

export type AppData = {
  users: User[];
  childProfiles: ChildProfile[];
  chores: Chore[];
  checkIns: CheckIn[];
  payouts: Payout[];
  session: AppSession;
};

export type ChoreDraft = {
  id?: string;
  title: string;
  description: string;
  amount: string;
  childId: string;
  startDate: string;
  dueDate: string;
  recurring: boolean;
  repeatDays: WeekdayKey[];
  repeatPattern: RepeatPattern;
  repeatDaysWeekA: WeekdayKey[];
  repeatDaysWeekB: WeekdayKey[];
  choreKind: ChoreKind;
  resetFrequency: ResetFrequency;
  maxCompletionsPerReset: number;
  manualAvailability: boolean;
  totalRequiredCompletions: number;
  payoutRule: RoutinePayoutRule;
  missBehavior: RoutineMissBehavior;
  onlyWhenChildPresent: boolean;
  rrcSchedule: RrcSchedule;
};
