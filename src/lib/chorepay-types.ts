export type UserRole = "parent" | "child";
export type ChoreKind = "standard" | "rolling";
export type RepeatPattern = "weekly" | "biweekly";
export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type ChoreStatus =
  | "available"
  | "submitted"
  | "approved"
  | "rejected"
  | "paid"
  | "expired";

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

export type Payout = {
  id: string;
  parent_id: string;
  child_id: string;
  amount_cents: number;
  paid_method: string;
  paid_at: string;
  notes: string | null;
};

export type AppSession = {
  currentUserId: string | null;
};

export type AppData = {
  users: User[];
  childProfiles: ChildProfile[];
  chores: Chore[];
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
};
