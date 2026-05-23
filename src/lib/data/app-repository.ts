import {
  clearCompletedTestData as clearStoredCompletedTestData,
  deleteChore as deleteStoredChore,
  initializeAppData,
  markBalancePaid as markStoredBalancePaid,
  approveChore as approveStoredChore,
  overrideMissedStreak as overrideStoredMissedStreak,
  recordParentRoutineCheckIn as recordStoredParentRoutineCheckIn,
  rejectChore as rejectStoredChore,
  resetAppData,
  saveChore as saveStoredChore,
  saveRoutineCheckIn as saveStoredRoutineCheckIn,
  setCurrentUser,
  submitChore as submitStoredChore,
  submitRollingChore as submitStoredRollingChore,
  writeAppData,
  type AppDataInitialization,
} from "@/lib/storage/app-state";
import {
  getEarnedItAppBaseUrl,
  getSupabaseBrowserClient,
  getSupabaseEnvState,
  getSupabaseSetupWarning,
  logSupabaseAuthDebug,
  recoverSupabaseAuthSessionFromUrl,
} from "@/lib/supabase";
import { isEarnedItAuthTestModeEnabled } from "@/lib/auth-test-mode";
import type { AuthFlowState } from "@/lib/auth/auth-foundation";
import {
  assertHouseholdAccess,
  getHouseholdChores,
  getHouseholdChildren,
  getHouseholdId,
  getHouseholdPayments,
  getHouseholdProfiles,
  getHouseholdRecord,
  getHouseholdUsers,
} from "@/lib/data/household";
import {
  AppData,
  CheckIn,
  Chore,
  ChoreDraft,
  ChildProfile,
  Household,
  PaymentLineItem,
  Profile,
  ProofPhotoInput,
  User,
} from "@/types/app";

type AuthSessionUser = {
  displayName?: string | null;
  email?: string | null;
  id: string;
};

type HouseholdGraph = {
  childProfiles: ChildProfile[];
  household: Household;
  parentProfile: Profile;
  users: User[];
};

type HouseholdRow = {
  created_at: string;
  id: string;
  name: string;
  updated_at: string;
};

type ProfileRow = {
  created_at: string;
  display_name: string;
  email: string | null;
  household_id: string;
  household_role: Profile["household_role"];
  id: string;
  role: Profile["role"];
  updated_at: string;
  user_id: string | null;
};

type ChildRow = {
  age?: number | null;
  child_access_token?: string | null;
  created_at: string;
  display_name: string;
  gender?: string | null;
  household_id: string;
  id: string;
  login_code?: string | null;
  parent_profile_id: string | null;
  profile_id: string | null;
  updated_at: string;
};

type RemoteChoreRow = {
  amount_cents: number;
  approved_at: string | null;
  child_id: string;
  chore_kind: Chore["chore_kind"];
  client_id: string;
  created_at: string;
  description: string;
  due_date: string | null;
  household_id: string;
  id: string;
  instance_period_key: string | null;
  is_template: boolean | null;
  manual_availability: boolean | null;
  max_completions_per_reset: number | null;
  miss_behavior: Chore["miss_behavior"] | null;
  only_when_child_present: boolean | null;
  parent_id: string;
  parent_profile_id: string | null;
  paid_at: string | null;
  payout_rule: Chore["payout_rule"] | null;
  recurring: boolean;
  rejection_note: string | null;
  repeat_days: Chore["repeat_days"] | null;
  repeat_days_week_a: Chore["repeat_days_week_a"] | null;
  repeat_days_week_b: Chore["repeat_days_week_b"] | null;
  repeat_pattern: Chore["repeat_pattern"] | null;
  reset_frequency: Chore["reset_frequency"] | null;
  rrc_schedule: Chore["rrc_schedule"] | null;
  start_date: string | null;
  status: Chore["status"];
  submitted_at: string | null;
  template_chore_id: string | null;
  title: string;
  total_required_completions: number | null;
  updated_at: string;
};

type RemoteCompletionRow = {
  approved_at: string | null;
  child_id: string;
  chore_client_id?: string | null;
  chore_id: string;
  client_id: string;
  completion_date: string;
  created_at: string;
  household_id: string;
  id: string;
  parent_profile_id: string | null;
  rejected_at: string | null;
  rejection_note: string | null;
  status: string;
  submitted_at: string | null;
  updated_at: string;
};

type RemoteSyncShape = {
  checkIns: CheckIn[];
  chores: Chore[];
};

type ChildDeviceBootstrapPayload = {
  child: ChildRow;
  chores: RemoteChoreRow[];
  completions: RemoteCompletionRow[];
  household: HouseholdRow;
  parentProfile: ProfileRow | null;
};

type PendingParentSignup = {
  displayName: string;
  email: string;
  householdName: string;
};

type LocalParentCredential = {
  email: string;
  passwordHash: string;
  userId: string;
};

const PENDING_PARENT_SIGNUP_KEY = "earnedit-pending-parent-signup-v1";
const LOCAL_PARENT_AUTH_KEY = "earnedit-local-parent-auth-v1";
let supabaseSignupCallCount = 0;

const REQUIRED_BETA_MIGRATIONS = [
  "20260519_beta_multi_household_foundation.sql",
  "20260520_beta_child_login_code.sql",
  "20260520_beta_child_profile_details.sql",
  "20260520_beta_chore_sync_bridge.sql",
];

const REQUIRED_SCHEMA_OBJECTS = [
  "public.households table",
  "public.profiles table",
  "public.children table",
  "public.chores table",
  "public.chore_completions table",
  "public.children.age column",
  "public.children.gender column",
  "public.children.child_access_token column",
  "public.bootstrap_child_device(text) function",
  "public.sync_child_device_state(text, jsonb, jsonb) function",
  "household-scoped RLS policies from 20260519_beta_multi_household_foundation.sql",
  "chores_household_client_id_idx index",
  "chore_completions_household_client_id_idx index",
  "children_child_access_token_idx index",
];

// Beta safety note: keep multi-household and sync work on beta-multi-user.
export type DataBackendMode = "local" | "supabase";

export type SharedAppDataInitialization = AppDataInitialization & {
  storageMode: DataBackendMode;
  syncWarning: string | null;
};

export type SharedCommitResult = {
  appData: AppData;
  message?: string;
  ok: boolean;
  storageMode: DataBackendMode;
};

export type SharedPullResult = {
  appData: AppData | null;
  message?: string;
  ok: boolean;
  storageMode: DataBackendMode;
};

export type AuthBootstrapState = {
  authMode: "demo" | "supabase";
  canUseSupabaseAuth: boolean;
  setupWarning: string | null;
};

export type ParentSignupDraft = {
  displayName: string;
  email: string;
  householdName: string;
  password: string;
};

export type ParentLoginDraft = {
  email: string;
  password: string;
};

export type ParentAuthResult = {
  appData: AppData;
  authState: AuthFlowState;
  message: string;
  ok: boolean;
  storageMode: DataBackendMode;
};

export type ChildCreateResult = {
  appData: AppData;
  message: string;
  ok: boolean;
  storageMode: DataBackendMode;
};

export type ChildCreateDraft = {
  age?: number | string | null;
  gender?: string | null;
  name: string;
};

export type AccountProfileDraft = {
  householdName: string;
  parentDisplayName: string;
};

export type ChildDeviceLinkResult = ParentAuthResult;

function getRepositoryHouseholdId(appData: AppData) {
  return getHouseholdId(appData);
}

function makeUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  if (typeof crypto === "undefined" || !("getRandomValues" in crypto)) {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      const value = char === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (
      Number(char) ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(char) / 4)))
    ).toString(16),
  );
}

function getCurrentTimestamp() {
  return new Date().toISOString();
}

function isEmailRateLimitError(error: { message?: string | null } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("email rate limit") ||
    message.includes("rate limit") ||
    message.includes("only request this after")
  );
}

function getErrorMessage(error: unknown) {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return "Unknown Supabase error.";
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }

  return null;
}

function isNoRowsError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    getErrorCode(error) === "PGRST116" ||
    message.includes("no rows") ||
    message.includes("0 rows")
  );
}

