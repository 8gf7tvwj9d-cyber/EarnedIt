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
  clearCompletedTestData,
  commitAppData,
  deleteChore,
  markBalancePaid,
  recordParentRoutineCheckIn,
  rejectChore,
  saveChore,
  submitChore,
  submitRollingChore,
} = require(path.join(repoRoot, "src/lib/storage/app-state.ts"));
const { getTodayKey } = require(path.join(repoRoot, "src/lib/chore-progress.ts"));

const weekdays = [
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

function todayWeekday(today) {
  return weekdays[parseIsoDate(today).getDay()];
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

function draftFor({ childId, day, kind, title, startDate, dueDate = "" }) {
  return {
    title,
    description: `${title} workflow check`,
    amount: "1.25",
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

function photo(label) {
  return {
    photo_url: `data:image/png;base64,${Buffer.from(label).toString("base64")}`,
    uploaded_at: new Date().toISOString(),
    label: "After",
  };
}

function findChore(appData, title, childId) {
  const chore = appData.chores.find(
    (entry) => entry.title === title && entry.child_id === childId,
  );
  assert.ok(chore, `Expected chore ${title} for ${childId}`);
  return chore;
}

function assertUniqueIds(appData) {
  for (const collectionName of ["users", "childProfiles", "chores", "checkIns", "payouts"]) {
    const ids = appData[collectionName].map((entry) => entry.id);
    assert.equal(
      new Set(ids).size,
      ids.length,
      `${collectionName} should not contain duplicate ids`,
    );
  }
}

function getParentActiveChores(appData, parentId) {
  return appData.chores
    .filter((chore) => chore.parent_id === parentId)
    .filter((chore) => {
      const status = getComputedStatus(chore, appData.checkIns);
      if (isOptionalInstanceChore(chore)) {
        return status === "rejected";
      }

      return status === "available" || status === "rejected";
    });
}

const today = getTodayKey();
const yesterday = addDays(today, -1);
const day = todayWeekday(today);
const familyCount = 16;
const childrenPerFamily = 3;
const users = [];
const childProfiles = [];
const families = [];

for (let familyIndex = 0; familyIndex < familyCount; familyIndex += 1) {
  const parent = {
    id: `parent-${familyIndex}`,
    name: `Parent ${familyIndex}`,
    username: `parent-${familyIndex}`,
    role: "parent",
  };
  users.push(parent);

  const children = [];
  for (let childIndex = 0; childIndex < childrenPerFamily; childIndex += 1) {
    const childUser = {
      id: `child-user-${familyIndex}-${childIndex}`,
      name: `Child ${familyIndex}-${childIndex}`,
      username: `child-${familyIndex}-${childIndex}`,
      role: "child",
    };
    const childProfile = {
      id: `child-profile-${familyIndex}-${childIndex}`,
      name: childUser.name,
      parent_id: parent.id,
      user_id: childUser.id,
    };
    users.push(childUser);
    childProfiles.push(childProfile);
    children.push(childProfile);
  }

  families.push({ parent, children });
}

let appData = {
  users,
  childProfiles,
  chores: [],
  checkIns: [],
  payouts: [],
  session: { currentUserId: families[0].parent.id },
};

for (const [familyIndex, family] of families.entries()) {
  for (const [childIndex, child] of family.children.entries()) {
    const prefix = `${familyIndex}-${childIndex}`;
    appData = saveChore(
      appData,
      family.parent,
      draftFor({
        childId: child.id,
        day,
        kind: "routine",
        title: `RRC ${prefix}`,
        startDate: yesterday,
      }),
    );
    appData = saveChore(
      appData,
      family.parent,
      draftFor({
        childId: child.id,
        day,
        kind: "optional",
        title: `Optional ${prefix}`,
        startDate: yesterday,
      }),
    );
    appData = saveChore(
      appData,
      family.parent,
      draftFor({
        childId: child.id,
        day,
        kind: "one_time",
        title: `One time ${prefix}`,
        startDate: yesterday,
        dueDate: today,
      }),
    );

    const routine = findChore(appData, `RRC ${prefix}`, child.id);
    const optionalTemplate = findChore(appData, `Optional ${prefix}`, child.id);
    const oneTime = findChore(appData, `One time ${prefix}`, child.id);
    const wrongParent = families[(familyIndex + 1) % families.length].parent;

    assert.equal(
      getComputedStatus(routine, appData.checkIns),
      "available",
      "RRC should be available before today's local day ends",
    );
    assert.equal(
      recordParentRoutineCheckIn(appData, routine.id, wrongParent, today).ok,
      false,
      "wrong parent cannot record another family check-in",
    );

    const parentCheckIn = recordParentRoutineCheckIn(appData, routine.id, family.parent, today);
    assert.equal(parentCheckIn.ok, true, "parent can recover-log today's RRC check-in");
    appData = parentCheckIn.appData;
    assert.equal(
      recordParentRoutineCheckIn(appData, routine.id, family.parent, today).ok,
      false,
      "parent recovery check-in is idempotent for the day",
    );

    appData = submitRollingChore(appData, routine.id);
    assert.equal(
      getComputedStatus(findChore(appData, `RRC ${prefix}`, child.id), appData.checkIns),
      "submitted",
      "RRC can submit after required check-in is logged",
    );
    appData = approveChore(appData, routine.id);

    appData = submitChore(appData, optionalTemplate.id, [photo(`optional-${prefix}`)]);
    let optionalInstances = appData.chores.filter(
      (entry) => entry.template_chore_id === optionalTemplate.id,
    );
    assert.equal(optionalInstances.length, 1, "optional template creates one period instance");
    assert.equal(
      optionalInstances[0].instance_period_key,
      getCurrentPeriodKey(optionalTemplate, today),
      "optional instance period key is stable",
    );
    appData = rejectChore(appData, optionalInstances[0].id, "Try another photo.");
    appData = submitChore(appData, optionalTemplate.id, [photo(`optional-resubmit-${prefix}`)]);
    optionalInstances = appData.chores.filter(
      (entry) => entry.template_chore_id === optionalTemplate.id,
    );
    assert.equal(optionalInstances.length, 1, "optional resubmit reuses rejected instance");
    appData = approveChore(appData, optionalInstances[0].id);

    appData = submitChore(appData, oneTime.id, [photo(`one-time-${prefix}`)]);
    appData = approveChore(appData, oneTime.id);
    appData = markBalancePaid(appData, family.parent.id, child.id, "stress payment");

    assert.equal(
      appData.chores.filter((entry) => entry.child_id === child.id && entry.status === "approved").length,
      0,
      "payment workflow clears approved queue for the child",
    );
    assert.ok(
      appData.payouts.some((payout) => payout.parent_id === family.parent.id && payout.child_id === child.id),
      "payment workflow records a payout for the child",
    );

    assertUniqueIds(appData);
  }
}

for (const family of families) {
  const activeChores = getParentActiveChores(appData, family.parent.id);
  assert.equal(
    activeChores.every((chore) => chore.parent_id === family.parent.id),
    true,
    "parent active dashboard remains family scoped",
  );

  for (const child of family.children) {
    const childChores = appData.chores.filter((chore) => chore.child_id === child.id);
    assert.equal(
      childChores.every((chore) => chore.parent_id === family.parent.id),
      true,
      "child view remains scoped to its own parent",
    );
  }
}

const firstFamily = families[0];
const firstChild = firstFamily.children[0];
appData = saveChore(
  appData,
  firstFamily.parent,
  draftFor({
    childId: firstChild.id,
    day,
    kind: "optional",
    title: "Delete cascade optional",
    startDate: yesterday,
  }),
);
const deleteTemplate = findChore(appData, "Delete cascade optional", firstChild.id);
appData = submitChore(appData, deleteTemplate.id, [photo("delete-cascade")]);
assert.equal(
  appData.chores.filter((entry) => entry.template_chore_id === deleteTemplate.id).length,
  1,
  "delete cascade setup has one optional instance",
);
appData = deleteChore(appData, deleteTemplate.id);
assert.equal(
  appData.chores.some(
    (entry) => entry.id === deleteTemplate.id || entry.template_chore_id === deleteTemplate.id,
  ),
  false,
  "deleting an optional template removes generated instances",
);

const routineForNormalization = appData.chores.find((entry) => entry.chore_kind === "routine");
const templateForNormalization = appData.chores.find((entry) => entry.chore_kind === "optional" && entry.is_template);
assert.ok(routineForNormalization && templateForNormalization, "normalization fixtures exist");
const normalizedResult = commitAppData({
  ...appData,
  chores: appData.chores.map((chore) =>
    chore.id === routineForNormalization.id
      ? {
          ...chore,
          is_template: true,
          template_chore_id: templateForNormalization.id,
          instance_period_key: "stale-period",
        }
      : chore,
  ),
});
const normalizedRoutine = normalizedResult.appData.chores.find(
  (entry) => entry.id === routineForNormalization.id,
);
assert.equal(normalizedRoutine.is_template, false, "normalization strips template flag from RRC");
assert.equal(normalizedRoutine.template_chore_id, null, "normalization strips stale RRC template id");
assert.equal(normalizedRoutine.instance_period_key, null, "normalization strips stale RRC period key");

const cleared = clearCompletedTestData(appData);
assert.equal(cleared.checkIns.length, 0, "clear test data removes check-ins");
assert.equal(cleared.payouts.length, 0, "clear test data removes payouts");
assert.equal(
  cleared.chores.some((chore) => isOptionalInstanceChore(chore)),
  false,
  "clear test data removes generated optional instances",
);
assert.equal(
  cleared.chores.filter((chore) => chore.chore_kind === "routine").length,
  familyCount * childrenPerFamily,
  "clear test data preserves RRC definitions",
);

console.log(
  `Home-stable stress checks passed for ${familyCount} families, ${familyCount * childrenPerFamily} children, ${appData.chores.length} chore records, ${appData.checkIns.length} check-ins, and ${appData.payouts.length} payouts.`,
);
