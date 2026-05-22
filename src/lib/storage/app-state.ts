"use client";

import {
  formatLocalIsoDate,
  getCurrentPeriodKey,
  getOptionalInstanceForPeriod,
  getRollingProgress,
  getTodayIsoDate,
  isOptionalChore,
} from "@/lib/chore-helpers";
import { debugLog } from "@/lib/debug";
import {
  getCheckInForChoreDate,
  getLocalDateFromTimestamp,
  normalizeRrcSchedule,
} from "@/lib/chore-progress";
import { demoData } from "@/lib/storage/demo-data";
import { formatCentsForDollarInput, normalizeCents, parseMoneyToCents } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  AppData,
  CheckIn,
  Chore,
  ChoreDraft,
  ChildProfile,
  ChoreProofPhoto,
  Payout,
  PaymentLineItem,
  ProofPhotoInput,
  RrcSchedule,
  User,
} from "@/types/app";

const STORAGE_KEY = "earnedit-family-store-v2";
const LEGACY_STORAGE_KEYS = ["chorepay-family-store-v2"];
const APP_DATA_SCHEMA_VERSION = 1;
const SHARED_TABLE = "household_app_state";
const DEFAULT_HOUSEHOLD_ID = "family-household-1";
const LEGACY_DEMO_PARENT_NAME = ["Mor", "gan"].join("");
const LEGACY_DEMO_CHILD_NAME = ["Ave", "ry"].join("");
const LEGACY_DEMO_CHORE_TITLES = new Set([
  ["Feed", " the dog"].join(""),
  ["Help unload", " groceries"].join(""),
]);
const LEGACY_DEMO_CHORE_IDS = new Set([
  "44444444-4444-4444-4444-444444444441",
  "44444444-4444-4444-4444-444444444442",
]);
const LEGACY_DEMO_PAYOUT_IDS = new Set(["55555555-5555-5555-5555-555555555555"]);

type StoredAppDataPayload = {
  schemaVersion: number;
  appData: AppData;
};

export type AppDataInitialization = {
  appData: AppData;
  shouldPersist: boolean;
};

export type SharedAppDataInitialization = AppDataInitialization & {
  storageMode: "local" | "supabase";
  syncWarning: string | null;
};

export type SharedCommitResult = {
  appData: AppData;
  ok: boolean;
  storageMode: "local" | "supabase";
};

export type SharedPullResult = {
  appData: AppData | null;
  ok: boolean;
  storageMode: "local" | "supabase";
};

function cloneDemoData() {
  return JSON.parse(JSON.stringify(demoData)) as AppData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAppDataShape(value: unknown): value is AppData {
  return (
    isRecord(value) &&
    Array.isArray(value.users) &&
    Array.isArray(value.childProfiles) &&
    Array.isArray(value.chores) &&
    Array.isArray(value.checkIns) &&
    Array.isArray(value.payouts) &&
    isRecord(value.session) &&
    "currentUserId" in value.session
  );
}

function createStoredPayload(appData: AppData): StoredAppDataPayload {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    appData,
  };
}

function isLegacyDemoParent(user: User) {
  return user.name === LEGACY_DEMO_PARENT_NAME || user.username === "morgan-parent";
}

function isLegacyDemoChild(user: User) {
  return user.name === LEGACY_DEMO_CHILD_NAME || user.username === "avery-child";
}

function hasLegacyDemoIdentity(candidate: unknown) {
  if (!isAppDataShape(candidate)) {
    return false;
  }

  return (
    candidate.users.some((user) => isLegacyDemoParent(user) || isLegacyDemoChild(user)) ||
    candidate.childProfiles.some((profile) => profile.name === LEGACY_DEMO_CHILD_NAME)
  );
}

function hasLegacyDemoActivity(candidate: unknown) {
  if (!isAppDataShape(candidate)) {
    return false;
  }

  return (
    candidate.chores.some(
      (chore) => LEGACY_DEMO_CHORE_IDS.has(chore.id) || LEGACY_DEMO_CHORE_TITLES.has(chore.title),
    ) || candidate.payouts.some((payout) => LEGACY_DEMO_PAYOUT_IDS.has(payout.id))
  );
}

function hasLegacyDemoData(candidate: unknown) {
  return hasLegacyDemoIdentity(candidate) || hasLegacyDemoActivity(candidate);
}

function hasConfiguredLocalData(appData: AppData) {
  const cleaned = stripLegacyDemoActivity(appData);
  const hasSavedActivity =
    cleaned.chores.length > 0 || cleaned.checkIns.length > 0 || cleaned.payouts.length > 0;
  const hasCustomNames = cleaned.users.some((user) => {
    if (user.role === "parent") {
      return user.name.trim() !== "" && user.name !== "Parent";
    }

    return user.name.trim() !== "" && user.name !== "Child";
  });

  return hasSavedActivity || hasCustomNames;
}

function stripLegacyDemoActivity(appData: AppData): AppData {
  const legacyChoreIds = new Set(
    appData.chores
      .filter(
        (chore) =>
          LEGACY_DEMO_CHORE_IDS.has(chore.id) || LEGACY_DEMO_CHORE_TITLES.has(chore.title),
      )
      .map((chore) => chore.id),
  );

  if (legacyChoreIds.size === 0 && !appData.payouts.some((payout) => LEGACY_DEMO_PAYOUT_IDS.has(payout.id))) {
    return appData;
  }

  return {
    ...appData,
    chores: appData.chores.filter(
      (chore) =>
        !legacyChoreIds.has(chore.id) &&
        (!chore.template_chore_id || !legacyChoreIds.has(chore.template_chore_id)),
    ),
    checkIns: appData.checkIns.filter((entry) => !legacyChoreIds.has(entry.chore_id)),
    payouts: appData.payouts.filter((payout) => !LEGACY_DEMO_PAYOUT_IDS.has(payout.id)),
  };
}