function isMissingMigrationError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function getMissingMigrationObjects(error: unknown) {
  const message = getErrorMessage(error);
  const lowerMessage = message.toLowerCase();
  const objects = new Set<string>();
  const tableMatch =
    message.match(/table ['"]?public\.([a-z_]+)['"]?/i) ??
    message.match(/relation ['"]?public\.([a-z_]+)['"]?/i);
  const columnMatch =
    message.match(/column ['"]?([a-z_]+)['"]? of ['"]?([a-z_]+)['"]?/i) ??
    message.match(/column ['"]?([a-z_]+)['"]?.*relation ['"]?public\.([a-z_]+)['"]?/i);
  const functionMatch = message.match(/function ['"]?public\.([a-z_]+)[('"]?/i);

  if (tableMatch?.[1]) {
    objects.add(`public.${tableMatch[1]} table`);
  }

  if (columnMatch?.[1] && columnMatch?.[2]) {
    objects.add(`public.${columnMatch[2]}.${columnMatch[1]} column`);
  }

  if (functionMatch?.[1]) {
    objects.add(`public.${functionMatch[1]} function`);
  }

  for (const objectName of REQUIRED_SCHEMA_OBJECTS) {
    const searchableName = objectName
      .replace("public.", "")
      .replace(" table", "")
      .replace(" column", "")
      .replace(" function", "")
      .toLowerCase();
    if (lowerMessage.includes(searchableName)) {
      objects.add(objectName);
    }
  }

  if (isRlsDeniedError(error)) {
    objects.add("household-scoped RLS policies from 20260519_beta_multi_household_foundation.sql");
  }

  return Array.from(objects);
}

function getRequiredMigrationMessage(missingObjects: string[]) {
  const detected =
    missingObjects.length > 0
      ? `Detected missing/stale objects: ${missingObjects.join(", ")}. `
      : "";
  return `${detected}Run these beta-multi-user Supabase migrations in order: ${REQUIRED_BETA_MIGRATIONS.join(" -> ")}. Then confirm expected objects: ${REQUIRED_SCHEMA_OBJECTS.join(", ")}.`;
}

function logSupabaseDiagnostic(context: string, error: unknown) {
  const missingMigrationObjects = getMissingMigrationObjects(error);
  console.warn(`[Earned auth] ${context}`, error);
  console.info("[Earned auth] Beta Supabase setup diagnostic", {
    context,
    missingMigrationObjects,
    migrationOrder: REQUIRED_BETA_MIGRATIONS,
    setupDiagnostic: getRequiredMigrationMessage(missingMigrationObjects),
  });
  logSupabaseAuthDebug(context, {
    missingMigrationObjects,
  });
}

function isRlsDeniedError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("violates row-level security policy")
  );
}

function isNetworkError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetcherror") ||
    message.includes("timeout")
  );
}

function describeSupabaseError(error: unknown, fallback: string) {
  if (isMissingMigrationError(error)) {
    return "The beta database is not ready for this account yet. Please ask an admin to run the latest beta Supabase setup, then try again.";
  }

  if (isRlsDeniedError(error)) {
    return "We signed you in, but household setup could not finish. Please try again or contact support.";
  }

  if (isNetworkError(error)) {
    return "Could not reach Supabase. Check the network connection and Supabase project URL.";
  }

  const message = getErrorMessage(error);
  return message === "Unknown Supabase error." ? fallback : message;
}

function getDatabaseAuthState(error: unknown): AuthFlowState {
  return isMissingMigrationError(error) ? "migration_missing" : "database_error";
}

function getSignupErrorMessage(error: { message?: string | null } | null | undefined) {
  if (isEmailRateLimitError(error)) {
    return "Supabase email rate limit hit during beta signup. The app will not retry automatically. Wait for the email window to reset, disable confirmation for internal testing, or manually confirm the user in Supabase Auth.";
  }

  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("already registered") || message.includes("already exists")) {
    return "An account already exists for this email. Try logging in instead.";
  }

  return describeSupabaseError(error, "Parent signup failed.");
}

function getEmailConfirmationMessage(email: string) {
  return `Account created for ${email}. Please confirm your email, then log in.`;
}

function getLoginErrorMessage(error: { message?: string | null } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  if (
    message.includes("invalid login") ||
    message.includes("invalid credentials") ||
    message.includes("email not confirmed")
  ) {
    return message.includes("email not confirmed")
      ? "Please confirm your email before logging in."
      : "Invalid login. Check the email and password, then try again.";
  }

  return describeSupabaseError(error, "Parent login failed.");
}

function makeLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeChildAccessToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `child_${crypto.randomUUID()}_${crypto.randomUUID()}`;
  }

  return `child_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random()
    .toString(36)
    .slice(2)}`;
}

async function hashLocalParentPassword(email: string, password: string) {
  const input = `${email.trim().toLowerCase()}:${password}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  return btoa(input);
}

function readLocalParentCredentials(): LocalParentCredential[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_PARENT_AUTH_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is LocalParentCredential => {
      return (
        entry &&
        typeof entry === "object" &&
        typeof (entry as LocalParentCredential).email === "string" &&
        typeof (entry as LocalParentCredential).passwordHash === "string" &&
        typeof (entry as LocalParentCredential).userId === "string"
      );
    });
  } catch (error) {
    console.warn("[Earned auth] Could not read local beta parent credentials.", error);
    return [];
  }
}

function writeLocalParentCredentials(credentials: LocalParentCredential[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_PARENT_AUTH_KEY, JSON.stringify(credentials));
}

async function saveLocalParentCredential(email: string, password: string, userId: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashLocalParentPassword(normalizedEmail, password);
  const credentials = readLocalParentCredentials().filter(
    (credential) => credential.email !== normalizedEmail,
  );
  credentials.push({
    email: normalizedEmail,
    passwordHash,
    userId,
  });
  writeLocalParentCredentials(credentials);
}

function normalizeChildDraft(childDraft: string | ChildCreateDraft) {
  const name = typeof childDraft === "string" ? childDraft : childDraft.name;
  const ageValue = typeof childDraft === "string" ? null : childDraft.age;
  const parsedAge =
    ageValue === null || ageValue === undefined || ageValue === ""
      ? null
      : Number(ageValue);
  const rawGender = typeof childDraft === "string" ? null : childDraft.gender?.trim().toLowerCase() || null;
  const gender =
    rawGender === "boy"
      ? "male"
      : rawGender === "girl"
        ? "female"
        : rawGender;

  return {
    age: parsedAge !== null && Number.isFinite(parsedAge) ? Math.round(parsedAge) : null,
    gender,
    name: name.trim(),
  };
}

function getChildDraftValidationMessage(draft: ReturnType<typeof normalizeChildDraft>) {
  if (!draft.name) {
    return "Enter a child name first.";
  }

  if (draft.age === null || draft.age < 1 || draft.age > 18) {
    return "Enter an age from 1 to 18.";
  }

  if (draft.gender !== "male" && draft.gender !== "female") {
    return "Select Male or Female for the child profile.";
  }

  return null;
}

function toUsername(source: string) {
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "member";
}

function createLocalAuthTestAppData(
  localAppData: AppData,
  draft: Required<Pick<ParentSignupDraft, "displayName" | "email" | "householdName">>,
): AppData {
  const timestamp = getCurrentTimestamp();
  const householdId = makeLocalId("beta-household");
  const authUserId = makeLocalId("beta-auth-user");
  const parentProfileId = makeLocalId("beta-profile");
  return {
    ...localAppData,
    households: [
      {
        id: householdId,
        name: draft.householdName,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    profiles: [
      {
        id: parentProfileId,
        household_id: householdId,
        user_id: authUserId,
        display_name: draft.displayName,
        role: "parent",
        household_role: "owner",
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    users: [
      {
        id: authUserId,
        household_id: householdId,
        auth_user_id: authUserId,
        name: draft.displayName,
        username: toUsername(draft.email),
        email: draft.email,
        role: "parent",
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    childProfiles: [],
    chores: [],
    checkIns: [],
    payouts: [],
    session: {
      currentUserId: authUserId,
      currentHouseholdId: householdId,
      authUserId,
      authMode: "demo",
    },
  };
}

function savePendingParentSignup(pendingSignup: PendingParentSignup) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PENDING_PARENT_SIGNUP_KEY, JSON.stringify(pendingSignup));
}

function readPendingParentSignup(email: string): PendingParentSignup | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(PENDING_PARENT_SIGNUP_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PendingParentSignup>;
    if (
      parsed.email?.trim().toLowerCase() === email.trim().toLowerCase() &&
      parsed.displayName?.trim() &&
      parsed.householdName?.trim()
    ) {
      return {
        displayName: parsed.displayName.trim(),
        email: parsed.email.trim().toLowerCase(),
        householdName: parsed.householdName.trim(),
      };
    }
  } catch (error) {
    console.warn("[Earned auth] Could not read pending parent signup.", error);
  }

  return null;
}

function clearPendingParentSignup() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PENDING_PARENT_SIGNUP_KEY);
}

function buildParentUser(profile: ProfileRow, authUser: AuthSessionUser): User {
  return {
    id: authUser.id,
    household_id: profile.household_id,
    auth_user_id: authUser.id,
    name: profile.display_name,
    username: toUsername(profile.email ?? authUser.email ?? profile.display_name),
    email: profile.email ?? authUser.email ?? null,
    role: "parent",
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

function buildChildProfile(row: ChildRow, parentUserId: string): ChildProfile {
  const rawGender = row.gender?.trim().toLowerCase() ?? null;
  const gender =
    rawGender === "boy"
      ? "male"
      : rawGender === "girl"
        ? "female"
        : rawGender;

  return {
    id: row.id,
    household_id: row.household_id,
    parent_id: parentUserId,
    name: row.display_name,
    age: row.age ?? null,
    gender: gender === "male" || gender === "female" ? gender : null,
    user_id: `child-user-${row.id}`,
    access_token: row.child_access_token ?? row.login_code ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildChildUser(childProfile: ChildProfile): User {
  return {
    id: childProfile.user_id,
    household_id: childProfile.household_id,
    auth_user_id: null,
    name: childProfile.name,
    username: toUsername(childProfile.name),
    email: null,
    role: "child",
    created_at: childProfile.created_at,
    updated_at: childProfile.updated_at,
  };
}

function withSupabaseSessionContext(localAppData: AppData, authUserId: string | null) {
  return {
    ...localAppData,
    session: {
      ...localAppData.session,
      currentUserId: authUserId,
      currentHouseholdId: authUserId ? localAppData.session.currentHouseholdId : null,
      authUserId,
      authMode: "supabase" as const,
    },
  };
}

function mergeRemoteHouseholdIntoLocal(
  localAppData: AppData,
  graph: HouseholdGraph,
  authUser: AuthSessionUser,
  remoteState?: RemoteSyncShape,
): AppData {
  const householdId = graph.household.id;
  const localChoresById = new Map(
    localAppData.chores
      .filter((chore) => chore.household_id === householdId)
      .map((chore) => [chore.id, chore]),
  );
  const localCheckInsById = new Map(
    localAppData.checkIns
      .filter((entry) => entry.household_id === householdId)
      .map((entry) => [entry.id, entry]),
  );

  const chores =
    remoteState?.chores.map((remoteChore) => {
      const localChore = localChoresById.get(remoteChore.id);
      return {
        ...remoteChore,
        photo_url: localChore?.photo_url ?? null,
        proof_entries: localChore?.proof_entries ?? [],
        streak_overrides: localChore?.streak_overrides ?? [],
      };
    }) ?? localAppData.chores.filter((chore) => chore.household_id === householdId);

  const checkIns =
    remoteState?.checkIns.map((remoteCheckIn) => {
      const localCheckIn = localCheckInsById.get(remoteCheckIn.id);
      return {
        ...remoteCheckIn,
        photo_url: localCheckIn?.photo_url ?? remoteCheckIn.photo_url,
        photos: localCheckIn?.photos ?? remoteCheckIn.photos ?? [],
        uploaded_at: localCheckIn?.uploaded_at ?? remoteCheckIn.uploaded_at,
      };
    }) ?? localAppData.checkIns.filter((entry) => entry.household_id === householdId);

  return {
    ...localAppData,
    households: [graph.household],
    profiles: [graph.parentProfile],
    users: graph.users,
    childProfiles: graph.childProfiles,
    chores,
    checkIns,
    payouts: localAppData.payouts.filter((payout) => payout.household_id === householdId),
    session: {
      currentUserId: authUser.id,
      currentHouseholdId: householdId,
      authUserId: authUser.id,
      authMode: "supabase",
    },
  };
}

function buildRemoteChoreRow(chore: Chore, parentProfileId: string | null): Omit<RemoteChoreRow, "id"> {
  return {
    household_id: chore.household_id,
    client_id: chore.id,
    parent_id: chore.parent_id,
    parent_profile_id: parentProfileId,
    child_id: chore.child_id,
    title: chore.title,
    description: chore.description,
    amount_cents: chore.amount_cents,
    start_date: chore.start_date,
    due_date: chore.due_date,
    recurring: chore.recurring,
    repeat_days: chore.repeat_days,
    repeat_pattern: chore.repeat_pattern,
    repeat_days_week_a: chore.repeat_days_week_a,
    repeat_days_week_b: chore.repeat_days_week_b,
    chore_kind: chore.chore_kind,
    reset_frequency: chore.reset_frequency,
    max_completions_per_reset: chore.max_completions_per_reset,
    manual_availability: chore.manual_availability,
    total_required_completions: chore.total_required_completions,
    payout_rule: chore.payout_rule,
    miss_behavior: chore.miss_behavior,
    only_when_child_present: chore.only_when_child_present,
    rrc_schedule: chore.rrc_schedule ?? null,
    is_template: chore.is_template,
    template_chore_id: chore.template_chore_id,
    instance_period_key: chore.instance_period_key,
    status: chore.status,
    rejection_note: chore.rejection_note,
    submitted_at: chore.submitted_at,
    approved_at: chore.approved_at,
    paid_at: chore.paid_at,
    created_at: chore.created_at,
    updated_at: chore.updated_at,
  };
}

function buildRemoteCompletionRow(
  checkIn: CheckIn,
  remoteChoreId: string,
  parentProfileId: string | null,
) {
  return {
    household_id: checkIn.household_id,
    client_id: checkIn.id,
    chore_id: remoteChoreId,
    child_id: checkIn.child_id,
    parent_profile_id: parentProfileId,
    completion_date: checkIn.check_in_date,
    status: "submitted",
    submitted_at: checkIn.submitted_at,
    approved_at: null,
    rejected_at: null,
    rejection_note: null,
    created_at: checkIn.created_at,
    updated_at: checkIn.updated_at,
  };
}

function hydrateRemoteChore(remoteChore: RemoteChoreRow): Chore {
  return {
    id: remoteChore.client_id,
    household_id: remoteChore.household_id,
    parent_id: remoteChore.parent_id,
    child_id: remoteChore.child_id,
    is_template: remoteChore.is_template ?? false,
    template_chore_id: remoteChore.template_chore_id,
    instance_period_key: remoteChore.instance_period_key,
    title: remoteChore.title,
    description: remoteChore.description,
    amount_cents: remoteChore.amount_cents,
    start_date: remoteChore.start_date,
    due_date: remoteChore.due_date,
    recurring: remoteChore.recurring,
    repeat_days: remoteChore.repeat_days ?? [],
    repeat_pattern: remoteChore.repeat_pattern ?? "weekly",
    repeat_days_week_a: remoteChore.repeat_days_week_a ?? remoteChore.repeat_days ?? [],
    repeat_days_week_b: remoteChore.repeat_days_week_b ?? [],
    chore_kind: remoteChore.chore_kind ?? "one_time",
    reset_frequency: remoteChore.reset_frequency ?? "daily",
    max_completions_per_reset: remoteChore.max_completions_per_reset ?? 1,
    manual_availability: remoteChore.manual_availability ?? false,
    total_required_completions: remoteChore.total_required_completions,
    payout_rule: remoteChore.payout_rule ?? "all_or_nothing",
    miss_behavior: remoteChore.miss_behavior ?? "fail_period",
    only_when_child_present: remoteChore.only_when_child_present ?? false,
    rrc_schedule: remoteChore.rrc_schedule ?? null,
    status: remoteChore.status,
    rejection_note: remoteChore.rejection_note,
    photo_url: null,
    proof_entries: [],
    streak_overrides: [],
    submitted_at: remoteChore.submitted_at,
    approved_at: remoteChore.approved_at,
    paid_at: remoteChore.paid_at,
    created_at: remoteChore.created_at,
    updated_at: remoteChore.updated_at,
  };
}

function hydrateRemoteCompletion(
  remoteCompletion: RemoteCompletionRow,
  remoteChoresById: Map<string, RemoteChoreRow>,
): CheckIn | null {
  const remoteChore = remoteChoresById.get(remoteCompletion.chore_id);
  if (!remoteChore) {
    return null;
  }

  return {
    id: remoteCompletion.client_id,
    household_id: remoteCompletion.household_id,
    chore_id: remoteChore.client_id,
    parent_id: remoteChore.parent_id,
    child_id: remoteCompletion.child_id,
    photo_url: "",
    photos: [],
    check_in_date: remoteCompletion.completion_date,
    submitted_at: remoteCompletion.submitted_at ?? remoteCompletion.created_at,
    uploaded_at: remoteCompletion.submitted_at ?? remoteCompletion.created_at,
    created_at: remoteCompletion.created_at,
    updated_at: remoteCompletion.updated_at,
  };
}

async function loadRemoteHouseholdGraph(authUser: AuthSessionUser): Promise<HouseholdGraph | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return null;
  }

  const { data: parentProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, household_id, user_id, email, display_name, role, household_role, created_at, updated_at")
    .eq("user_id", authUser.id)
    .eq("role", "parent")
    .maybeSingle<ProfileRow>();

  if (profileError) {
    throw profileError;
  }

  if (!parentProfile) {
    return null;
  }

  const { data: loadedHousehold, error: householdError } = await supabase
    .from("households")
    .select("id, name, created_at, updated_at")
    .eq("id", parentProfile.household_id)
    .single<HouseholdRow>();
  let household = loadedHousehold;

  if (householdError) {
    if (!isNoRowsError(householdError)) {
      throw householdError;
    }

    console.info("[Earned auth] Parent profile points to a missing household; repairing.", {
      authUserId: authUser.id,
      householdId: parentProfile.household_id,
    });
    const repairedHousehold = await repairMissingParentHousehold(parentProfile, authUser);
    household = repairedHousehold;
  }

  if (!household) {
    throw new Error("Parent household could not be loaded.");
  }

  const { data: children, error: childrenError } = await supabase
    .from("children")
    .select("id, household_id, profile_id, parent_profile_id, display_name, age, gender, child_access_token, created_at, updated_at")
    .eq("household_id", parentProfile.household_id)
    .order("created_at", { ascending: true })
    .returns<ChildRow[]>();

  if (childrenError) {
    throw childrenError;
  }

  const parentUser = buildParentUser(parentProfile, authUser);
  const childProfiles = (children ?? []).map((child) => buildChildProfile(child, parentUser.id));

  return {
    household,
    parentProfile,
    childProfiles,
    users: [parentUser, ...childProfiles.map((childProfile) => buildChildUser(childProfile))],
  };
}

async function repairMissingParentHousehold(
  parentProfile: ProfileRow,
  authUser: AuthSessionUser,
): Promise<HouseholdRow> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const timestamp = getCurrentTimestamp();
  const householdName = `${parentProfile.display_name?.trim() || getAuthUserDisplayName(authUser, parentProfile.email ?? authUser.email ?? "")}'s Household`;
  const household: HouseholdRow = {
    id: parentProfile.household_id,
    name: householdName,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const { error: insertError } = await supabase.from("households").insert(household);
  if (insertError && getErrorCode(insertError) !== "23505") {
    throw insertError;
  }

  const { data: reloadedHousehold, error: reloadError } = await supabase
    .from("households")
    .select("id, name, created_at, updated_at")
    .eq("id", parentProfile.household_id)
    .single<HouseholdRow>();

  if (reloadError) {
    throw reloadError;
  }

  return reloadedHousehold;
}

async function getSignedInAuthUser(): Promise<AuthSessionUser | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return null;
  }

  await recoverSupabaseAuthSessionFromUrl();

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.user) {
    logSupabaseAuthDebug("getSession", {
      sessionExists: false,
      userIdExists: false,
    });
    return null;
  }

  logSupabaseAuthDebug("getSession", {
    sessionExists: true,
    userIdExists: Boolean(session.user.id),
  });

  return {
      id: session.user.id,
      email: session.user.email ?? null,
      displayName:
        typeof session.user.user_metadata?.display_name === "string"
          ? session.user.user_metadata.display_name
          : null,
    };
}

function getAuthUserDisplayName(authUser: AuthSessionUser, fallbackEmail: string) {
  const metadataName = authUser.displayName?.trim();
  if (metadataName) {
    return metadataName;
  }

  const emailName = (authUser.email ?? fallbackEmail).split("@")[0]?.trim();
  return emailName ? toUsername(emailName).replace(/-/g, " ") : "Parent";
}

function getRepairParentSignup(authUser: AuthSessionUser, fallbackEmail: string): PendingParentSignup {
  const email = (authUser.email ?? fallbackEmail).trim().toLowerCase();
  const displayName = getAuthUserDisplayName(authUser, email);
  return {
    displayName,
    email,
    householdName: `${displayName}'s Household`,
  };
}

async function loadRemoteChoreState(
  householdId: string,
): Promise<RemoteSyncShape> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      chores: [],
      checkIns: [],
    };
  }

  const { data: remoteChores, error: choresError } = await supabase
    .from("chores")
    .select(
      "id, client_id, household_id, parent_id, parent_profile_id, child_id, title, description, amount_cents, start_date, due_date, recurring, repeat_days, repeat_pattern, repeat_days_week_a, repeat_days_week_b, chore_kind, reset_frequency, max_completions_per_reset, manual_availability, total_required_completions, payout_rule, miss_behavior, only_when_child_present, rrc_schedule, is_template, template_chore_id, instance_period_key, status, rejection_note, submitted_at, approved_at, paid_at, created_at, updated_at",
    )
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .returns<RemoteChoreRow[]>();

  if (choresError) {
    throw choresError;
  }

  const remoteChoresById = new Map((remoteChores ?? []).map((chore) => [chore.id, chore]));

  const { data: remoteCompletions, error: completionsError } = await supabase
    .from("chore_completions")
    .select(
      "id, client_id, household_id, chore_id, child_id, parent_profile_id, completion_date, status, submitted_at, approved_at, rejected_at, rejection_note, created_at, updated_at",
    )
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .returns<RemoteCompletionRow[]>();

  if (completionsError) {
    throw completionsError;
  }

  return {
    chores: (remoteChores ?? []).map(hydrateRemoteChore),
    checkIns: (remoteCompletions ?? [])
      .map((completion) => hydrateRemoteCompletion(completion, remoteChoresById))
      .filter((entry): entry is CheckIn => Boolean(entry)),
  };
}

