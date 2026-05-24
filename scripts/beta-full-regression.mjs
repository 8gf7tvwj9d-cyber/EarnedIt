import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const TEST_EMAIL_PREFIX = "beta-test-";
const TEST_EMAIL_DOMAIN = "@earnedit.test";
const TEST_DATA_PREFIX = "TEST_beta_full_";
const cleanupFailures = [];

function loadDotEnv(fileName) {
  const filePath = path.join(repoRoot, fileName);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadDotEnv(".env");
loadDotEnv(".env.local");

function readEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function createSupabaseClient(key) {
  return createClient(readEnv("NEXT_PUBLIC_SUPABASE_URL"), key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function formatSupabaseError(error) {
  if (!error) {
    return "unknown error";
  }

  const parts = [error.message, error.code, error.details, error.hint].filter(Boolean);
  return parts.join(" | ");
}

function fail(label, error) {
  throw new Error(`${label}: ${formatSupabaseError(error)}`);
}

function ensureOk(response, label) {
  if (response.error) {
    fail(label, response.error);
  }

  return response.data;
}

function todayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function makeRunConfig(label) {
  const timestamp = Date.now();
  const random = randomBytes(4).toString("hex");
  const runId = `${timestamp}-${random}-${label}`;
  return {
    email: `${TEST_EMAIL_PREFIX}${timestamp}-${random}-${label}${TEST_EMAIL_DOMAIN}`,
    householdId: randomUUID(),
    householdName: `${TEST_DATA_PREFIX}${runId}_household`,
    password: `BetaFull-${randomBytes(12).toString("base64url")}!9a`,
    parentDisplayName: `${TEST_DATA_PREFIX}${runId}_parent`,
    runId,
  };
}

function makeChild(run, label, age, gender) {
  return {
    accessToken: `${TEST_DATA_PREFIX}${run.runId}_${label}_${randomBytes(18).toString("hex")}`,
    age,
    gender,
    id: randomUUID(),
    name: `${TEST_DATA_PREFIX}${run.runId}_child_${label}`,
  };
}

function makeChore(run, child, label, amountCents) {
  return {
    amount_cents: amountCents,
    child_id: child.id,
    chore_kind: "one_time",
    client_id: `${TEST_DATA_PREFIX}${run.runId}_chore_${label}`,
    description: `${TEST_DATA_PREFIX}${run.runId} seeded chore ${label}`,
    due_date: todayIsoDate(),
    household_id: run.householdId,
    id: randomUUID(),
    manual_availability: false,
    max_completions_per_reset: 1,
    miss_behavior: "fail_period",
    only_when_child_present: false,
    payout_rule: "all_or_nothing",
    recurring: false,
    reset_frequency: "daily",
    start_date: todayIsoDate(),
    status: "available",
    title: `${TEST_DATA_PREFIX}${run.runId}_chore_${label}`,
  };
}

function makeCompletion(run, chore, child, label) {
  return {
    child_id: child.id,
    chore_client_id: chore.client_id,
    chore_id: chore.id,
    client_id: `${TEST_DATA_PREFIX}${run.runId}_completion_${label}`,
    completion_date: todayIsoDate(),
    household_id: run.householdId,
    id: randomUUID(),
    status: "submitted",
    submitted_at: new Date().toISOString(),
  };
}

async function cleanupHouseholds(adminClient, householdIds) {
  if (householdIds.length === 0) {
    return;
  }

  const uniqueHouseholdIds = [...new Set(householdIds.filter(Boolean))];
  const dependentTables = [
    "chore_photos",
    "chore_adjustments",
    "chore_completions",
    "payments",
    "payouts",
    "chores",
    "children",
    "profiles",
  ];

  for (const table of dependentTables) {
    const { error } = await adminClient.from(table).delete().in("household_id", uniqueHouseholdIds);
    if (error) {
      cleanupFailures.push(`${table} cleanup failed: ${formatSupabaseError(error)}`);
    }
  }

  const { error: householdError } = await adminClient
    .from("households")
    .delete()
    .in("id", uniqueHouseholdIds);
  if (householdError) {
    cleanupFailures.push(`households cleanup failed: ${formatSupabaseError(householdError)}`);
  }
}

async function cleanupTaggedDatabaseData(adminClient, extraHouseholdIds = []) {
  const taggedHouseholds = ensureOk(
    await adminClient.from("households").select("id, name").like("name", "TEST%"),
    "select tagged households for cleanup",
  ).filter((household) => household.name?.startsWith(TEST_DATA_PREFIX));

  const taggedProfiles = ensureOk(
    await adminClient.from("profiles").select("household_id, display_name, email").like("display_name", "TEST%"),
    "select tagged profiles for cleanup",
  ).filter((profile) => profile.display_name?.startsWith(TEST_DATA_PREFIX));

  const householdIds = [
    ...extraHouseholdIds,
    ...taggedHouseholds.map((household) => household.id),
    ...taggedProfiles.map((profile) => profile.household_id),
  ];

  await cleanupHouseholds(adminClient, householdIds);
}

async function cleanupGeneratedAuthUsers(adminClient, extraUserIds = []) {
  const userIds = new Set(extraUserIds.filter(Boolean));

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      cleanupFailures.push(`auth user listing failed: ${formatSupabaseError(error)}`);
      break;
    }

    const users = data?.users ?? [];
    for (const user of users) {
      const email = user.email?.toLowerCase() ?? "";
      if (email.startsWith(TEST_EMAIL_PREFIX) && email.endsWith(TEST_EMAIL_DOMAIN)) {
        userIds.add(user.id);
      }
    }

    if (users.length < 1000) {
      break;
    }
  }

  for (const userId of userIds) {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) {
      cleanupFailures.push(`auth user cleanup failed for ${userId}: ${formatSupabaseError(error)}`);
    }
  }
}