function migrateLegacyDemoNames(appData: AppData): AppData {
  return {
    ...appData,
    users: appData.users.map((user) => {
      if (isLegacyDemoParent(user)) {
        return {
          ...user,
          name: "Parent",
          username: user.username === "morgan-parent" ? "parent" : user.username,
        };
      }

      if (isLegacyDemoChild(user)) {
        return {
          ...user,
          name: "Child",
          username: user.username === "avery-child" ? "child" : user.username,
        };
      }

      return user;
    }),
    childProfiles: appData.childProfiles.map((profile) =>
      profile.name === LEGACY_DEMO_CHILD_NAME
        ? {
            ...profile,
            name: "Child",
          }
        : profile,
    ),
  };
}

function normalizeChore(chore: Chore): Chore {
  const choreRecord = chore as Chore & { amount?: unknown };
  const weeklyDays = chore.repeat_days ?? [];
  const legacyKind = chore.chore_kind as string;
  const normalizedKind =
    legacyKind === "standard"
      ? "one_time"
      : legacyKind === "rolling"
        ? "routine"
        : chore.chore_kind;
  const normalizedTemplateId =
    normalizedKind === "optional" ? chore.template_chore_id ?? null : null;
  const normalizedIsTemplate =
    normalizedKind === "optional"
      ? (chore.is_template ?? (normalizedTemplateId === null))
      : false;
  const defaultStartDate =
    normalizedKind === "routine"
      ? chore.start_date ?? null
      : chore.start_date ?? getLocalDateFromTimestamp(chore.created_at);
  return {
    ...chore,
    start_date: defaultStartDate,
    repeat_days: weeklyDays,
    repeat_pattern: chore.repeat_pattern ?? "weekly",
    repeat_days_week_a: chore.repeat_days_week_a ?? weeklyDays,
    repeat_days_week_b: chore.repeat_days_week_b ?? [],
    chore_kind: normalizedKind ?? "one_time",
    reset_frequency: chore.reset_frequency ?? "daily",
    max_completions_per_reset: chore.max_completions_per_reset ?? 1,
    amount_cents: normalizeCents(chore.amount_cents, choreRecord.amount),
    manual_availability: chore.manual_availability ?? false,
    total_required_completions: chore.total_required_completions ?? null,
    payout_rule: chore.payout_rule ?? "all_or_nothing",
    miss_behavior: chore.miss_behavior ?? "fail_period",
    only_when_child_present: chore.only_when_child_present ?? false,
    rrc_schedule:
      normalizedKind === "routine" || (normalizedKind === "optional" && chore.rrc_schedule)
        ? normalizeRrcSchedule({
            ...chore,
            start_date: chore.start_date,
          })
        : chore.rrc_schedule ?? null,
    proof_entries: normalizeProofEntries(chore),
    streak_overrides: chore.streak_overrides ?? [],
    is_template: normalizedIsTemplate,
    template_chore_id: normalizedTemplateId,
    instance_period_key: normalizedKind === "optional" ? chore.instance_period_key ?? null : null,
  };
}

function normalizeAppData(appData: AppData): AppData {
  const migratedAppData = stripLegacyDemoActivity(migrateLegacyDemoNames(appData));
  const normalizedChores = migratedAppData.chores.map((chore) => normalizeChore(chore));
  const normalizedPayouts = migratedAppData.payouts.map((payout) => ({
    ...payout,
    amount_cents: normalizeCents(payout.amount_cents),
  }));
  const existingCheckIns = (appData.checkIns ?? []).map(normalizeCheckIn);
  const existingKeys = new Set(
    existingCheckIns.map((entry) => `${entry.chore_id}:${entry.check_in_date}`),
  );
  const migratedRoutineCheckIns = normalizedChores.flatMap((chore) =>
    (chore.proof_entries ?? [])
      .filter((entry) => !existingKeys.has(`${chore.id}:${entry.proof_date}`))
      .map((entry) => ({
        id: entry.id.startsWith("checkin-") ? entry.id : `checkin-${entry.id}`,
        chore_id: chore.id,
        parent_id: chore.parent_id,
        child_id: chore.child_id,
        photo_url: entry.photo_url,
        photos: entry.photos,
        check_in_date: entry.proof_date,
        submitted_at: entry.submitted_at,
        uploaded_at: entry.uploaded_at ?? entry.submitted_at,
      })),
  );

  return {
    ...migratedAppData,
    session: {
      currentUserId: migratedAppData.session?.currentUserId ?? null,
    },
    chores: normalizedChores,
    checkIns: [...existingCheckIns, ...migratedRoutineCheckIns].sort((left, right) =>
      left.check_in_date.localeCompare(right.check_in_date),
    ),
    payouts: normalizedPayouts,
  };
}

function getDeviceSession(appData: AppData | null | undefined) {
  return appData?.session?.currentUserId ?? null;
}

function withDeviceSession(appData: AppData, currentUserId: string | null): AppData {
  return {
    ...appData,
    session: {
      currentUserId,
    },
  };
}

function stripSessionForShared(appData: AppData): AppData {
  return withDeviceSession(appData, null);
}