async function createRemoteParentHousehold(
  authUser: AuthSessionUser,
  pendingSignup: PendingParentSignup,
): Promise<{
  authState: AuthFlowState;
  graph: HouseholdGraph | null;
  household: HouseholdRow | null;
  message: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      authState: "auth_error",
      graph: null,
      household: null,
      message: "Supabase is not configured yet.",
    };
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[Earned auth] Household bootstrap starts.", { authUserId: authUser.id });
  }

  const existingGraph = await loadRemoteHouseholdGraph(authUser);
  if (existingGraph) {
    if (process.env.NODE_ENV === "development") {
      console.info("[Earned auth] Existing parent profile found.", {
        householdId: existingGraph.household.id,
      });
    }

    return {
      authState: "ready",
      graph: existingGraph,
      household: null,
      message: null,
    };
  }

  const timestamp = getCurrentTimestamp();
  const household: HouseholdRow = {
    id: makeUuid(),
    name: pendingSignup.householdName,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const { error: householdError } = await supabase.from("households").insert(household);

  if (householdError) {
    return {
      authState: getDatabaseAuthState(householdError),
      graph: null,
      household: null,
      message: describeSupabaseError(householdError, "Household could not be created."),
    };
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[Earned auth] Household created.", { householdId: household.id });
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    household_id: household.id,
    user_id: authUser.id,
    email: pendingSignup.email,
    display_name: pendingSignup.displayName,
    role: "parent",
    household_role: "owner",
    created_at: timestamp,
    updated_at: timestamp,
  });

  if (profileError) {
    if (getErrorCode(profileError) === "23505") {
      const graph = await loadRemoteHouseholdGraph(authUser);
      if (graph) {
        return {
          authState: "ready",
          graph,
          household: null,
          message: null,
        };
      }
    }

    return {
      authState: getDatabaseAuthState(profileError),
      graph: null,
      household,
      message: describeSupabaseError(profileError, "Parent profile could not be created."),
    };
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[Earned auth] Parent profile created.", {
      authUserId: authUser.id,
      householdId: household.id,
    });
  }

  const graph = await loadRemoteHouseholdGraph(authUser);
  return {
    authState: graph ? "ready" : "database_error",
    graph,
    household,
    message: graph ? null : "Household was created, but the account profile could not be reloaded.",
  };
}

