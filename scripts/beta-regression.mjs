import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

process.env.NEXT_PUBLIC_EARNEDIT_AUTH_TEST_MODE = "true";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const require = Module.createRequire(import.meta.url);

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveEarnedItAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const sourcePath = path.join(repoRoot, "src", request.slice(2));
    for (const extension of [".ts", ".tsx", ".js", ".jsx"]) {
      const candidate = `${sourcePath}${extension}`;
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

for (const extension of [".ts", ".tsx"]) {
  Module._extensions[extension] = function compileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: filename,
    }).outputText;

    module._compile(output, filename);
  };
}

const {
  getComputedStatus,
  getCurrentPeriodKey,
  isOptionalInstanceChore,
} = require(path.join(repoRoot, "src/lib/chore-helpers.ts"));
const {
  approveChore,
  commitAppData,
  getChildProfileForUser,
  getCurrentUser,
  markBalancePaid,
  overrideMissedStreak,
  recordParentRoutineCheckIn,
  rejectChore,
  saveChore,
  setCurrentUser,
  submitChore,
  submitRollingChore,
} = require(path.join(repoRoot, "src/lib/storage/app-state.ts"));
const {
  getHouseholdChildren,
  getHouseholdChores,
  getHouseholdPayments,
} = require(path.join(repoRoot, "src/lib/data/household.ts"));
const { signInChildWithDeviceLink } = require(path.join(
  repoRoot,
  "src/lib/data/app-repository.ts",
));

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} must exist`);
  let open = -1;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] !== "{") {
      continue;
    }

    const previous = source.slice(start, index).trimEnd().at(-1);
    if (previous === ")" || previous === ">") {
      open = index;
      break;
    }
  }
  assert.notEqual(open, -1, `${functionName} must have a body`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(open + 1, index);
      }
    }
  }

  throw new Error(`${functionName} body was not closed`);
}

function assertSourceGuardrails() {
  const repositorySource = fs.readFileSync(
    path.join(repoRoot, "src/lib/data/app-repository.ts"),
    "utf8",
  );
  const earnedAppSource = fs.readFileSync(
    path.join(repoRoot, "src/components/app-shell/earned-it-app.tsx"),
    "utf8",
  );
  const childDashboardSource = fs.readFileSync(
    path.join(repoRoot, "src/components/child/child-dashboard.tsx"),
    "utf8",
  );
  const parentDashboardSource = fs.readFileSync(
    path.join(repoRoot, "src/components/parent/parent-dashboard.tsx"),
    "utf8",
  );
  const childManifestSource = fs.readFileSync(
    path.join(repoRoot, "src/app/child-manifest/route.ts"),
    "utf8",
  );
  const bootstrapBody = extractFunctionBody(repositorySource, "createRemoteParentHousehold");
  const errorBody = extractFunctionBody(repositorySource, "describeSupabaseError");
  const foundationSql = fs.readFileSync(
    path.join(repoRoot, "supabase/migrations/20260519_beta_multi_household_foundation.sql"),
    "utf8",
  );
  const childLoginSql = fs.readFileSync(
    path.join(repoRoot, "supabase/migrations/20260520_beta_child_login_code.sql"),
    "utf8",
  );
  const diagnosticSql = fs.readFileSync(
    path.join(repoRoot, "scripts/verify-beta-supabase-objects.sql"),
    "utf8",
  );

  assert.match(bootstrapBody, /id:\s*makeUuid\(\)/, "household bootstrap must use an explicit client UUID");
  assert.match(
    bootstrapBody,
    /\.from\("households"\)\.insert\(household\)/,
    "household bootstrap must insert without insert().select().single()",
  );
  assert.match(
    bootstrapBody,
    /\.from\("profiles"\)\.insert\(\{/,
    "first-time parent profile bootstrap must use plain insert",
  );
  assert.doesNotMatch(
    bootstrapBody,
    /\.from\("profiles"\)[\s\S]{0,120}\.upsert\(/,
    "first-time parent profile bootstrap must not use upsert",
  );
  assert.match(
    bootstrapBody,
    /getErrorCode\(profileError\)\s*===\s*"23505"[\s\S]*loadRemoteHouseholdGraph\(authUser\)/,
    "duplicate profile bootstrap must reload graph instead of retrying upsert",
  );
  assert.match(
    repositorySource,
    /repairMissingParentHousehold/,
    "stale profile to missing household repair path must exist",
  );
  assert.match(
    errorBody,
    /isMissingMigrationError\(error\)[\s\S]*beta database is not ready/,
    "database setup message must be reserved for missing schema objects",
  );
  assert.doesNotMatch(
    errorBody,
    /isRlsDeniedError\(error\)[\s\S]{0,220}beta database is not ready/,
    "RLS errors must not show the misleading beta database readiness message",
  );
  assert.match(
    foundationSql,
    /chores_status_check check \(status in \('available', 'submitted', 'approved', 'rejected', 'paid', 'expired'\)\)/,
    "chores_status_check must allow expired",
  );
  assert.match(
    foundationSql,
    /profiles owner insert[\s\S]*with check \(user_id = auth\.uid\(\)\)/,
    "profiles owner insert RLS policy must allow the authenticated user to create its profile",
  );
  assert.match(childLoginSql, /security definer/, "child login RPCs must run as security definer");
  assert.match(
    childLoginSql,
    /grant execute on function public\.bootstrap_child_device\(text\) to anon, authenticated/,
    "child bootstrap RPC must be executable by child-link sessions",
  );
  assert.match(
    childLoginSql,
    /grant execute on function public\.sync_child_device_state\(text, jsonb, jsonb\) to anon, authenticated/,
    "child sync RPC must be executable by child-link sessions",
  );
  assert.match(diagnosticSql, /pg_policies/, "diagnostic helper must check RLS policies");
  assert.doesNotMatch(
    earnedAppSource,
    /useState<BrowserNotificationStatus>\([\s\S]{0,120}getBrowserNotificationStatus/,
    "browser notification status must not be read during the first render",
  );
  assert.match(
    earnedAppSource,
    /useEffect\(\(\) => \{[\s\S]{0,120}setNotificationStatus\(getBrowserNotificationStatus\(\)\)/,
    "browser notification status should be detected after mount",
  );
  assert.doesNotMatch(
    childDashboardSource,
    /useState[\s\S]{0,320}sessionStorage/,
    "child dashboard must not read sessionStorage during the first render",
  );
  assert.match(
    childDashboardSource,
    /useEffect\(\(\) => \{[\s\S]{0,260}sessionStorage\.getItem\("earned-child-dashboard-sections"\)/,
    "child dashboard saved section state should be restored after mount",
  );
  assert.doesNotMatch(
    parentDashboardSource,
    /useState[\s\S]{0,320}sessionStorage/,
    "parent dashboard must not read sessionStorage during the first render",
  );
  assert.match(
    parentDashboardSource,
    /useEffect\(\(\) => \{[\s\S]{0,260}sessionStorage\.getItem\("earned-parent-dashboard-sections"\)/,
    "parent dashboard saved section state should be restored after mount",
  );
  assert.match(
    earnedAppSource,
    /\/child-manifest\?token=\$\{encodeURIComponent\(childProfile\.access_token\)\}/,
    "signed-in child sessions must switch to a tokenized install manifest",
  );
  assert.match(
    earnedAppSource,
    /isStandaloneAppLaunch\(\)[\s\S]{0,140}isChildTokenBlockedForStandalone\(childLinkToken\)/,
    "standalone child launches must respect child sign-out for tokenized home-screen icons",
  );
  assert.match(
    earnedAppSource,
    /blockChildTokenForStandalone\(activeChildToken\)/,
    "child sign-out must block the tokenized home-screen icon on that device",
  );
  assert.match(
    childManifestSource,
    /startUrl\s*=\s*token[\s\S]{0,120}\/child-link\?token=/,
    "child install manifest must launch back through the QR child-link bootstrap route",
  );
  assert.match(
    childManifestSource,
    /Content-Type["']:\s*["']application\/manifest\+json/,
    "child install manifest must be served as a web manifest",
  );
}

function parseIsoDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(isoDate, days) {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() + days);
  return formatLocalIsoDate(date);
}

function todayIsoDate() {
  return formatLocalIsoDate(new Date());
}

function weekdayFor(isoDate) {
  return weekdays[parseIsoDate(isoDate).getDay()];
}

function weeklySchedule(day) {
  return {
    cycleType: "weekly",
    weekStartsOn: "sunday",
    requiredDays: [day],
    requiredDateOffsets: [],
    custodyPattern: null,
    blockWeeks: [[day]],
    restartRule: "next_cycle_start",
  };
}

function draftFor({ amount = "1.50", childId, day, dueDate = "", kind, startDate, title }) {
  return {
    title,
    description: `${title} beta regression`,
    amount,
    childId,
    startDate,
    dueDate,
    recurring: kind !== "one_time",
    repeatDays: kind === "one_time" ? [] : [day],
    repeatPattern: "weekly",
    repeatDaysWeekA: kind === "one_time" ? [] : [day],
    repeatDaysWeekB: [],
    choreKind: kind,
    resetFrequency: kind === "optional" ? "daily" : "weekly",
    maxCompletionsPerReset: 1,
    manualAvailability: false,
    totalRequiredCompletions: 1,
    payoutRule: "all_or_nothing",
    missBehavior: "fail_period",
    onlyWhenChildPresent: false,
    rrcSchedule: weeklySchedule(day),
  };
}

function photo(label, index) {
  return {
    photo_url: `data:image/png;base64,${Buffer.from(`${label}-${index}`).toString("base64")}`,
    uploaded_at: new Date().toISOString(),
    label,
  };
}

function makeFamily(index, childCount = 2) {
  const timestamp = new Date().toISOString();
  const household = {
    id: `beta-household-${index}`,
    name: `Beta Household ${index}`,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const parent = {
    id: `beta-parent-auth-${index}`,
    household_id: household.id,
    auth_user_id: `beta-parent-auth-${index}`,
    name: `Beta Parent ${index}`,
    username: `beta-parent-${index}`,
    email: `beta-parent-${index}@example.test`,
    role: "parent",
    created_at: timestamp,
    updated_at: timestamp,
  };
  const profile = {
    id: `beta-parent-profile-${index}`,
    household_id: household.id,
    user_id: parent.id,
    display_name: parent.name,
    role: "parent",
    household_role: "owner",
    created_at: timestamp,
    updated_at: timestamp,
  };
  const children = Array.from({ length: childCount }, (_, childIndex) => {
    const childId = `beta-child-${index}-${childIndex}`;
    return {
      id: childId,
      household_id: household.id,
      parent_id: parent.id,
      name: `Beta Child ${index}-${childIndex}`,
      age: 7 + childIndex,
      gender: childIndex % 2 === 0 ? "male" : "female",
      user_id: `beta-child-user-${index}-${childIndex}`,
      access_token: `child_token_${index}_${childIndex}_${"x".repeat(30)}`,
      created_at: timestamp,
      updated_at: timestamp,
    };
  });
  const childUsers = children.map((child) => ({
    id: child.user_id,
    household_id: child.household_id,
    auth_user_id: null,
    name: child.name,
    username: child.name.toLowerCase().replace(/\s+/g, "-"),
    email: null,
    role: "child",
    created_at: timestamp,
    updated_at: timestamp,
  }));

  return {
    household,
    parent,
    profile,
    children,
    users: [parent, ...childUsers],
  };
}

function findChore(appData, title) {
  const chore = appData.chores.find((entry) => entry.title === title);
  assert.ok(chore, `Expected chore "${title}"`);
  return chore;
}

async function assertWorkflowRegressions() {
  const today = todayIsoDate();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const day = weekdayFor(today);
  const missedDay = weekdayFor(yesterday);
  const familyA = makeFamily("a", 3);
  const familyB = makeFamily("b", 2);
  let appData = {
    households: [familyA.household, familyB.household],
    profiles: [familyA.profile, familyB.profile],
    users: [...familyA.users, ...familyB.users],
    childProfiles: [...familyA.children, ...familyB.children],
    chores: [],
    checkIns: [],
    payouts: [],
    session: {
      currentUserId: familyA.parent.id,
      currentHouseholdId: familyA.household.id,
      authUserId: familyA.parent.id,
      authMode: "demo",
    },
  };

  assert.equal(getHouseholdChildren(appData).length, 3, "parent household should load its own children");

  appData = saveChore(
    appData,
    familyA.parent,
    draftFor({
      childId: familyA.children[0].id,
      day,
      dueDate: tomorrow,
      kind: "one_time",
      startDate: today,
      title: "A0 one-time",
    }),
  );
  appData = saveChore(
    appData,
    familyA.parent,
    draftFor({
      childId: familyA.children[1].id,
      day,
      dueDate: tomorrow,
      kind: "one_time",
      startDate: today,
      title: "A1 one-time",
    }),
  );
  appData = saveChore(
    appData,
    familyB.parent,
    draftFor({
      childId: familyB.children[0].id,
      day,
      dueDate: tomorrow,
      kind: "one_time",
      startDate: today,
      title: "B0 private",
    }),
  );
  appData = saveChore(
    appData,
    familyA.parent,
    draftFor({
      childId: familyA.children[0].id,
      day,
      kind: "routine",
      startDate: yesterday,
      title: "A0 RRC today",
    }),
  );
  appData = saveChore(
    appData,
    familyA.parent,
    draftFor({
      childId: familyA.children[0].id,
      day,
      kind: "optional",
      startDate: today,
      title: "A0 optional",
    }),
  );

  assert.equal(
    getHouseholdChores(appData).every((chore) => chore.household_id === familyA.household.id),
    true,
    "parent household chore selector must not leak another household",
  );
  assert.equal(
    appData.chores.filter((chore) => chore.child_id === familyA.children[0].id).some((chore) => chore.title === "A1 one-time"),
    false,
    "chores assigned to one child must not appear for a sibling child",
  );
  assert.equal(
    appData.chores.filter((chore) => chore.child_id === familyB.children[0].id).every((chore) => chore.household_id === familyB.household.id),
    true,
    "other household child data must stay separately scoped",
  );

  const persisted = commitAppData(JSON.parse(JSON.stringify(appData))).appData;
  assert.ok(findChore(persisted, "A0 one-time"), "created chore must survive persistence normalization");

  appData = setCurrentUser(appData, null);
  appData = setCurrentUser(appData, familyA.parent.id);
  assert.equal(getCurrentUser(appData)?.id, familyA.parent.id, "sign out/sign back in restores parent user");

  const childSignIn = await signInChildWithDeviceLink(familyA.children[0].access_token, appData);
  assert.equal(childSignIn.ok, true, "child access token login should bootstrap locally in beta test mode");
  const childUser = getCurrentUser(childSignIn.appData);
  const childProfile = getChildProfileForUser(childSignIn.appData.childProfiles, childUser);
  assert.equal(childProfile?.id, familyA.children[0].id, "child login must bind to the token owner only");

  const oneTime = findChore(childSignIn.appData, "A0 one-time");
  appData = submitChore(childSignIn.appData, oneTime.id, [photo("Before", 1), photo("After", 2)]);
  const submittedOneTime = findChore(appData, "A0 one-time");
  assert.equal(submittedOneTime.status, "submitted", "child completion should submit chore");
  assert.equal(submittedOneTime.proof_entries.length, 2, "before/after multi-photo submission keeps both proof entries");
  assert.deepEqual(
    submittedOneTime.proof_entries.map((entry) => entry.label).sort(),
    ["After", "Before"],
    "before/after labels should survive proof normalization",
  );
  appData = approveChore(appData, oneTime.id);
  assert.equal(findChore(appData, "A0 one-time").status, "approved", "parent can approve child completion");
  appData = markBalancePaid(appData, familyA.parent.id, familyA.children[0].id, "beta regression payout");
  assert.equal(getHouseholdPayments(appData).length, 1, "parent payment approval records one household payout");

  const siblingChore = findChore(appData, "A1 one-time");
  appData = submitChore(appData, siblingChore.id, [photo("After", 3)]);
  appData = rejectChore(appData, siblingChore.id, "Needs a clearer photo.");
  assert.equal(findChore(appData, "A1 one-time").status, "rejected", "parent can reject a child completion");

  const routineToday = findChore(appData, "A0 RRC today");
  assert.equal(
    getComputedStatus(routineToday, appData.checkIns),
    "available",
    "RRC required today must remain available before the local day is over",
  );
  const routineCheckIn = recordParentRoutineCheckIn(appData, routineToday.id, familyA.parent, today);
  assert.equal(routineCheckIn.ok, true, "parent can protect a required routine streak with a check-in");
  appData = submitRollingChore(routineCheckIn.appData, routineToday.id);
  assert.equal(findChore(appData, "A0 RRC today").status, "submitted", "routine can submit after protected check-in");

  appData = saveChore(
    appData,
    familyA.parent,
    draftFor({
      childId: familyA.children[2].id,
      day: missedDay,
      kind: "routine",
      startDate: yesterday,
      title: "A2 missed RRC",
    }),
  );
  const missedRoutine = findChore(appData, "A2 missed RRC");
  const overrideData = overrideMissedStreak(
    appData,
    missedRoutine.id,
    yesterday,
    "Protected during beta regression",
    familyA.parent,
  );
  const protectedRoutine = findChore(overrideData, "A2 missed RRC");
  assert.equal(protectedRoutine.streak_overrides.length, 1, "missed streak override should be recorded");
  assert.equal(
    protectedRoutine.streak_overrides[0].household_id,
    familyA.household.id,
    "missed streak override must preserve household scope",
  );

  const optionalTemplate = findChore(appData, "A0 optional");
  appData = submitChore(appData, optionalTemplate.id, [photo("After", 4)]);
  const optionalInstances = appData.chores.filter((chore) => chore.template_chore_id === optionalTemplate.id);
  assert.equal(optionalInstances.length, 1, "optional chore should create one period instance");
  assert.equal(
    optionalInstances[0].instance_period_key,
    getCurrentPeriodKey(optionalTemplate, today),
    "optional instance period key should be stable",
  );
  assert.equal(isOptionalInstanceChore(optionalInstances[0]), true, "optional submission should be an instance");
}

assertSourceGuardrails();
await assertWorkflowRegressions();

console.log("Beta regression checks passed: bootstrap guardrails, household scoping, child login, chores, photos, approvals, RRC, and overrides.");
