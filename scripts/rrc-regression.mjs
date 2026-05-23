import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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

function registerTypeScriptExtension(extension) {
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

registerTypeScriptExtension(".ts");
registerTypeScriptExtension(".tsx");

const {
  getComputedStatus,
  getCurrentPeriodKey,
  getOptionalInstanceForPeriod,
  getOptionalTemplate,
  getTodayIsoDate,
  isOptionalInstanceChore,
} = require(path.join(repoRoot, "src/lib/chore-helpers.ts"));
const {
  recordParentRoutineCheckIn,
  saveChore,
  submitChore,
} = require(path.join(repoRoot, "src/lib/storage/app-state.ts"));

const weekdayKeys = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

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

function weekdayFor(isoDate) {
  return weekdayKeys[parseIsoDate(isoDate).getDay()];
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

function makeDraft({ kind, title, childId, startDate, requiredDay }) {
  return {
    title,
    description: `${title} description`,
    amount: "2.00",
    childId,
    startDate,
    dueDate: "",
    recurring: kind !== "one_time",
    repeatDays: [requiredDay],
    repeatPattern: "weekly",
    repeatDaysWeekA: [requiredDay],
    repeatDaysWeekB: [],
    choreKind: kind,
    resetFrequency: kind === "optional" ? "daily" : "weekly",
    maxCompletionsPerReset: 1,
    manualAvailability: false,
    totalRequiredCompletions: 1,
    payoutRule: "all_or_nothing",
    missBehavior: "fail_period",
    onlyWhenChildPresent: false,
    rrcSchedule: weeklySchedule(requiredDay),
  };
}

function getParentActiveChores(appData) {
  return appData.chores.filter((chore) => {
    const status = getComputedStatus(chore, appData.checkIns);
    if (isOptionalInstanceChore(chore)) {
      return status === "rejected";
    }

    return status === "available" || status === "rejected";
  });
}

function getChildAssignedChores(appData) {
  return appData.chores.filter((chore) => {
    const status = getComputedStatus(chore, appData.checkIns);
    if (isOptionalInstanceChore(chore)) {
      return false;
    }

    return status === "available" || status === "rejected" || status === "expired";
  });
}

const today = getTodayIsoDate();
const yesterday = addDays(today, -1);
const todayWeekday = weekdayFor(today);
const parent = {
  id: "parent-regression",
  name: "Parent",
  role: "parent",
  username: "parent-regression",
};
const childUser = {
  id: "child-user-regression",
  name: "Child",
  role: "child",
  username: "child-regression",
};
const childProfile = {
  id: "child-profile-regression",
  name: "Child",
  parent_id: parent.id,
  user_id: childUser.id,
};

let appData = {
  users: [parent, childUser],
  childProfiles: [childProfile],
  chores: [],
  checkIns: [],
  payouts: [],
  session: { currentUserId: parent.id },
};

appData = saveChore(
  appData,
  parent,
  makeDraft({
    kind: "routine",
    title: "Required room reset",
    childId: childProfile.id,
    startDate: yesterday,
    requiredDay: todayWeekday,
  }),
);
appData = saveChore(
  appData,
  parent,
  makeDraft({
    kind: "optional",
    title: "Optional leaf sweep",
    childId: childProfile.id,
    startDate: yesterday,
    requiredDay: todayWeekday,
  }),
);

const routine = appData.chores.find((chore) => chore.title === "Required room reset");
const optionalTemplate = appData.chores.find((chore) => chore.title === "Optional leaf sweep");

assert.ok(routine, "required repeating chore was created");
assert.ok(optionalTemplate, "optional repeating chore was created");
assert.notEqual(routine.id, optionalTemplate.id, "required and optional chores have distinct IDs");
assert.equal(routine.chore_kind, "routine", "required repeating chore keeps routine kind");
assert.equal(optionalTemplate.chore_kind, "optional", "optional repeating chore keeps optional kind");
assert.equal(routine.template_chore_id, null, "routine does not inherit optional template identity");
assert.equal(routine.instance_period_key, null, "routine does not inherit optional instance period");
assert.equal(optionalTemplate.is_template, true, "optional chore remains the reusable template");
assert.equal(
  getComputedStatus(routine, appData.checkIns),
  "available",
  "ongoing RRC without due date does not expire before local day ends",
);
assert.equal(
  getComputedStatus({ ...routine, due_date: today }, appData.checkIns),
  "available",
  "RRC due today remains available through the local day",
);
assert.equal(
  getComputedStatus({ ...routine, due_date: yesterday }, appData.checkIns),
  "expired",
  "RRC with an explicit past due date expires after the local day passes",
);

const staleRoutineIdentity = {
  ...routine,
  is_template: true,
  template_chore_id: optionalTemplate.id,
  instance_period_key: getCurrentPeriodKey(optionalTemplate, today),
};
assert.equal(
  getOptionalTemplate(appData.chores, staleRoutineIdentity),
  null,
  "non-optional chores are never treated as optional instances during edit/render lookup",
);

let activeChores = getParentActiveChores(appData);
assert.equal(new Set(activeChores.map((chore) => chore.id)).size, activeChores.length);
assert.ok(
  activeChores.some((chore) => chore.id === routine.id && chore.title === routine.title),
  "parent active list keeps the RRC identity",
);
assert.ok(
  activeChores.some((chore) => chore.id === optionalTemplate.id && chore.title === optionalTemplate.title),
  "parent active list keeps the optional template identity",
);

const submittedData = submitChore(appData, optionalTemplate.id, [
  {
    photo_url: "data:image/png;base64,optional-proof",
    uploaded_at: new Date().toISOString(),
    label: "After",
  },
]);
const optionalInstances = submittedData.chores.filter(
  (chore) => chore.template_chore_id === optionalTemplate.id,
);

assert.equal(optionalInstances.length, 1, "submitting an optional repeating chore creates one instance");
assert.ok(isOptionalInstanceChore(optionalInstances[0]), "generated optional record is an instance");
assert.notEqual(optionalInstances[0].id, optionalTemplate.id, "optional instance ID differs from template ID");
assert.notEqual(optionalInstances[0].id, routine.id, "optional instance ID differs from RRC ID");
assert.equal(
  optionalInstances[0].instance_period_key,
  getCurrentPeriodKey(optionalTemplate, today),
  "optional instance has stable period identity",
);
assert.equal(
  getOptionalInstanceForPeriod(submittedData.chores, optionalTemplate, today)?.id,
  optionalInstances[0].id,
  "optional instance lookup returns the generated instance by template and period",
);
assert.equal(
  submittedData.chores.find((chore) => chore.id === routine.id)?.title,
  routine.title,
  "optional submission does not mutate the RRC title",
);

const resubmittedData = submitChore(submittedData, optionalTemplate.id, [
  {
    photo_url: "data:image/png;base64,second-proof",
    uploaded_at: new Date().toISOString(),
    label: "After",
  },
]);
assert.equal(
  resubmittedData.chores.filter((chore) => chore.template_chore_id === optionalTemplate.id).length,
  1,
  "same-period optional submission does not create duplicate instances",
);

activeChores = getParentActiveChores(submittedData);
assert.ok(
  activeChores.some((chore) => chore.id === routine.id && chore.title === routine.title),
  "parent active list still shows the RRC after optional submission",
);
assert.ok(
  !activeChores.some((chore) => chore.id === optionalInstances[0].id),
  "submitted optional instance is not shown as a second active template",
);

const childAssigned = getChildAssignedChores(submittedData);
assert.ok(
  childAssigned.some((chore) => chore.id === routine.id && getComputedStatus(chore, submittedData.checkIns) === "available"),
  "child dashboard keeps the RRC available today",
);
assert.ok(
  childAssigned.some((chore) => chore.id === optionalTemplate.id && chore.title === optionalTemplate.title),
  "child dashboard keeps the optional chore as its own template",
);
assert.ok(
  !childAssigned.some((chore) => chore.id === optionalInstances[0].id),
  "child dashboard does not show generated optional instances as duplicate assigned chores",
);

const parentCheckInResult = recordParentRoutineCheckIn(submittedData, routine.id, parent, today);
assert.equal(parentCheckInResult.ok, true, "parent can record today's RRC check-in");
assert.equal(
  parentCheckInResult.appData.checkIns.filter(
    (entry) => entry.chore_id === routine.id && entry.check_in_date === today,
  ).length,
  1,
  "parent-recorded RRC check-in is persisted once for today",
);
assert.equal(
  getComputedStatus(
    parentCheckInResult.appData.chores.find((chore) => chore.id === routine.id),
    parentCheckInResult.appData.checkIns,
  ),
  "available",
  "parent-recorded RRC check-in does not expire or mutate the chore",
);
assert.equal(
  recordParentRoutineCheckIn(parentCheckInResult.appData, routine.id, parent, today).ok,
  false,
  "parent check-in action prevents duplicate same-day records",
);

console.log("RRC regression checks passed.");