async function syncRemoteChoreState(
  nextData: AppData,
  graph: HouseholdGraph,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const householdId = graph.household.id;
  const localChores = getHouseholdChores(nextData, householdId);
  const localCheckIns = nextData.checkIns.filter((entry) => entry.household_id === householdId);

  const chorePayload = localChores.map((chore) => buildRemoteChoreRow(chore, graph.parentProfile.id));
  if (chorePayload.length > 0) {
    const { error: upsertChoreError } = await supabase
      .from("chores")
      .upsert(chorePayload, { onConflict: "household_id,client_id" });

    if (upsertChoreError) {
      throw upsertChoreError;
    }
  }

  const { data: remoteChores, error: fetchChoresError } = await supabase
    .from("chores")
    .select("id, client_id, household_id, parent_id, parent_profile_id, child_id, title, description, amount_cents, start_date, due_date, recurring, repeat_days, repeat_pattern, repeat_days_week_a, repeat_days_week_b, chore_kind, reset_frequency, max_completions_per_reset, manual_availability, total_required_completions, payout_rule, miss_behavior, only_when_child_present, rrc_schedule, is_template, template_chore_id, instance_period_key, status, rejection_note, submitted_at, approved_at, paid_at, created_at, updated_at")
    .eq("household_id", householdId)
    .returns<RemoteChoreRow[]>();

  if (fetchChoresError) {
    throw fetchChoresError;
  }

  const remoteChoreIdByClientId = new Map(
    (remoteChores ?? []).map((remoteChore) => [remoteChore.client_id, remoteChore.id]),
  );

  const completionPayload = localCheckIns
    .map((checkIn) => {
      const remoteChoreId = remoteChoreIdByClientId.get(checkIn.chore_id);
      if (!remoteChoreId) {
        return null;
      }

      return buildRemoteCompletionRow(checkIn, remoteChoreId, graph.parentProfile.id);
    })
    .filter(
      (
        completion,
      ): completion is ReturnType<typeof buildRemoteCompletionRow> => Boolean(completion),
    );

  if (completionPayload.length > 0) {
    const { error: upsertCompletionError } = await supabase
      .from("chore_completions")
      .upsert(completionPayload, { onConflict: "household_id,client_id" });

    if (upsertCompletionError) {
      throw upsertCompletionError;
    }
  }

  const localChoreIds = new Set(localChores.map((chore) => chore.id));
  const remoteChoreClientIds = (remoteChores ?? []).map((remoteChore) => remoteChore.client_id);
  const removedRemoteChoreIds = remoteChoreClientIds.filter((clientId) => !localChoreIds.has(clientId));
  if (removedRemoteChoreIds.length > 0) {
    const { error: deleteRemoteChoresError } = await supabase
      .from("chores")
      .delete()
      .eq("household_id", householdId)
      .in("client_id", removedRemoteChoreIds);

    if (deleteRemoteChoresError) {
      throw deleteRemoteChoresError;
    }
  }

  const { data: remoteCompletions, error: fetchRemoteCompletionsError } = await supabase
    .from("chore_completions")
    .select("client_id")
    .eq("household_id", householdId)
    .returns<Array<{ client_id: string }>>();

  if (fetchRemoteCompletionsError) {
    throw fetchRemoteCompletionsError;
  }

  const localCompletionIds = new Set(localCheckIns.map((entry) => entry.id));
  const removedRemoteCompletionIds = (remoteCompletions ?? [])
    .map((completion) => completion.client_id)
    .filter((clientId) => !localCompletionIds.has(clientId));

  if (removedRemoteCompletionIds.length > 0) {
    const { error: deleteRemoteCompletionsError } = await supabase
      .from("chore_completions")
      .delete()
      .eq("household_id", householdId)
      .in("client_id", removedRemoteCompletionIds);

    if (deleteRemoteCompletionsError) {
      throw deleteRemoteCompletionsError;
    }
  }
}

