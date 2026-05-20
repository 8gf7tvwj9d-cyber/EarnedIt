import {
  clearCompletedTestData as clearStoredCompletedTestData,
  deleteChore as deleteStoredChore,
  initializeAppData,
  markBalancePaid as markStoredBalancePaid,
  approveChore as approveStoredChore,
  overrideMissedStreak as overrideStoredMissedStreak,
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
  getSupabaseBrowserClient,
  getSupabaseEnvState,
  getSupabaseSetupWarning,
} from "@/lib/supabase";
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
  created_at: string;
  display_name: string;
  household_id: string;
  id: string;
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

// Beta safety note: keep multi-household and sync work on beta-multi-user.
export type DataBackendMode = "local" | "supabase";

export type SharedAppDataInitialization = AppDataInitialization & {
  storageMode: DataBackendMode;
  syncWarning: string | null;
};

export type SharedCommitResult = {
  appData: AppData;
  ok: boolean;
  storageMode: DataBackendMode;
};

export type SharedPullResult = {
  appData: AppData | null;
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

function getRepositoryHouseholdId(appData: AppData) {
  return getHouseholdId(appData);
}

function getCurrentTimestamp() {
  return new Date().toISOString();
}

function toUsername(source: string) {
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "member";
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
  return {
    id: row.id,
    household_id: row.household_id,
    parent_id: parentUserId,
    name: row.display_name,
    user_id: `child-user-${row.id}`,
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

  const { data: household, error: householdError } = await supabase
    .from("households")
    .select("id, name, created_at, updated_at")
    .eq("id", parentProfile.household_id)
    .single<HouseholdRow>();

  if (householdError) {
    throw householdError;
  }

  const { data: children, error: childrenError } = await supabase
    .from("children")
    .select("id, household_id, profile_id, parent_profile_id, display_name, created_at, updated_at")
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

async function getSignedInAuthUser(): Promise<AuthSessionUser | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.user) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email ?? null,
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

  if (!authBootstrap.canUseSupabaseAuth) {
    return {
      ...local,
      storageMode: "local",
      syncWarning: authBootstrap.setupWarning,
    };
  }

  try {
    const authUser = await getSignedInAuthUser();
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
    console.warn("[Earned] Supabase household bootstrap failed. Using local mode.", error);
    return {
      ...local,
      storageMode: "local",
      syncWarning: "Supabase household sync is unavailable. Using local-only data on this device.",
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

  try {
    const authUser = await getSignedInAuthUser();
    if (!authUser) {
      return {
        appData: nextData,
        ok,
        storageMode: "local",
      };
    }

    const graph = await loadRemoteHouseholdGraph(authUser);
    if (!graph) {
      return {
        appData: nextData,
        ok,
        storageMode: "local",
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
    console.warn("[Earned] Chore sync failed. Keeping local copy only.", error);
    return {
      appData: nextData,
      ok,
      storageMode: "local",
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
      storageMode: "local",
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
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "local",
      message: "Supabase is not configured yet.",
    };
  }

  const displayName = draft.displayName.trim();
  const householdName = draft.householdName.trim();
  const email = draft.email.trim().toLowerCase();
  if (!displayName || !householdName || !email || !draft.password.trim()) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Please complete every field before creating a household.",
    };
  }

  const signUpResult = await supabase.auth.signUp({
    email,
    password: draft.password,
    options: {
      data: {
        display_name: displayName,
      },
    },
  });

  if (signUpResult.error) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: signUpResult.error.message,
    };
  }

  const authUser = signUpResult.data.user
    ? {
        id: signUpResult.data.user.id,
        email: signUpResult.data.user.email ?? email,
      }
    : await getSignedInAuthUser();

  if (!authUser) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Account created, but no active session was returned. Sign in to finish setup.",
    };
  }

  const timestamp = getCurrentTimestamp();
  const { data: household, error: householdError } = await supabase
    .from("households")
    .insert({
      name: householdName,
    })
    .select("id, name, created_at, updated_at")
    .single<HouseholdRow>();

  if (householdError) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: householdError.message,
    };
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    household_id: household.id,
    user_id: authUser.id,
    email,
    display_name: displayName,
    role: "parent",
    household_role: "owner",
    created_at: timestamp,
    updated_at: timestamp,
  });

  if (profileError) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: profileError.message,
    };
  }

  const graph = await loadRemoteHouseholdGraph(authUser);
  if (!graph) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Household was created, but the account profile could not be reloaded.",
    };
  }

  const remoteState = await loadRemoteChoreState(graph.household.id);
  const merged = mergeRemoteHouseholdIntoLocal(localAppData, graph, authUser, remoteState);
  writeAppData(merged);
  return {
    appData: merged,
    ok: true,
    storageMode: "supabase",
    message: `Household ${household.name} is ready.`,
  };
}

export async function signInParent(
  draft: ParentLoginDraft,
  localAppData: AppData,
): Promise<ParentAuthResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "local",
      message: "Supabase is not configured yet.",
    };
  }

  const signInResult = await supabase.auth.signInWithPassword({
    email: draft.email.trim().toLowerCase(),
    password: draft.password,
  });

  if (signInResult.error) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: signInResult.error.message,
    };
  }

  const authUser = signInResult.data.user
    ? {
        id: signInResult.data.user.id,
        email: signInResult.data.user.email ?? null,
      }
    : await getSignedInAuthUser();

  if (!authUser) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Signed in, but no active session was returned.",
    };
  }

  const graph = await loadRemoteHouseholdGraph(authUser);
  if (!graph) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "This account is signed in, but no household profile was found.",
    };
  }

  const remoteState = await loadRemoteChoreState(graph.household.id);
  const merged = mergeRemoteHouseholdIntoLocal(localAppData, graph, authUser, remoteState);
  writeAppData(merged);
  return {
    appData: merged,
    ok: true,
    storageMode: "supabase",
    message: `Signed in to ${graph.household.name}.`,
  };
}

export async function signOutParent(localAppData: AppData): Promise<ParentAuthResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "local",
      message: "Supabase is not configured yet.",
    };
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    return {
      appData: localAppData,
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
    ok: true,
    storageMode: "supabase",
    message: "Signed out.",
  };
}

export async function createChildRecord(
  childName: string,
  localAppData: AppData,
): Promise<ChildCreateResult> {
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

  const trimmedName = childName.trim();
  if (!trimmedName) {
    return {
      appData: localAppData,
      ok: false,
      storageMode: "supabase",
      message: "Enter a child name first.",
    };
  }

  const timestamp = getCurrentTimestamp();
  const { error } = await supabase.from("children").insert({
    household_id: graph.household.id,
    parent_profile_id: graph.parentProfile.id,
    display_name: trimmedName,
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
    message: `${trimmedName} was added to ${refreshedGraph.household.name}.`,
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