export function getSharedHouseholdId() {
  const fromEnv = process.env.NEXT_PUBLIC_DEMO_HOUSEHOLD_ID?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_HOUSEHOLD_ID;
}

function getNormalizedDemoData() {
  return normalizeAppData(cloneDemoData());
}

function getCleanStarterData(currentUserId: string | null = null) {
  return withDeviceSession(getNormalizedDemoData(), currentUserId);
}

function normalizeStoredAppData(candidate: unknown): AppData | null {
  if (!isAppDataShape(candidate)) {
    return null;
  }

  try {
    return normalizeAppData(candidate);
  } catch (error) {
    console.warn("[Earned] Stored app data normalization failed.", error);
    return null;
  }
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}
function normalizeProofPhotoInputs(photos: ProofPhotoInput[] | string | null | undefined): ProofPhotoInput[] {
  if (!photos) {
    return [];
  }

  if (typeof photos === "string") {
    return photos
      ? [{ photo_url: photos, uploaded_at: new Date().toISOString(), label: null }]
      : [];
  }

  return photos.filter((photo) => Boolean(photo.photo_url));
}

function createProofPhotos(photos: ProofPhotoInput[]): ChoreProofPhoto[] {
  return photos.map((photo) => ({
    id: makeId("photo"),
    photo_url: photo.photo_url,
    uploaded_at: photo.uploaded_at,
    label: photo.label ?? null,
  }));
}

function createProofEntries(photos: ProofPhotoInput[], proofDate: string, submittedAt: string) {
  const proofPhotos = createProofPhotos(photos);
  return proofPhotos.map((photo) => ({
    id: makeId("proof"),
    proof_date: proofDate,
    photo_url: photo.photo_url,
    submitted_at: submittedAt,
    uploaded_at: photo.uploaded_at,
    label: photo.label ?? null,
    photos: [photo],
  }));
}

function normalizeProofEntries(chore: Partial<Chore>) {
  return (chore.proof_entries ?? []).map((entry) => {
    const uploadedAt = entry.uploaded_at ?? entry.submitted_at ?? chore.submitted_at ?? chore.updated_at ?? null;
    const photos = entry.photos?.length
      ? entry.photos.map((photo) => ({
          id: photo.id,
          photo_url: photo.photo_url,
          uploaded_at: photo.uploaded_at ?? uploadedAt,
          label: photo.label ?? entry.label ?? null,
        }))
      : [
          {
            id: `${entry.id}-photo`,
            photo_url: entry.photo_url,
            uploaded_at: uploadedAt,
            label: entry.label ?? null,
          },
        ];

    return {
      ...entry,
      uploaded_at: uploadedAt,
      label: entry.label ?? null,
      photos,
    };
  });
}

function normalizeCheckIn(entry: CheckIn): CheckIn {
  const uploadedAt = entry.uploaded_at ?? entry.submitted_at;
  return {
    ...entry,
    uploaded_at: uploadedAt,
    photos: entry.photos?.length
      ? entry.photos.map((photo) => ({
          id: photo.id,
          photo_url: photo.photo_url,
          uploaded_at: photo.uploaded_at ?? uploadedAt,
          label: photo.label ?? null,
        }))
      : [
          {
            id: `${entry.id}-photo`,
            photo_url: entry.photo_url,
            uploaded_at: uploadedAt,
            label: null,
          },
        ],
  };
}

export function initializeAppData(): AppDataInitialization {
  if (typeof window === "undefined") {
    return {
      appData: getNormalizedDemoData(),
      shouldPersist: false,
    };
  }

  const raw =
    window.localStorage.getItem(STORAGE_KEY) ??
    LEGACY_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
  if (!raw) {
    return {
      appData: getNormalizedDemoData(),
      shouldPersist: true,
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (isRecord(parsed) && "schemaVersion" in parsed && "appData" in parsed) {
      const payload = parsed as Partial<StoredAppDataPayload>;
      const normalized = normalizeStoredAppData(payload.appData);
      if (normalized) {
        if (hasLegacyDemoData(payload.appData)) {
          return {
            appData: hasConfiguredLocalData(normalized)
              ? normalized
              : getCleanStarterData(getDeviceSession(normalized)),
            shouldPersist: true,
          };
        }

        return {
          appData: normalized,
          shouldPersist: payload.schemaVersion !== APP_DATA_SCHEMA_VERSION,
        };
      }
    }

    const normalizedLegacy = normalizeStoredAppData(parsed);
    if (normalizedLegacy) {
      if (hasLegacyDemoData(parsed)) {
        return {
          appData: hasConfiguredLocalData(normalizedLegacy)
            ? normalizedLegacy
            : getCleanStarterData(getDeviceSession(normalizedLegacy)),
          shouldPersist: true,
        };
      }

      return {
        appData: normalizedLegacy,
        shouldPersist: true,
      };
    }
  } catch (error) {
    console.warn("[Earned] Stored app data parse failed. Falling back to starter data.", error);
  }

  return {
    appData: getNormalizedDemoData(),
    shouldPersist: true,
  };
}

export function readAppData(): AppData {
  return initializeAppData().appData;
}

export function writeAppData(nextData: AppData) {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const normalized = normalizeAppData(nextData);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(createStoredPayload(normalized)));
    return true;
  } catch (error) {
    console.warn("Earned could not save app data to localStorage.", error);
    return false;
  }
}

export function commitAppData(nextData: AppData) {
  const normalized = normalizeAppData(nextData);
  const ok = writeAppData(normalized);
  return {
    appData: normalized,
    ok,
  };
}