async function syncRemoteChildDeviceState(
  nextData: AppData,
  childProfile: ChildProfile,
): Promise<AppData | null> {
  const supabase = getSupabaseBrowserClient();
  const accessToken = childProfile.access_token;
  if (!supabase || !accessToken) {
    return null;
  }

  const childChores = nextData.chores.filter((chore) => chore.child_id === childProfile.id);
  const childCheckIns = nextData.checkIns.filter((entry) => entry.child_id === childProfile.id);
  const { data, error } = await supabase.rpc("sync_child_device_state", {
    access_token: accessToken,
    chore_rows: childChores.map((chore) => ({
      client_id: chore.id,
      rejection_note: chore.rejection_note,
      status: chore.status,
      submitted_at: chore.submitted_at,
    })),
    completion_rows: childCheckIns.map((entry) => ({
      chore_client_id: entry.chore_id,
      client_id: entry.id,
      completion_date: entry.check_in_date,
      status: "submitted",
      submitted_at: entry.submitted_at,
    })),
  });

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mergeChildDeviceLinkIntoLocal(nextData, data as ChildDeviceBootstrapPayload);
}

export function getAuthBootstrapState(): AuthBootstrapState {
  const envState = getSupabaseEnvState();
  return {
    authMode: envState.mode,
    canUseSupabaseAuth: envState.configured,
    setupWarning: getSupabaseSetupWarning(),
  };
}

export async function loadAppData(): Promise<SharedAppDataInitialization> {
  const local = initializeAppData();
  const authBootstrap = getAuthBootstrapState();
  let authUserForFailure: AuthSessionUser | null = null;

  if (isEarnedItAuthTestModeEnabled()) {
    return {
      ...local,
      storageMode: "local",
      syncWarning: "Local beta auth mode is active. Data is stored in this browser.",
    };
  }

  if (!authBootstrap.canUseSupabaseAuth) {
    return {
      ...local,
      storageMode: "local",
      syncWarning: authBootstrap.setupWarning,
    };
  }

  try {
    const activeChildDeviceProfile = getActiveChildDeviceProfile(local.appData);
    if (activeChildDeviceProfile?.access_token) {
      const childDeviceData = await bootstrapChildDeviceSession(
        activeChildDeviceProfile.access_token,
        local.appData,
      );
      if (childDeviceData) {
        writeAppData(childDeviceData);
        return {
          appData: childDeviceData,
          shouldPersist: false,
          storageMode: "supabase",
          syncWarning: null,
        };
      }
    }

    const authUser = await getSignedInAuthUser();
    authUserForFailure = authUser;
    if (!authUser) {
      const signedOutAppData = withSupabaseSessionContext(local.appData, null);
      return {
        appData: signedOutAppData,
        shouldPersist: true,
        storageMode: "supabase",
        syncWarning: "Sign in to load your household.",
      };
    }

    const graph = await loadRemoteHouseholdGraph(authUser);
    if (!graph) {
      const signedInWithoutProfile = withSupabaseSessionContext(local.appData, authUser.id);
      return {
        appData: signedInWithoutProfile,
        shouldPersist: true,
        storageMode: "supabase",
        syncWarning: "Your account is signed in, but no parent household profile was found yet.",
      };
    }

    let remoteState = await loadRemoteChoreState(graph.household.id);
    if (
      remoteState.chores.length === 0 &&
      getHouseholdChores(local.appData, graph.household.id).length > 0
    ) {
      await syncRemoteChoreState(local.appData, graph);
      remoteState = await loadRemoteChoreState(graph.household.id);
    }

    const merged = mergeRemoteHouseholdIntoLocal(local.appData, graph, authUser, remoteState);
    return {
      appData: merged,
      shouldPersist: true,
      storageMode: "supabase",
      syncWarning: null,
    };
  } catch (error) {
    logSupabaseDiagnostic("household_bootstrap_failed", error);
    logSupabaseAuthDebug("household_bootstrap_failed", {
      sessionExists: Boolean(authUserForFailure),
      userIdExists: Boolean(authUserForFailure?.id),
      missingMigrationObjects: getMissingMigrationObjects(error),
    });
    return {
      appData: withSupabaseSessionContext(local.appData, authUserForFailure?.id ?? null),
      shouldPersist: true,
      storageMode: "supabase",
      syncWarning: describeSupabaseError(
        error,
        "Supabase is configured, but household data could not be loaded.",
      ),
    };
  }
}

export async function syncAppData(nextData: AppData): Promise<SharedCommitResult> {
  const ok = writeAppData(nextData);
  if (nextData.session.authMode !== "supabase") {
    return {
      appData: nextData,
      ok,
      storageMode: "local",
    };
  }

  const activeUser = nextData.users.find((user) => user.id === nextData.session.currentUserId);
  if (activeUser?.role === "child") {
    try {
      const childProfile = nextData.childProfiles.find((profile) => profile.user_id === activeUser.id);
      const syncedChildData = childProfile
        ? await syncRemoteChildDeviceState(nextData, childProfile)
        : null;
      if (syncedChildData) {
        writeAppData(syncedChildData);
        return {
          appData: syncedChildData,
          ok: true,
          storageMode: "supabase",
        };
      }
    } catch (error) {
      console.warn("[Earned] Child device sync failed.", error);
    }

    return {
      appData: nextData,
      ok,
      storageMode: "supabase",
    };
  }

  try {
    const authUser = await getSignedInAuthUser();
    if (!authUser) {
      return {
        appData: nextData,
        ok,
        storageMode: "supabase",
        message: "Sign in before syncing household data.",
      };
    }

    const graph = await loadRemoteHouseholdGraph(authUser);
    if (!graph) {
      return {
        appData: nextData,
        ok,
        storageMode: "supabase",
        message: "Parent household profile was not found. Household sync did not run.",
      };
    }

    await syncRemoteChoreState(nextData, graph);
    const remoteState = await loadRemoteChoreState(graph.household.id);
    const merged = mergeRemoteHouseholdIntoLocal(nextData, graph, authUser, remoteState);
    writeAppData(merged);
    return {
      appData: merged,
      ok: true,
      storageMode: "supabase",
    };
  } catch (error) {
    console.warn("[Earned] Chore sync failed.", error);
    return {
      appData: nextData,
      ok,
      storageMode: "supabase",
      message: describeSupabaseError(
        error,
        "Supabase household sync failed. Local changes remain in this browser until sync succeeds.",
      ),
    };
  }
}

export async function pullAppDataSnapshot(localAppData: AppData): Promise<SharedPullResult> {
  const authBootstrap = getAuthBootstrapState();
  if (!authBootstrap.canUseSupabaseAuth) {
    return {
      appData: null,
      ok: false,
      storageMode: "local",
      message: authBootstrap.setupWarning ?? "Supabase is not configured yet.",
    };
  }

  try {
    const authUser = await getSignedInAuthUser();
    if (!authUser) {
      return {
        appData: withSupabaseSessionContext(localAppData, null),
        ok: true,
        storageMode: "supabase",
      };
    }

    const graph = await loadRemoteHouseholdGraph(authUser);
    if (!graph) {
      return {
        appData: withSupabaseSessionContext(localAppData, authUser.id),
        ok: true,
        storageMode: "supabase",
        message: "Your account is signed in, but no parent household profile was found yet.",
      };
    }

    const remoteState = await loadRemoteChoreState(graph.household.id);
    const merged = mergeRemoteHouseholdIntoLocal(localAppData, graph, authUser, remoteState);
    writeAppData(merged);
    return {
      appData: merged,
      ok: true,
      storageMode: "supabase",
    };
  } catch (error) {
    console.warn("[Earned] Supabase household refresh failed.", error);
    return {
      appData: null,
      ok: false,
      storageMode: "supabase",
      message: describeSupabaseError(
        error,
        "Supabase household refresh failed. Refresh again after fixing the database issue.",
      ),
    };
  }
}

export function persistLocalAppData(nextData: AppData) {
  return writeAppData(nextData);
}

export function resetLocalAppData() {
  return resetAppData();
}

export function setActiveUser(appData: AppData, userId: string | null) {
  return setCurrentUser(appData, userId);
}