async function createConfirmedAuthUser(adminClient, run) {
  const { data, error } = await adminClient.auth.admin.createUser({
    app_metadata: {
      is_test_data: true,
      test_suite: "beta-full-regression",
    },
    email: run.email,
    email_confirm: true,
    password: run.password,
    user_metadata: {
      display_name: run.parentDisplayName,
      is_test_data: true,
      test_run_id: run.runId,
    },
  });

  if (error) {
    fail(`create generated parent auth user ${run.email}`, error);
  }

  assert.ok(data.user?.id, "Generated parent auth user must include an id.");
  return data.user;
}

async function signInGeneratedParent(run) {
  const client = createSupabaseClient(readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  const { data, error } = await client.auth.signInWithPassword({
    email: run.email,
    password: run.password,
  });

  if (error) {
    fail(`sign in generated parent ${run.email}`, error);
  }

  assert.ok(data.user?.id, "Generated parent sign-in must return a user.");
  return { client, user: data.user };
}

async function bootstrapParentHousehold(parentClient, authUser, run) {
  const timestamp = new Date().toISOString();

  ensureOk(
    await parentClient.from("households").insert({
      created_at: timestamp,
      id: run.householdId,
      name: run.householdName,
      updated_at: timestamp,
    }),
    "insert parent household with explicit id",
  );

  ensureOk(
    await parentClient.from("profiles").insert({
      created_at: timestamp,
      display_name: run.parentDisplayName,
      email: run.email,
      household_id: run.householdId,
      household_role: "owner",
      role: "parent",
      updated_at: timestamp,
      user_id: authUser.id,
    }),
    "insert parent profile with auth.uid household",
  );

  const profile = ensureOk(
    await parentClient
      .from("profiles")
      .select("id, household_id, user_id, display_name")
      .eq("user_id", authUser.id)
      .single(),
    "reload parent profile after bootstrap",
  );

  assert.equal(profile.user_id, authUser.id, "Profile user_id must match auth.uid().");
  assert.equal(profile.household_id, run.householdId, "Profile household_id must match inserted household.");

  const household = ensureOk(
    await parentClient.from("households").select("id, name").eq("id", run.householdId).single(),
    "reload parent household after bootstrap",
  );
  assert.equal(household.id, run.householdId, "Reloaded household must match inserted household.");

  return profile;
}

async function seedChildren(parentClient, run, parentProfile) {
  const timestamp = new Date().toISOString();
  const children = [
    makeChild(run, "one", 8, "female"),
    makeChild(run, "two", 10, "male"),
  ];

  ensureOk(
    await parentClient.from("children").insert(
      children.map((child) => ({
        age: child.age,
        child_access_token: child.accessToken,
        created_at: timestamp,
        display_name: child.name,
        gender: child.gender,
        household_id: run.householdId,
        id: child.id,
        parent_profile_id: parentProfile.id,
        updated_at: timestamp,
      })),
    ),
    "insert generated child profiles",
  );

  const persistedChildren = ensureOk(
    await parentClient
      .from("children")
      .select("id, household_id, parent_profile_id, display_name, child_access_token")
      .eq("household_id", run.householdId)
      .order("display_name", { ascending: true }),
    "reload generated child profiles",
  );

  assert.equal(persistedChildren.length, 2, "Generated parent should reload both child profiles.");
  assert.equal(
    persistedChildren.every((child) => child.display_name?.startsWith(TEST_DATA_PREFIX)),
    true,
    "Generated child profiles must be tagged with TEST_ names.",
  );

  return children;
}

async function seedChores(parentClient, run, parentProfile, children) {
  const timestamp = new Date().toISOString();
  const chores = [
    makeChore(run, children[0], "child_one_submit", 250),
    makeChore(run, children[1], "child_two_reject", 175),
  ];

  ensureOk(
    await parentClient.from("chores").insert(
      chores.map((chore) => ({
        ...chore,
        created_at: timestamp,
        parent_id: parentProfile.user_id,
        parent_profile_id: parentProfile.id,
        repeat_days: [],
        repeat_days_week_a: [],
        repeat_days_week_b: [],
        updated_at: timestamp,
      })),
    ),
    "insert generated chores as parent",
  );

  const persistedChores = ensureOk(
    await parentClient
      .from("chores")
      .select("id, client_id, household_id, child_id, title, status")
      .eq("household_id", run.householdId),
    "reload generated chores as parent",
  );

  assert.equal(persistedChores.length, 2, "Generated parent should reload both chore records.");
  assert.equal(
    persistedChores.every((chore) => chore.title?.startsWith(TEST_DATA_PREFIX)),
    true,
    "Generated chores must be tagged with TEST_ names.",
  );

  return chores;
}

async function assertChildBootstrap(child, expectedChore, unexpectedChore) {
  const childClient = createSupabaseClient(readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  const bootstrap = ensureOk(
    await childClient.rpc("bootstrap_child_device", {
      access_token: child.accessToken,
    }),
    `bootstrap child device ${child.name}`,
  );

  assert.ok(bootstrap, "Child bootstrap should return a payload.");
  assert.equal(bootstrap.child.id, child.id, "Child bootstrap must bind to the token owner.");
  assert.equal(
    bootstrap.chores.some((chore) => chore.client_id === expectedChore.client_id),
    true,
    "Child bootstrap should include the assigned chore.",
  );
  assert.equal(
    bootstrap.chores.some((chore) => chore.client_id === unexpectedChore.client_id),
    false,
    "Child bootstrap must not include a sibling's chore.",
  );

  return childClient;
}

async function submitChoreFromChild(childClient, child, chore, completion) {
  const payload = ensureOk(
    await childClient.rpc("sync_child_device_state", {
      access_token: child.accessToken,
      chore_rows: [
        {
          client_id: chore.client_id,
          status: "submitted",
          submitted_at: completion.submitted_at,
        },
      ],
      completion_rows: [
        {
          chore_client_id: chore.client_id,
          client_id: completion.client_id,
          completion_date: completion.completion_date,
          status: "submitted",
          submitted_at: completion.submitted_at,
        },
      ],
    }),
    `submit chore from child ${child.name}`,
  );

  assert.equal(
    payload.chores.some((entry) => entry.client_id === chore.client_id && entry.status === "submitted"),
    true,
    "Child sync should return the submitted chore state.",
  );
  assert.equal(
    payload.completions.some((entry) => entry.client_id === completion.client_id),
    true,
    "Child sync should return the submitted completion state.",
  );
}

async function updateParentDecision(parentClient, completion, chore, status, extra = {}) {
  const timestamp = new Date().toISOString();
  const timestampColumn = status === "approved" ? "approved_at" : "rejected_at";

  ensureOk(
    await parentClient
      .from("chores")
      .update({
        approved_at: status === "approved" ? timestamp : null,
        rejection_note: extra.rejection_note ?? null,
        status,
      })
      .eq("id", chore.id),
    `parent ${status} chore`,
  );

  ensureOk(
    await parentClient
      .from("chore_completions")
      .update({
        [timestampColumn]: timestamp,
        rejection_note: extra.rejection_note ?? null,
        status,
      })
      .eq("client_id", completion.client_id)
      .eq("household_id", completion.household_id),
    `parent ${status} completion`,
  );
}

async function assertParentPersistenceAfterSignIn(run, expectedCounts) {
  const { client } = await signInGeneratedParent(run);
  const chores = ensureOk(
    await client.from("chores").select("id, status").eq("household_id", run.householdId),
    "reload chores after sign out/sign in",
  );
  const completions = ensureOk(
    await client
      .from("chore_completions")
      .select("id, status")
      .eq("household_id", run.householdId),
    "reload completions after sign out/sign in",
  );

  assert.equal(chores.length, expectedCounts.chores, "Chores should persist across sign out/sign in.");
  assert.equal(
    completions.length,
    expectedCounts.completions,
    "Completions should persist across sign out/sign in.",
  );
  await client.auth.signOut();
}

async function assertParentBoundary(parentClient, foreignRun) {
  const foreignChildren = ensureOk(
    await parentClient.from("children").select("id").eq("household_id", foreignRun.householdId),
    "RLS boundary check for foreign children",
  );
  const foreignChores = ensureOk(
    await parentClient.from("chores").select("id").eq("household_id", foreignRun.householdId),
    "RLS boundary check for foreign chores",
  );

  assert.equal(foreignChildren.length, 0, "Parent must not read another household's children.");
  assert.equal(foreignChores.length, 0, "Parent must not read another household's chores.");
}

async function runFamilyFlow(adminClient, run) {
  const authUser = await createConfirmedAuthUser(adminClient, run);
  const { client: parentClient, user: signedInUser } = await signInGeneratedParent(run);
  assert.equal(signedInUser.id, authUser.id, "Signed-in test user must be the generated auth user.");

  const parentProfile = await bootstrapParentHousehold(parentClient, signedInUser, run);
  const children = await seedChildren(parentClient, run, parentProfile);
  const chores = await seedChores(parentClient, run, parentProfile, children);

  const childOneClient = await assertChildBootstrap(children[0], chores[0], chores[1]);
  const childTwoClient = await assertChildBootstrap(children[1], chores[1], chores[0]);

  const childOneCompletion = makeCompletion(run, chores[0], children[0], "child_one_submit");
  const childTwoCompletion = makeCompletion(run, chores[1], children[1], "child_two_reject");

  await submitChoreFromChild(childOneClient, children[0], chores[0], childOneCompletion);
  await submitChoreFromChild(childTwoClient, children[1], chores[1], childTwoCompletion);

  await updateParentDecision(parentClient, childOneCompletion, chores[0], "approved");
  await updateParentDecision(parentClient, childTwoCompletion, chores[1], "rejected", {
    rejection_note: `${TEST_DATA_PREFIX}${run.runId}_needs_more_detail`,
  });

  const decisions = ensureOk(
    await parentClient
      .from("chores")
      .select("client_id, status, rejection_note")
      .eq("household_id", run.householdId),
    "reload parent approval and rejection decisions",
  );
  assert.equal(
    decisions.some((chore) => chore.client_id === chores[0].client_id && chore.status === "approved"),
    true,
    "Parent approval should persist.",
  );
  assert.equal(
    decisions.some((chore) => chore.client_id === chores[1].client_id && chore.status === "rejected"),
    true,
    "Parent rejection should persist.",
  );

  await parentClient.auth.signOut();
  await assertParentPersistenceAfterSignIn(run, { chores: 2, completions: 2 });

  return { authUser, children, chores };
}

async function main() {
  const missing = [
    readEnv("NEXT_PUBLIC_SUPABASE_URL") ? null : "NEXT_PUBLIC_SUPABASE_URL",
    readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? null : "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    readEnv("SUPABASE_SERVICE_ROLE_KEY") ? null : "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    const message = `Beta full live regression skipped. Missing ${missing.join(
      ", ",
    )}; generated auth users cannot be created and cleaned up safely without these values.`;
    if (process.env.EARNEDIT_BETA_FULL_REQUIRE_LIVE === "true") {
      throw new Error(message);
    }

    console.warn(message);
    return;
  }

  const adminClient = createSupabaseClient(readEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const runA = makeRunConfig("a");
  const runB = makeRunConfig("b");
  const createdUserIds = [];
  const createdHouseholdIds = [runA.householdId, runB.householdId];
  let boundaryClient = null;
  let testError = null;

  try {
    await cleanupTaggedDatabaseData(adminClient);
    await cleanupGeneratedAuthUsers(adminClient);

    const primaryFlow = await runFamilyFlow(adminClient, runA);
    createdUserIds.push(primaryFlow.authUser.id);

    const secondaryFlow = await runFamilyFlow(adminClient, runB);
    createdUserIds.push(secondaryFlow.authUser.id);

    boundaryClient = (await signInGeneratedParent(runA)).client;
    await assertParentBoundary(boundaryClient, runB);
    console.log(
      `Beta full live regression passed for generated accounts ${runA.email} and ${runB.email}.`,
    );
  } catch (error) {
    testError = error;
    throw error;
  } finally {
    if (boundaryClient) {
      await boundaryClient.auth.signOut().catch((error) => {
        cleanupFailures.push(`parent sign-out cleanup failed: ${formatSupabaseError(error)}`);
      });
    }

    await cleanupTaggedDatabaseData(adminClient, createdHouseholdIds).catch((error) => {
      cleanupFailures.push(`tagged database cleanup threw: ${error.message}`);
    });
    await cleanupGeneratedAuthUsers(adminClient, createdUserIds).catch((error) => {
      cleanupFailures.push(`auth cleanup threw: ${error.message}`);
    });

    for (const failure of cleanupFailures) {
      console.warn(`[beta-full cleanup] ${failure}`);
    }

    if (cleanupFailures.length > 0 && !testError) {
      throw new Error("Beta full live regression passed, but cleanup failed. See warnings above.");
    }
  }
}

await main();