export async function initializeSharedAppData(): Promise<SharedAppDataInitialization> {
  const local = initializeAppData();
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return {
      ...local,
      storageMode: "local",
      syncWarning: null,
    };
  }

  const deviceSession = getDeviceSession(local.appData);
  const householdId = getSharedHouseholdId();

  try {
    const { data, error } = await supabase
      .from(SHARED_TABLE)
      .select("app_data")
      .eq("household_id", householdId)
      .maybeSingle();

    if (error) {
      console.warn("[Earned] Supabase load failed. Falling back to local storage.", error);
      return {
        ...local,
        storageMode: "local",
        syncWarning: "Shared sync unavailable. Using local-only data on this device.",
      };
    }

    const remoteHasLegacyDemoData = hasLegacyDemoData(data?.app_data);
    const localHasLegacyDemoData = hasLegacyDemoData(local.appData);
    const remoteCandidate = normalizeStoredAppData(data?.app_data);
    if (remoteCandidate) {
      if (
        remoteHasLegacyDemoData &&
        !localHasLegacyDemoData &&
        hasConfiguredLocalData(local.appData)
      ) {
        const localSource = withDeviceSession(normalizeAppData(local.appData), deviceSession);
        const { error: replaceError } = await supabase
          .from(SHARED_TABLE)
          .upsert(
            {
              household_id: householdId,
              app_data: stripSessionForShared(localSource),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "household_id" },
          );

        if (!replaceError) {
          writeAppData(localSource);
          return {
            appData: localSource,
            shouldPersist: false,
            storageMode: "supabase",
            syncWarning: null,
          };
        }

        console.warn("[Earned] Could not replace legacy shared demo data.", replaceError);
      }

      if (remoteHasLegacyDemoData) {
        const cleanSource = hasConfiguredLocalData(local.appData)
          ? withDeviceSession(normalizeAppData(stripLegacyDemoActivity(local.appData)), deviceSession)
          : getCleanStarterData(deviceSession);
        const { error: cleanError } = await supabase
          .from(SHARED_TABLE)
          .upsert(
            {
              household_id: householdId,
              app_data: stripSessionForShared(cleanSource),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "household_id" },
          );

        if (cleanError) {
          console.warn("[Earned] Could not clean legacy shared demo data.", cleanError);
        } else {
          writeAppData(cleanSource);
          return {
            appData: cleanSource,
            shouldPersist: false,
            storageMode: "supabase",
            syncWarning: null,
          };
        }
      }

      const merged = withDeviceSession(remoteCandidate, deviceSession);
      writeAppData(merged);
      return {
        appData: merged,
        shouldPersist: false,
        storageMode: "supabase",
        syncWarning: null,
      };
    }

    const seeded = hasLegacyDemoData(local.appData)
      ? hasConfiguredLocalData(local.appData)
        ? withDeviceSession(normalizeAppData(local.appData), deviceSession)
        : getCleanStarterData(deviceSession)
      : withDeviceSession(normalizeAppData(local.appData), deviceSession);
    const { error: seedError } = await supabase
      .from(SHARED_TABLE)
      .upsert(
        {
          household_id: householdId,
          app_data: stripSessionForShared(seeded),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "household_id" },
      );

    if (seedError) {
      console.warn("[Earned] Supabase seed failed. Falling back to local storage.", seedError);
      return {
        ...local,
        storageMode: "local",
        syncWarning: "Shared sync unavailable. Using local-only data on this device.",
      };
    }

    writeAppData(seeded);
    return {
      appData: seeded,
      shouldPersist: false,
      storageMode: "supabase",
      syncWarning: null,
    };
  } catch (error) {
    console.warn("[Earned] Shared app initialization failed. Falling back to local storage.", error);
    return {
      ...local,
      storageMode: "local",
      syncWarning: "Shared sync unavailable. Using local-only data on this device.",
    };
  }
}

export async function commitSharedAppData(nextData: AppData): Promise<SharedCommitResult> {
  const normalized = normalizeAppData(nextData);
  const localOk = writeAppData(normalized);
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return {
      appData: normalized,
      ok: localOk,
      storageMode: "local",
    };
  }

  try {
    const householdId = getSharedHouseholdId();
    const { error } = await supabase
      .from(SHARED_TABLE)
      .upsert(
        {
          household_id: householdId,
          app_data: stripSessionForShared(normalized),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "household_id" },
      );

    if (error) {
      throw error;
    }

    return {
      appData: normalized,
      ok: true,
      storageMode: "supabase",
    };
  } catch (error) {
    console.warn("[Earned] Shared save failed. Kept local copy only.", error);
    return {
      appData: normalized,
      ok: localOk,
      storageMode: "local",
    };
  }
}

export async function pullSharedAppDataSnapshot(
  localAppData: AppData,
): Promise<SharedPullResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      appData: null,
      ok: false,
      storageMode: "local",
    };
  }

  try {
    const householdId = getSharedHouseholdId();
    const { data, error } = await supabase
      .from(SHARED_TABLE)
      .select("app_data")
      .eq("household_id", householdId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const remoteHasLegacyDemoData = hasLegacyDemoData(data?.app_data);
    const normalized = normalizeStoredAppData(data?.app_data);
    if (!normalized) {
      return {
        appData: null,
        ok: true,
        storageMode: "supabase",
      };
    }

    const merged = remoteHasLegacyDemoData
      ? hasConfiguredLocalData(localAppData)
        ? withDeviceSession(normalizeAppData(localAppData), getDeviceSession(localAppData))
        : getCleanStarterData(getDeviceSession(localAppData))
      : withDeviceSession(normalized, getDeviceSession(localAppData));
    if (remoteHasLegacyDemoData) {
      await supabase
        .from(SHARED_TABLE)
        .upsert(
          {
            household_id: householdId,
            app_data: stripSessionForShared(merged),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "household_id" },
        );
    }
    writeAppData(merged);
    return {
      appData: merged,
      ok: true,
      storageMode: "supabase",
    };
  } catch (error) {
    console.warn("[Earned] Shared pull failed.", error);
    return {
      appData: null,
      ok: false,
      storageMode: "local",
    };
  }
}