export async function signUpParentWithHousehold(
  draft: ParentSignupDraft,
  localAppData: AppData,
): Promise<ParentAuthResult> {
  const displayName = draft.displayName.trim();
  const householdName = draft.householdName.trim();
  const email = draft.email.trim().toLowerCase();
  if (!displayName || !householdName || !email || !draft.password.trim()) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "supabase",
      message: "Please complete every field before creating a household.",
    };
  }

  if (isEarnedItAuthTestModeEnabled()) {
    const appData = createLocalAuthTestAppData(localAppData, {
      displayName,
      email,
      householdName,
    });
    await saveLocalParentCredential(email, draft.password, appData.session.currentUserId ?? "");
    writeAppData(appData);
    if (process.env.NODE_ENV === "development") {
      console.info("EarnedIt auth test mode active");
      console.info("[Earned auth] NEXT_PUBLIC_EARNEDIT_AUTH_TEST_MODE handled signup locally.");
    }
    return {
      appData,
      authState: "ready",
      ok: true,
      storageMode: "local",
      message: `Local beta test household ${householdName} is ready. Supabase signup was skipped.`,
    };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "local",
      message: "Supabase is not configured yet.",
    };
  }

  supabaseSignupCallCount += 1;
  const callNumber = supabaseSignupCallCount;
  if (process.env.NODE_ENV === "development") {
    console.info("[Earned auth] Supabase signUp start.", { callNumber });
  }

  const signUpResult = await supabase.auth.signUp({
    email,
    password: draft.password,
    options: {
      emailRedirectTo: getEarnedItAppBaseUrl() ?? undefined,
      data: {
        display_name: displayName,
      },
    },
  });

  if (process.env.NODE_ENV === "development") {
    console.info("[Earned auth] Supabase signUp end.", {
      callNumber,
      hasError: Boolean(signUpResult.error),
      hasSession: Boolean(signUpResult.data.session),
      hasUser: Boolean(signUpResult.data.user),
      totalSignUpCallsThisPage: supabaseSignupCallCount,
    });
  }

  if (signUpResult.error) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "supabase",
      message: getSignupErrorMessage(signUpResult.error),
    };
  }

  const authUser = signUpResult.data.session?.user
    ? {
        id: signUpResult.data.session.user.id,
        email: signUpResult.data.session.user.email ?? email,
        displayName:
          typeof signUpResult.data.session.user.user_metadata?.display_name === "string"
            ? signUpResult.data.session.user.user_metadata.display_name
            : displayName,
      }
    : signUpResult.data.user
    ? {
        id: signUpResult.data.user.id,
        email: signUpResult.data.user.email ?? email,
        displayName:
          typeof signUpResult.data.user.user_metadata?.display_name === "string"
            ? signUpResult.data.user.user_metadata.display_name
            : displayName,
      }
    : await getSignedInAuthUser();

  if (!signUpResult.data.session) {
    savePendingParentSignup({
      displayName,
      email,
      householdName,
    });
    return {
      appData: localAppData,
      authState: "awaiting_email_confirmation",
      ok: false,
      storageMode: "supabase",
      message: getEmailConfirmationMessage(email),
    };
  }

  if (!authUser) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "supabase",
      message: "Signed up, but no auth user was returned. Try logging in after confirming the email.",
    };
  }

  try {
    const existingGraph = await loadRemoteHouseholdGraph(authUser);
    if (existingGraph) {
      const remoteState = await loadRemoteChoreState(existingGraph.household.id);
      const merged = mergeRemoteHouseholdIntoLocal(localAppData, existingGraph, authUser, remoteState);
      writeAppData(merged);
      clearPendingParentSignup();
      return {
        appData: merged,
        authState: "ready",
        ok: true,
        storageMode: "supabase",
        message: `Signed in to existing household ${existingGraph.household.name}.`,
      };
    }

    const created = await createRemoteParentHousehold(authUser, {
      displayName,
      email,
      householdName,
    });
    if (created.message) {
      return {
        appData: localAppData,
        authState: created.authState,
        ok: false,
        storageMode: "supabase",
        message: created.message,
      };
    }

    const graph = created.graph;
    if (!graph) {
      return {
        appData: localAppData,
        authState: created.authState,
        ok: false,
        storageMode: "supabase",
        message: "Household was created, but the account profile could not be reloaded.",
      };
    }

    const remoteState = await loadRemoteChoreState(graph.household.id);
    const merged = mergeRemoteHouseholdIntoLocal(localAppData, graph, authUser, remoteState);
    writeAppData(merged);
    clearPendingParentSignup();
    return {
      appData: merged,
      authState: "ready",
      ok: true,
      storageMode: "supabase",
      message: `Household ${created.household?.name ?? graph.household.name} is ready.`,
    };
  } catch (error) {
    logSupabaseDiagnostic("household_bootstrap_failed_after_signup", error);
    return {
      appData: localAppData,
      authState: getDatabaseAuthState(error),
      ok: false,
      storageMode: "supabase",
      message: describeSupabaseError(
        error,
        "Account was created, but household setup could not finish.",
      ),
    };
  }
}

export async function signInParent(
  draft: ParentLoginDraft,
  localAppData: AppData,
): Promise<ParentAuthResult> {
  const email = draft.email.trim().toLowerCase();
  if (isEarnedItAuthTestModeEnabled()) {
    const parentUser = localAppData.users.find(
      (user) => user.role === "parent" && user.email?.trim().toLowerCase() === email,
    );

    if (!parentUser) {
      return {
        appData: localAppData,
        authState: "auth_error",
        ok: false,
        storageMode: "local",
        message: "No local beta parent account was found for that email.",
      };
    }

    const passwordHash = await hashLocalParentPassword(email, draft.password);
    const credential = readLocalParentCredentials().find(
      (entry) => entry.email === email && entry.userId === parentUser.id,
    );
    if (credential && credential.passwordHash !== passwordHash) {
      return {
        appData: localAppData,
        authState: "auth_error",
        ok: false,
        storageMode: "local",
        message: "Invalid local beta password for this parent account.",
      };
    }

    if (!credential) {
      await saveLocalParentCredential(email, draft.password, parentUser.id);
    }

    const appData = setCurrentUser(
      {
        ...localAppData,
        session: {
          ...localAppData.session,
          currentHouseholdId: parentUser.household_id,
          authUserId: parentUser.auth_user_id ?? parentUser.id,
          authMode: "demo",
        },
      },
      parentUser.id,
    );
    writeAppData(appData);
    return {
      appData,
      authState: "ready",
      ok: true,
      storageMode: "local",
      message: `Signed in to ${localAppData.households.find((household) => household.id === parentUser.household_id)?.name ?? "your household"}.`,
    };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "local",
      message: "Supabase is not configured yet.",
    };
  }

  const signInResult = await supabase.auth.signInWithPassword({
    email,
    password: draft.password,
  });

  if (signInResult.error) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "supabase",
      message: getLoginErrorMessage(signInResult.error),
    };
  }

  const authUser = signInResult.data.user
    ? {
        id: signInResult.data.user.id,
        email: signInResult.data.user.email ?? null,
        displayName:
          typeof signInResult.data.user.user_metadata?.display_name === "string"
            ? signInResult.data.user.user_metadata.display_name
            : null,
      }
    : await getSignedInAuthUser();

  if (!authUser) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "supabase",
      message: "Signed in, but no active session was returned.",
    };
  }

  try {
    const graph = await loadRemoteHouseholdGraph(authUser);
    if (!graph) {
      const pendingSignup = readPendingParentSignup(authUser.email ?? draft.email);
      const repairSignup = pendingSignup ?? getRepairParentSignup(authUser, draft.email);
      if (!pendingSignup) {
        console.info("[Earned auth] Parent profile missing after login; creating repair household.", {
          authUserId: authUser.id,
          email: repairSignup.email,
        });
      }

      const created = await createRemoteParentHousehold(authUser, repairSignup);
      if (created.graph) {
        const remoteState = await loadRemoteChoreState(created.graph.household.id);
        const merged = mergeRemoteHouseholdIntoLocal(
          localAppData,
          created.graph,
          authUser,
          remoteState,
        );
        writeAppData(merged);
        clearPendingParentSignup();
        return {
          appData: merged,
          authState: "ready",
          ok: true,
          storageMode: "supabase",
          message: `Household ${created.household?.name ?? created.graph.household.name} is ready.`,
        };
      }

      return {
        appData: localAppData,
        authState: created.authState,
        ok: false,
        storageMode: "supabase",
        message:
          created.message ??
          "Signed in, but the household setup could not be completed.",
      };
    }

    const remoteState = await loadRemoteChoreState(graph.household.id);
    const merged = mergeRemoteHouseholdIntoLocal(localAppData, graph, authUser, remoteState);
    writeAppData(merged);
    clearPendingParentSignup();
    return {
      appData: merged,
      authState: "ready",
      ok: true,
      storageMode: "supabase",
      message: `Signed in to ${graph.household.name}.`,
    };
  } catch (error) {
    logSupabaseDiagnostic("household_bootstrap_failed_after_login", error);
    return {
      appData: localAppData,
      authState: getDatabaseAuthState(error),
      ok: false,
      storageMode: "supabase",
      message: describeSupabaseError(
        error,
        "Signed in, but household data could not be loaded.",
      ),
    };
  }
}

export async function signOutParent(localAppData: AppData): Promise<ParentAuthResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "local",
      message: "Supabase is not configured yet.",
    };
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "supabase",
      message: error.message,
    };
  }

  const signedOut = {
    ...localAppData,
    session: {
      currentUserId: null,
      currentHouseholdId: null,
      authUserId: null,
      authMode: "supabase" as const,
    },
  };
  writeAppData(signedOut);
  return {
    appData: signedOut,
    authState: "signed_out",
    ok: true,
    storageMode: "supabase",
    message: "Signed out.",
  };
}

export async function createChildRecord(
  childDraft: string | ChildCreateDraft,
  localAppData: AppData,
): Promise<ChildCreateResult> {
  const draft = normalizeChildDraft(childDraft);
  const validationMessage = getChildDraftValidationMessage(draft);
  const accessToken = makeChildAccessToken();

  if (validationMessage) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: localAppData.session.authMode === "supabase" ? "supabase" : "local",
      message: validationMessage,
    };
  }

  if (isEarnedItAuthTestModeEnabled() || localAppData.session.authMode === "demo") {
    return createLocalChildRecord(draft, accessToken, localAppData);
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "local",
      message: "Supabase is not configured yet.",
    };
  }

  const authUser = await getSignedInAuthUser();
  if (!authUser) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Sign in before creating child records.",
    };
  }

  const graph = await loadRemoteHouseholdGraph(authUser);
  if (!graph) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Parent household profile was not found.",
    };
  }

  const timestamp = getCurrentTimestamp();
  const { error } = await supabase.from("children").insert({
    household_id: graph.household.id,
    parent_profile_id: graph.parentProfile.id,
    display_name: draft.name,
    age: draft.age,
    gender: draft.gender,
    child_access_token: accessToken,
    created_at: timestamp,
    updated_at: timestamp,
  });

  if (error) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: error.message,
    };
  }

  const refreshedGraph = await loadRemoteHouseholdGraph(authUser);
  if (!refreshedGraph) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Child was created, but the household could not be refreshed.",
    };
  }

  const remoteState = await loadRemoteChoreState(refreshedGraph.household.id);
  const merged = mergeRemoteHouseholdIntoLocal(
    localAppData,
    refreshedGraph,
    authUser,
    remoteState,
  );
  writeAppData(merged);
  return {
    appData: merged,
    ok: true,
    storageMode: "supabase",
    message: `${draft.name} was added to ${refreshedGraph.household.name}.`,
  };
}

function createLocalChildRecord(
  childDraft: ReturnType<typeof normalizeChildDraft>,
  accessToken: string,
  localAppData: AppData,
): ChildCreateResult {
  const parentUser = localAppData.users.find((user) => user.role === "parent");
  const householdId = localAppData.session.currentHouseholdId ?? localAppData.households[0]?.id;
  if (!parentUser || !householdId) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "local",
      message: "Parent household profile was not found.",
    };
  }

  const timestamp = getCurrentTimestamp();
  const childId = makeLocalId("beta-child");
  const childUserId = makeLocalId("beta-child-user");
  const childProfile: ChildProfile = {
    id: childId,
    household_id: householdId,
    parent_id: parentUser.id,
    name: childDraft.name,
    age: childDraft.age,
    gender: childDraft.gender,
    user_id: childUserId,
    access_token: accessToken,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const childUser = buildChildUser(childProfile);
  const appData = {
    ...localAppData,
    users: [...localAppData.users.filter((user) => user.id !== childUser.id), childUser],
    childProfiles: [...localAppData.childProfiles, childProfile],
  };

  writeAppData(appData);
  return {
    appData,
    ok: true,
    storageMode: "local",
    message: `${childDraft.name} was added to ${localAppData.households[0]?.name ?? "this household"}.`,
  };
}

export async function updateChildRecord(
  childId: string,
  childDraft: ChildCreateDraft,
  localAppData: AppData,
): Promise<ChildCreateResult> {
  const draft = normalizeChildDraft(childDraft);
  const validationMessage = getChildDraftValidationMessage(draft);
  if (validationMessage) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: localAppData.session.authMode === "supabase" ? "supabase" : "local",
      message: validationMessage,
    };
  }

  if (isEarnedItAuthTestModeEnabled() || localAppData.session.authMode === "demo") {
    const timestamp = getCurrentTimestamp();
    const nextChildProfiles = localAppData.childProfiles.map((profile) =>
      profile.id === childId
        ? {
            ...profile,
            name: draft.name,
            age: draft.age,
            gender: draft.gender,
            updated_at: timestamp,
          }
        : profile,
    );
    const editedChild = nextChildProfiles.find((profile) => profile.id === childId);
    if (!editedChild) {
      return {
        appData: localAppData,
        ok: false,
        storageMode: "local",
        message: "Child profile was not found.",
      };
    }

    const childUser = buildChildUser(editedChild);
    const nextData = {
      ...localAppData,
      childProfiles: nextChildProfiles,
      users: localAppData.users.map((user) => (user.id === childUser.id ? childUser : user)),
    };
    writeAppData(nextData);
    return {
      appData: nextData,
      ok: true,
      storageMode: "local",
      message: `${draft.name} was updated.`,
    };
  }

  const supabase = getSupabaseBrowserClient();
  const authUser = await getSignedInAuthUser();
  if (!supabase || !authUser) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Sign in as a parent before editing child profiles.",
    };
  }

  const graph = await loadRemoteHouseholdGraph(authUser);
  if (!graph) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Parent household profile was not found.",
    };
  }

  const { error } = await supabase
    .from("children")
    .update({
      display_name: draft.name,
      age: draft.age,
      gender: draft.gender,
      updated_at: getCurrentTimestamp(),
    })
    .eq("id", childId)
    .eq("household_id", graph.household.id);

  if (error) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: error.message,
    };
  }

  const refreshedGraph = await loadRemoteHouseholdGraph(authUser);
  if (!refreshedGraph) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Child profile was updated, but the household could not be refreshed.",
    };
  }

  const remoteState = await loadRemoteChoreState(refreshedGraph.household.id);
  const appData = mergeRemoteHouseholdIntoLocal(localAppData, refreshedGraph, authUser, remoteState);
  writeAppData(appData);
  return {
    appData,
    ok: true,
    storageMode: "supabase",
    message: `${draft.name} was updated.`,
  };
}

export async function deleteChildRecord(
  childId: string,
  localAppData: AppData,
): Promise<ChildCreateResult> {
  const childProfile = localAppData.childProfiles.find((profile) => profile.id === childId);
  if (!childProfile) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: localAppData.session.authMode === "supabase" ? "supabase" : "local",
      message: "Child profile was not found.",
    };
  }

  if (isEarnedItAuthTestModeEnabled() || localAppData.session.authMode === "demo") {
    const childChoreIds = new Set(
      localAppData.chores.filter((chore) => chore.child_id === childId).map((chore) => chore.id),
    );
    const nextData = {
      ...localAppData,
      users: localAppData.users.filter((user) => user.id !== childProfile.user_id),
      childProfiles: localAppData.childProfiles.filter((profile) => profile.id !== childId),
      chores: localAppData.chores.filter((chore) => chore.child_id !== childId),
      checkIns: localAppData.checkIns.filter(
        (entry) => entry.child_id !== childId && !childChoreIds.has(entry.chore_id),
      ),
      payouts: localAppData.payouts.filter((payout) => payout.child_id !== childId),
    };
    writeAppData(nextData);
    return {
      appData: nextData,
      ok: true,
      storageMode: "local",
      message: `${childProfile.name || "Child profile"} was removed.`,
    };
  }

  const supabase = getSupabaseBrowserClient();
  const authUser = await getSignedInAuthUser();
  if (!supabase || !authUser) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Sign in as a parent before removing child profiles.",
    };
  }

  const graph = await loadRemoteHouseholdGraph(authUser);
  if (!graph) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Parent household profile was not found.",
    };
  }

  const { error } = await supabase
    .from("children")
    .delete()
    .eq("id", childId)
    .eq("household_id", graph.household.id);

  if (error) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: error.message,
    };
  }

  const refreshedGraph = await loadRemoteHouseholdGraph(authUser);
  if (!refreshedGraph) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Child profile was removed, but the household could not be refreshed.",
    };
  }

  const remoteState = await loadRemoteChoreState(refreshedGraph.household.id);
  const appData = mergeRemoteHouseholdIntoLocal(localAppData, refreshedGraph, authUser, remoteState);
  writeAppData(appData);
  return {
    appData,
    ok: true,
    storageMode: "supabase",
    message: `${childProfile.name || "Child profile"} was removed.`,
  };
}

export async function updateAccountProfile(
  draft: AccountProfileDraft,
  localAppData: AppData,
): Promise<ParentAuthResult> {
  const householdName = draft.householdName.trim();
  const parentDisplayName = draft.parentDisplayName.trim();
  if (!householdName || !parentDisplayName) {
    return {
      appData: localAppData,
      authState: "ready",
      ok: false,
      storageMode: localAppData.session.authMode === "supabase" ? "supabase" : "local",
      message: "Household and parent names are required.",
    };
  }

  if (isEarnedItAuthTestModeEnabled() || localAppData.session.authMode === "demo") {
    const timestamp = getCurrentTimestamp();
    const currentParentUserId = localAppData.session.currentUserId;
    const nextData = {
      ...localAppData,
      households: localAppData.households.map((household, index) =>
        index === 0
          ? {
              ...household,
              name: householdName,
              updated_at: timestamp,
            }
          : household,
      ),
      profiles: localAppData.profiles.map((profile) =>
        profile.role === "parent"
          ? {
              ...profile,
              display_name: parentDisplayName,
              updated_at: timestamp,
            }
          : profile,
      ),
      users: localAppData.users.map((user) =>
        user.id === currentParentUserId || user.role === "parent"
          ? {
              ...user,
              name: parentDisplayName,
              updated_at: timestamp,
            }
          : user,
      ),
    };
    writeAppData(nextData);
    return {
      appData: nextData,
      authState: "ready",
      ok: true,
      storageMode: "local",
      message: "Account details updated.",
    };
  }

  const supabase = getSupabaseBrowserClient();
  const authUser = await getSignedInAuthUser();
  if (!supabase || !authUser) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "supabase",
      message: "Sign in as a parent before editing account details.",
    };
  }

  const graph = await loadRemoteHouseholdGraph(authUser);
  if (!graph) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "supabase",
      message: "Parent household profile was not found.",
    };
  }

  const timestamp = getCurrentTimestamp();
  const { error: householdError } = await supabase
    .from("households")
    .update({ name: householdName, updated_at: timestamp })
    .eq("id", graph.household.id);
  if (householdError) {
    return {
      appData: localAppData,
      authState: getDatabaseAuthState(householdError),
      ok: false,
      storageMode: "supabase",
      message: describeSupabaseError(householdError, "Household name could not be updated."),
    };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ display_name: parentDisplayName, updated_at: timestamp })
    .eq("id", graph.parentProfile.id)
    .eq("user_id", authUser.id);
  if (profileError) {
    return {
      appData: localAppData,
      authState: getDatabaseAuthState(profileError),
      ok: false,
      storageMode: "supabase",
      message: describeSupabaseError(profileError, "Parent profile could not be updated."),
    };
  }

  const refreshedGraph = await loadRemoteHouseholdGraph(authUser);
  if (!refreshedGraph) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "supabase",
      message: "Account was updated, but the household could not be refreshed.",
    };
  }

  const remoteState = await loadRemoteChoreState(refreshedGraph.household.id);
  const appData = mergeRemoteHouseholdIntoLocal(localAppData, refreshedGraph, authUser, remoteState);
  writeAppData(appData);
  return {
    appData,
    authState: "ready",
    ok: true,
    storageMode: "supabase",
    message: "Account details updated.",
  };
}