export function clearCompletedTestData(appData: AppData): AppData {
  const timestamp = new Date().toISOString();
  const resetChore = (chore: Chore): Chore => ({
    ...chore,
    status: "available",
    rejection_note: null,
    photo_url: null,
    proof_entries: [],
    streak_overrides: [],
    submitted_at: null,
    approved_at: null,
    paid_at: null,
    updated_at: timestamp,
  });

  return {
    ...appData,
    chores: appData.chores
      .filter((chore) => !(isOptionalChore(chore) && !chore.is_template && chore.template_chore_id))
      .map(resetChore),
    checkIns: [],
    payouts: [],
  };
}
export function resetAppData() {
  const fresh = getNormalizedDemoData();
  writeAppData(fresh);
  return fresh;
}

export function setCurrentUser(appData: AppData, userId: string | null) {
  return {
    ...appData,
    session: {
      currentUserId: userId,
    },
  };
}

export function getCurrentUser(appData: AppData) {
  return (
    appData.users.find((user) => user.id === appData.session.currentUserId) ?? null
  );
}

export function getChildProfileForUser(
  childProfiles: ChildProfile[],
  user: User | null,
) {
  if (!user || user.role !== "child") {
    return null;
  }

  return childProfiles.find((profile) => profile.user_id === user.id) ?? null;
}

export function saveChore(
  appData: AppData,
  parent: User,
  draft: ChoreDraft,
): AppData {
  const timestamp = new Date().toISOString();
  const localDate = formatLocalIsoDate(new Date(timestamp));
  const amountCents = parseMoneyToCents(draft.amount);
  const isOptionalTemplate = draft.choreKind === "optional";
  const sharedRepeatingSchedule: RrcSchedule | null =
    draft.choreKind === "routine" || draft.choreKind === "optional"
      ? {
          ...draft.rrcSchedule,
          cycleType:
            draft.rrcSchedule.cycleType === "two_week_custody_block" ||
            draft.rrcSchedule.cycleType === "one_month_block"
              ? draft.rrcSchedule.cycleType
              : "weekly",
          requiredDays: [...draft.rrcSchedule.requiredDays],
          requiredDateOffsets:
            draft.rrcSchedule.cycleType === "weekly"
              ? []
              : [...(draft.rrcSchedule.requiredDateOffsets ?? [])],
          blockWeeks: (draft.rrcSchedule.blockWeeks ?? []).map((week) => [...week]),
          custodyPattern:
            draft.rrcSchedule.cycleType === "two_week_custody_block"
              ? {
                  baseWeekendStartDate:
                    draft.rrcSchedule.custodyPattern?.baseWeekendStartDate || null,
                  weekdayDays: [...(draft.rrcSchedule.custodyPattern?.weekdayDays ?? [])],
                  alternatingWeekendDays: [
                    ...(draft.rrcSchedule.custodyPattern?.alternatingWeekendDays ?? []),
                  ],
                }
              : null,
        }
      : null;
  const usesSharedRepeatingSchedule = Boolean(sharedRepeatingSchedule);
  const baseRecord = {
    parent_id: parent.id,
    child_id: draft.childId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    amount_cents: amountCents,
    start_date:
      usesSharedRepeatingSchedule
        ? sharedRepeatingSchedule?.cycleType === "two_week_custody_block"
          ? sharedRepeatingSchedule.custodyPattern?.baseWeekendStartDate || draft.startDate || null
          : draft.startDate || null
        : draft.startDate || localDate,
    due_date: draft.dueDate || null,
    recurring: usesSharedRepeatingSchedule ? true : draft.recurring,
    repeat_days:
      usesSharedRepeatingSchedule ? draft.rrcSchedule.requiredDays : draft.repeatDaysWeekA,
    repeat_pattern:
      usesSharedRepeatingSchedule
        ? draft.rrcSchedule.cycleType === "two_week_custody_block"
          ? "biweekly"
          : "weekly"
        : draft.repeatPattern,
    repeat_days_week_a:
      usesSharedRepeatingSchedule ? draft.rrcSchedule.requiredDays : draft.repeatDaysWeekA,
    repeat_days_week_b:
      usesSharedRepeatingSchedule
        ? []
        : draft.repeatPattern === "biweekly"
          ? draft.repeatDaysWeekB
          : [],
    chore_kind: draft.choreKind,
    reset_frequency: draft.resetFrequency,
    max_completions_per_reset: Math.max(1, draft.maxCompletionsPerReset || 1),
    manual_availability: draft.manualAvailability,
    total_required_completions:
      draft.choreKind === "routine" ? Math.max(1, draft.totalRequiredCompletions || 1) : null,
    payout_rule: draft.payoutRule,
    miss_behavior: draft.choreKind === "routine" ? "fail_period" : draft.missBehavior,
    only_when_child_present: draft.onlyWhenChildPresent,
    rrc_schedule: sharedRepeatingSchedule,
    is_template: isOptionalTemplate,
    template_chore_id: null,
    instance_period_key: null,
    updated_at: timestamp,
  };

  if (draft.id) {
    const existingChore = appData.chores.find((chore) => chore.id === draft.id);
    const descendantIds = new Set(
      appData.chores
        .filter((chore) => chore.template_chore_id === draft.id)
        .map((chore) => chore.id),
    );
    const shouldRemoveDescendants =
      existingChore?.is_template && !isOptionalTemplate && descendantIds.size > 0;

    return {
      ...appData,
      chores: appData.chores
        .filter((chore) => !(shouldRemoveDescendants && descendantIds.has(chore.id)))
        .map((chore) =>
          chore.id === draft.id
            ? {
                ...chore,
                ...baseRecord,
              }
            : chore,
        ),
    };
  }

  const newChore: Chore = {
    id: makeId("chore"),
    ...baseRecord,
    status: "available",
    rejection_note: null,
    photo_url: null,
    proof_entries: [],
    streak_overrides: [],
    submitted_at: null,
    approved_at: null,
    paid_at: null,
    created_at: timestamp,
  };

  return {
    ...appData,
    chores: [newChore, ...appData.chores],
  };
}

export function deleteChore(appData: AppData, choreId: string) {
  const target = appData.chores.find((chore) => chore.id === choreId);
  return {
    ...appData,
    chores: appData.chores.filter(
      (chore) =>
        chore.id !== choreId &&
        !(target?.is_template && chore.template_chore_id === choreId),
    ),
  };
}

export function submitChore(
  appData: AppData,
  choreId: string,
  photosInput: ProofPhotoInput[] | string | null,
): AppData {
  const timestamp = new Date().toISOString();
  const today = getTodayIsoDate();
  const selectedChore = appData.chores.find((chore) => chore.id === choreId);
  const photos = normalizeProofPhotoInputs(photosInput);
  const primaryPhotoUrl = photos[0]?.photo_url ?? null;
  const proofEntries = photos.length > 0 ? createProofEntries(photos, today, timestamp) : [];

  if (
    selectedChore &&
    isOptionalChore(selectedChore) &&
    selectedChore.is_template
  ) {
    const existingInstance = getOptionalInstanceForPeriod(appData.chores, selectedChore, today);
    if (existingInstance) {
      if (existingInstance.status !== "rejected") {
        return appData;
      }

      return {
        ...appData,
        chores: appData.chores.map<Chore>((chore) =>
          chore.id === existingInstance.id
            ? {
                ...chore,
                status: "submitted",
                photo_url: primaryPhotoUrl,
                proof_entries: proofEntries,
                rejection_note: null,
                submitted_at: timestamp,
                approved_at: null,
                paid_at: null,
                updated_at: timestamp,
              }
            : chore,
        ),
      };
    }

    const newInstance: Chore = {
      ...selectedChore,
      id: makeId("chore"),
      is_template: false,
      template_chore_id: selectedChore.id,
      instance_period_key: getCurrentPeriodKey(selectedChore, today),
      status: "submitted",
      photo_url: primaryPhotoUrl,
      proof_entries: proofEntries,
      streak_overrides: [],
      rejection_note: null,
      submitted_at: timestamp,
      approved_at: null,
      paid_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    };

    return {
      ...appData,
      chores: [newInstance, ...appData.chores],
    };
  }

  return {
    ...appData,
    chores: appData.chores.map<Chore>((chore) =>
      chore.id === choreId
        ? {
            ...chore,
            status: "submitted",
            photo_url: primaryPhotoUrl,
            proof_entries: proofEntries.length > 0 ? proofEntries : chore.proof_entries,
            rejection_note: null,
            submitted_at: timestamp,
            updated_at: timestamp,
          }
        : chore,
    ),
  };
}
export function approveChore(appData: AppData, choreId: string) {
  const timestamp = new Date().toISOString();
  const chore = appData.chores.find((entry) => entry.id === choreId);
  if (chore?.chore_kind === "routine" && !getRollingProgress(chore, appData.checkIns).isEligible) {
    return appData;
  }

  return {
    ...appData,
    chores: appData.chores.map<Chore>((chore) =>
      chore.id === choreId
        ? {
            ...chore,
            status: "approved",
            approved_at: timestamp,
            rejection_note: null,
            updated_at: timestamp,
          }
        : chore,
    ),
  };
}

export function addRollingProof(
  appData: AppData,
  choreId: string,
  photosInput: ProofPhotoInput[] | string,
  proofDate = getTodayIsoDate(),
): AppData {
  const timestamp = new Date().toISOString();
  const photos = normalizeProofPhotoInputs(photosInput);
  const primaryPhotoUrl = photos[0]?.photo_url ?? null;

  return {
    ...appData,
    chores: appData.chores.map<Chore>((chore) => {
      if (chore.id !== choreId || !primaryPhotoUrl) {
        return chore;
      }

      const nextEntries = [
        ...chore.proof_entries.filter((entry) => entry.proof_date !== proofDate),
        ...createProofEntries(photos, proofDate, timestamp),
      ].sort((left, right) => left.proof_date.localeCompare(right.proof_date));

      return {
        ...chore,
        photo_url: primaryPhotoUrl,
        proof_entries: nextEntries,
        updated_at: timestamp,
        rejection_note: null,
      };
    }),
  };
}
export function submitRollingChore(appData: AppData, choreId: string): AppData {
  const timestamp = new Date().toISOString();

  debugLog("chores", "submit routine for approval requested", { choreId });

  return {
    ...appData,
    chores: appData.chores.map<Chore>((chore) => {
      if (chore.id !== choreId) {
        return chore;
      }

      const progress = getRollingProgress(chore, appData.checkIns);
      debugLog("chores", "routine progress before submit", {
        choreId,
        completed: progress.completedDates.length,
        required: progress.requiredDates.length,
        eligible: progress.isEligible,
      });
      if (!progress.isEligible) {
        return chore;
      }

      return {
        ...chore,
        status: "submitted",
        submitted_at: timestamp,
        updated_at: timestamp,
        rejection_note: null,
      };
    }),
  };
}