function signInChildProfile(
  childProfile: ChildProfile,
  localAppData: AppData,
): AppData {
  const childUser =
    localAppData.users.find((user) => user.id === childProfile.user_id) ??
    buildChildUser(childProfile);

  return setCurrentUser(
    {
      ...localAppData,
      users: localAppData.users.some((user) => user.id === childUser.id)
        ? localAppData.users
        : [...localAppData.users, childUser],
      session: {
        ...localAppData.session,
        currentHouseholdId: childProfile.household_id,
      },
    },
    childUser.id,
  );
}

function mergeChildDeviceLinkIntoLocal(
  localAppData: AppData,
  payload: ChildDeviceBootstrapPayload,
): AppData {
  const parentUserId =
    payload.parentProfile?.user_id ?? payload.parentProfile?.id ?? `parent-${payload.household.id}`;
  const childProfile = buildChildProfile(payload.child, parentUserId);
  const childUser = buildChildUser(childProfile);
  const remoteChoresById = new Map((payload.chores ?? []).map((chore) => [chore.id, chore]));
  const chores = (payload.chores ?? []).map(hydrateRemoteChore);
  const checkIns = (payload.completions ?? [])
    .map((completion) => hydrateRemoteCompletion(completion, remoteChoresById))
    .filter((entry): entry is CheckIn => Boolean(entry));

  return signInChildProfile(childProfile, {
    ...localAppData,
    households: [payload.household],
    profiles: payload.parentProfile ? [payload.parentProfile] : [],
    users: [childUser],
    childProfiles: [childProfile],
    chores,
    checkIns,
    payouts: [],
    session: {
      currentUserId: childUser.id,
      currentHouseholdId: payload.household.id,
      authUserId: null,
      authMode: "supabase",
    },
  });
}

function getActiveChildDeviceProfile(appData: AppData) {
  const activeUser = appData.users.find((user) => user.id === appData.session.currentUserId);
  if (activeUser?.role !== "child") {
    return null;
  }

  return appData.childProfiles.find((profile) => profile.user_id === activeUser.id) ?? null;
}

async function bootstrapChildDeviceSession(
  accessToken: string,
  localAppData: AppData,
): Promise<AppData | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("bootstrap_child_device", {
    access_token: accessToken,
  });

  if (error || !data) {
    if (error) {
      console.warn("[Earned] Child device bootstrap failed.", error);
    }
    return null;
  }

  return mergeChildDeviceLinkIntoLocal(localAppData, data as ChildDeviceBootstrapPayload);
}

export async function signInChildWithDeviceLink(
  accessToken: string,
  localAppData: AppData,
): Promise<ChildDeviceLinkResult> {
  const token = accessToken.trim();
  const localChildProfile = localAppData.childProfiles.find(
    (profile) => profile.access_token === token,
  );

  if (
    localChildProfile &&
    (isEarnedItAuthTestModeEnabled() || localAppData.session.authMode !== "supabase")
  ) {
    const appData = signInChildProfile(localChildProfile, localAppData);
    writeAppData(appData);
    return {
      appData,
      authState: "ready",
      ok: true,
      storageMode: appData.session.authMode === "supabase" ? "supabase" : "local",
      message: `Signed in as ${localChildProfile.name}.`,
    };
  }

  const appData = await bootstrapChildDeviceSession(token, localAppData);
  if (appData) {
    writeAppData(appData);
    const childName = appData.childProfiles[0]?.name?.trim() || "your child";
    return {
      appData,
      authState: "ready",
      ok: true,
      storageMode: "supabase",
      message: `Signed in as ${childName}.`,
    };
  }

  if (!getSupabaseBrowserClient()) {
    return {
      appData: localAppData,
      authState: "auth_error",
      ok: false,
      storageMode: "local",
      message: "Child link could not be opened because Supabase is not configured.",
    };
  }

  return {
    appData: localAppData,
    authState: "auth_error",
    ok: false,
    storageMode: "supabase",
    message: "This child link is no longer valid. Ask a parent to show the QR again.",
  };
}

export async function regenerateChildDeviceLink(
  childId: string,
  localAppData: AppData,
): Promise<ChildCreateResult> {
  const accessToken = makeChildAccessToken();

  if (isEarnedItAuthTestModeEnabled() || localAppData.session.authMode === "demo") {
    const nextData = {
      ...localAppData,
      childProfiles: localAppData.childProfiles.map((profile) =>
        profile.id === childId
          ? {
              ...profile,
              access_token: accessToken,
              updated_at: getCurrentTimestamp(),
            }
          : profile,
      ),
    };
    writeAppData(nextData);
    return {
      appData: nextData,
      ok: true,
      storageMode: "local",
      message: "Child QR link was regenerated.",
    };
  }

  const supabase = getSupabaseBrowserClient();
  const authUser = await getSignedInAuthUser();
  if (!supabase || !authUser) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Sign in as a parent before regenerating child links.",
    };
  }

  const graph = await loadRemoteHouseholdGraph(authUser);
  if (!graph) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Parent household profile was not found.",
    };
  }

  const { error } = await supabase
    .from("children")
    .update({
      child_access_token: accessToken,
      updated_at: getCurrentTimestamp(),
    })
    .eq("id", childId)
    .eq("household_id", graph.household.id);

  if (error) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: error.message,
    };
  }

  const refreshedGraph = await loadRemoteHouseholdGraph(authUser);
  if (!refreshedGraph) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Child link was regenerated, but the household could not be refreshed.",
    };
  }

  const remoteState = await loadRemoteChoreState(refreshedGraph.household.id);
  const appData = mergeRemoteHouseholdIntoLocal(localAppData, refreshedGraph, authUser, remoteState);
  writeAppData(appData);
  return {
    appData,
    ok: true,
    storageMode: "supabase",
    message: "Child QR link was regenerated.",
  };
}

export function getHousehold(appData: AppData) {
  return getHouseholdRecord(appData);
}

export function getParentProfiles(appData: AppData) {
  return getHouseholdProfiles(appData).filter((profile) => profile.role === "parent");
}

export function getChildren(appData: AppData) {
  return getHouseholdChildren(appData);
}

export function getUsers(appData: AppData) {
  return getHouseholdUsers(appData);
}

export function getChores(appData: AppData) {
  return getHouseholdChores(appData);
}

export function getPayments(appData: AppData) {
  return getHouseholdPayments(appData);
}

export function createChore(appData: AppData, parent: User, draft: ChoreDraft) {
  const householdId = getRepositoryHouseholdId(appData);
  if (!assertHouseholdAccess(parent.household_id, householdId)) {
    return appData;
  }

  return saveStoredChore(appData, parent, draft);
}

export function updateChore(appData: AppData, parent: User, draft: ChoreDraft) {
  return createChore(appData, parent, draft);
}

export function deleteChore(appData: AppData, choreId: string) {
  return deleteStoredChore(appData, choreId);
}

export function completeChore(
  appData: AppData,
  choreId: string,
  photos: ProofPhotoInput[] | string | null,
) {
  return submitStoredChore(appData, choreId, photos);
}

export function completeRoutineCheckIn(
  appData: AppData,
  choreId: string,
  photos: ProofPhotoInput[] | string,
) {
  return saveStoredRoutineCheckIn(appData, choreId, photos);
}

export function submitRoutineForApproval(appData: AppData, choreId: string) {
  return submitStoredRollingChore(appData, choreId);
}

export function recordParentRoutineCheckIn(
  appData: AppData,
  choreId: string,
  parentUser: User,
) {
  const householdId = getRepositoryHouseholdId(appData);
  if (!assertHouseholdAccess(parentUser.household_id, householdId)) {
    return {
      appData,
      message: "Parent account cannot record check-ins for this household.",
      ok: false,
    };
  }

  return recordStoredParentRoutineCheckIn(appData, choreId, parentUser);
}

export function approveChore(appData: AppData, choreId: string) {
  return approveStoredChore(appData, choreId);
}

export function rejectChore(appData: AppData, choreId: string, rejectionNote: string) {
  return rejectStoredChore(appData, choreId, rejectionNote);
}

export function overrideMissedStreak(
  appData: AppData,
  choreId: string,
  missedDate: string,
  note: string,
  parentUser: User,
) {
  const householdId = getRepositoryHouseholdId(appData);
  if (!assertHouseholdAccess(parentUser.household_id, householdId)) {
    return appData;
  }

  return overrideStoredMissedStreak(appData, choreId, missedDate, note, parentUser);
}

export function markChorePaid(
  appData: AppData,
  parentId: string,
  childId: string,
  notes: string,
  paymentItems?: PaymentLineItem[],
) {
  return markStoredBalancePaid(appData, parentId, childId, notes, paymentItems);
}

export function clearCompletedTestData(appData: AppData) {
  return clearStoredCompletedTestData(appData);
}