export function saveRoutineCheckIn(
  appData: AppData,
  choreId: string,
  photosInput: ProofPhotoInput[] | string,
  checkInDate = getTodayIsoDate(),
) {
  debugLog("chores", "Save Check-In clicked", { choreId, checkInDate });

  const chore = appData.chores.find((entry) => entry.id === choreId);
  if (!chore) {
    console.error("[Earned] Save Check-In failed: chore not found", { choreId });
    return {
      appData,
      message: "Chore not found.",
      ok: false,
      persisted: false,
      rawStoredCheckInsCount: appData.checkIns.length,
      filteredCheckInsCount: appData.checkIns.filter((entry) => entry.chore_id === choreId).length,
    };
  }

  const photos = normalizeProofPhotoInputs(photosInput);
  const primaryPhotoUrl = photos[0]?.photo_url ?? null;

  if (!primaryPhotoUrl) {
    console.error("[Earned] Save Check-In failed: missing photo", { choreId });
    return {
      appData,
      message: "Photo upload failed.",
      ok: false,
      persisted: false,
      rawStoredCheckInsCount: appData.checkIns.length,
      filteredCheckInsCount: appData.checkIns.filter((entry) => entry.chore_id === choreId).length,
    };
  }

  debugLog("chores", "photo upload success", {
    choreId,
    photoCount: photos.length,
  });

  const existingCheckIn = getCheckInForChoreDate(appData.checkIns, choreId, checkInDate);
  if (existingCheckIn) {
    debugLog("chores", "duplicate Save Check-In prevented", {
      choreId,
      checkInDate,
      existingCheckInId: existingCheckIn.id,
    });
    return {
      appData,
      message: "Already checked in today.",
      ok: false,
      persisted: true,
      rawStoredCheckInsCount: appData.checkIns.length,
      filteredCheckInsCount: appData.checkIns.filter((entry) => entry.chore_id === choreId).length,
    };
  }

  const rollingState = getRollingProgress(chore, appData.checkIns);
  if (!rollingState.canCheckInToday) {
    return {
      appData,
      message: rollingState.nextRestartDate
        ? `Streak broken. Restarts ${rollingState.nextRestartDate}.`
        : "Today is not an active required check-in day.",
      ok: false,
      persisted: false,
      rawStoredCheckInsCount: appData.checkIns.length,
      filteredCheckInsCount: appData.checkIns.filter((entry) => entry.chore_id === choreId).length,
    };
  }

  const submittedAt = new Date().toISOString();
  const checkIn: CheckIn = {
    id: makeId("checkin"),
    chore_id: chore.id,
    parent_id: chore.parent_id,
    child_id: chore.child_id,
    photo_url: primaryPhotoUrl,
    photos: createProofPhotos(photos),
    check_in_date: checkInDate,
    submitted_at: submittedAt,
    uploaded_at: photos[0]?.uploaded_at ?? submittedAt,
  };

  debugLog("chores", "check-in record created", checkIn);

  const nextData = {
    ...appData,
    checkIns: [...appData.checkIns, checkIn],
    chores: appData.chores.map((entry) =>
      entry.id === choreId
        ? {
            ...entry,
            updated_at: checkIn.submitted_at,
          }
        : entry,
    ),
  };

  debugLog("chores", "counter recalculation after check-in", {
    choreId,
    refreshedCheckIns: nextData.checkIns.filter((entry) => entry.chore_id === choreId).length,
    persisted: true,
  });

  debugLog("chores", "response returned to frontend", {
    choreId,
    ok: true,
    checkInDate,
  });

  return {
    appData: nextData,
    message: photos.length > 1 ? "Today's proofs were added" : "Today's proof was added",
    ok: true,
    persisted: true,
    rawStoredCheckInsCount: nextData.checkIns.length,
    filteredCheckInsCount: nextData.checkIns.filter((entry) => entry.chore_id === choreId).length,
  };
}

const PARENT_RECORDED_CHECK_IN_PHOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23f7efd9'/%3E%3Ccircle cx='96' cy='88' r='42' fill='%2379a85a' opacity='.28'/%3E%3Cpath d='M112 235c80-92 155-104 225-36 56 55 117 56 188 2v92H112z' fill='%2379a85a' opacity='.36'/%3E%3Ctext x='320' y='162' text-anchor='middle' font-family='Arial,sans-serif' font-size='28' font-weight='700' fill='%23322820'%3EParent recorded check-in%3C/text%3E%3Ctext x='320' y='204' text-anchor='middle' font-family='Arial,sans-serif' font-size='18' fill='%23604d3d'%3EAdded from the parent dashboard%3C/text%3E%3C/svg%3E";

export function recordParentRoutineCheckIn(
  appData: AppData,
  choreId: string,
  parentUser: User,
  checkInDate = getTodayIsoDate(),
) {
  if (parentUser.role !== "parent") {
    return {
      appData,
      message: "Only a parent can record a check-in.",
      ok: false,
    };
  }

  const chore = appData.chores.find((entry) => entry.id === choreId);
  if (!chore || chore.chore_kind !== "routine" || chore.parent_id !== parentUser.id) {
    return {
      appData,
      message: "Required repeating chore not found.",
      ok: false,
    };
  }

  const existingCheckIn = getCheckInForChoreDate(appData.checkIns, choreId, checkInDate);
  if (existingCheckIn) {
    return {
      appData,
      message: "That check-in is already logged for today.",
      ok: false,
    };
  }

  const rollingState = getRollingProgress(chore, appData.checkIns);
  if (!rollingState.canCheckInToday) {
    return {
      appData,
      message: rollingState.nextRestartDate
        ? `Streak broken. Restarts ${rollingState.nextRestartDate}.`
        : "Today is not an active required check-in day.",
      ok: false,
    };
  }

  const timestamp = new Date().toISOString();
  const photo: ChoreProofPhoto = {
    id: makeId("photo"),
    photo_url: PARENT_RECORDED_CHECK_IN_PHOTO,
    uploaded_at: timestamp,
    label: "Extra",
  };
  const checkIn: CheckIn = {
    id: makeId("checkin"),
    chore_id: chore.id,
    parent_id: chore.parent_id,
    child_id: chore.child_id,
    photo_url: photo.photo_url,
    photos: [photo],
    check_in_date: checkInDate,
    submitted_at: timestamp,
    uploaded_at: timestamp,
  };

  return {
    appData: {
      ...appData,
      checkIns: [...appData.checkIns, checkIn],
      chores: appData.chores.map((entry) =>
        entry.id === choreId
          ? {
              ...entry,
              updated_at: timestamp,
            }
          : entry,
      ),
    },
    message: "Today's check-in was recorded.",
    ok: true,
  };
}
export function overrideMissedStreak(
  appData: AppData,
  choreId: string,
  missedDate: string,
  note: string,
  parentUser: User,
): AppData {
  if (parentUser.role !== "parent") {
    return appData;
  }

  const timestamp = new Date().toISOString();
  return {
    ...appData,
    chores: appData.chores.map<Chore>((chore) => {
      if (chore.id !== choreId || chore.chore_kind !== "routine") {
        return chore;
      }

      const existingOverrides = chore.streak_overrides ?? [];
      const nextOverride = {
        id: makeId("override"),
        missed_date: missedDate,
        override_at: timestamp,
        override_type: "excused" as const,
        note: note.trim() || null,
        parent_user_id: parentUser.id,
        parent_name: parentUser.name,
      };

      return {
        ...chore,
        streak_overrides: [
          ...existingOverrides.filter((entry) => entry.missed_date !== missedDate),
          nextOverride,
        ].sort((left, right) => left.missed_date.localeCompare(right.missed_date)),
        updated_at: timestamp,
      };
    }),
  };
}
export function rejectChore(
  appData: AppData,
  choreId: string,
  rejectionNote: string,
): AppData {
  const timestamp = new Date().toISOString();

  return {
    ...appData,
    chores: appData.chores.map<Chore>((chore) =>
      chore.id === choreId
        ? {
            ...chore,
            status: "rejected",
            rejection_note: rejectionNote.trim() || "Please try again.",
            approved_at: null,
            updated_at: timestamp,
          }
        : chore,
    ),
  };
}

export function markBalancePaid(
  appData: AppData,
  parentId: string,
  childId: string,
  notes: string,
  paymentItems?: PaymentLineItem[],
): AppData {
  const timestamp = new Date().toISOString();
  const explicitItems = paymentItems?.filter((item) => item.amountCents >= 0) ?? [];
  const explicitIds = new Set(explicitItems.map((item) => item.choreId));
  const payable =
    explicitItems.length > 0
      ? appData.chores.filter(
          (chore) => chore.child_id === childId && chore.status === "approved" && explicitIds.has(chore.id),
        )
      : appData.chores.filter(
          (chore) => chore.child_id === childId && chore.status === "approved",
        );
  const amountCents =
    explicitItems.length > 0
      ? explicitItems.reduce((sum, item) => sum + normalizeCents(item.amountCents), 0)
      : payable.reduce((sum, chore) => sum + chore.amount_cents, 0);

  if (payable.length === 0 || (amountCents === 0 && explicitItems.length === 0)) {
    return appData;
  }

  const paymentDetails =
    explicitItems.length > 0
      ? explicitItems
          .map((item) => {
            const chore = appData.chores.find((entry) => entry.id === item.choreId);
            return chore
              ? `${chore.title}: ${item.statusLabel} (${formatCentsForDollarInput(item.amountCents)})`
              : null;
          })
          .filter(Boolean)
          .join("; ")
      : "";
  const payoutNotes = [notes.trim(), paymentDetails].filter(Boolean).join(" | ");

  const payout: Payout = {
    id: makeId("payout"),
    parent_id: parentId,
    child_id: childId,
    amount_cents: amountCents,
    paid_method: "Manual Apple Cash",
    paid_at: timestamp,
    notes: payoutNotes || null,
  };

  return {
    ...appData,
    chores: appData.chores.map<Chore>((chore) =>
      chore.child_id === childId &&
      chore.status === "approved" &&
      (explicitItems.length === 0 || explicitIds.has(chore.id))
        ? {
            ...chore,
            status: "paid",
            paid_at: timestamp,
            updated_at: timestamp,
          }
        : chore,
    ),
    payouts: [payout, ...appData.payouts],
  };
}


