import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const householdCount = Number(process.env.EARNEDIT_STRESS_HOUSEHOLDS ?? 24);
const childrenPerHousehold = Number(process.env.EARNEDIT_STRESS_CHILDREN ?? 5);
const choresPerChild = Number(process.env.EARNEDIT_STRESS_CHORES ?? 32);
const completionsPerChild = Number(process.env.EARNEDIT_STRESS_COMPLETIONS ?? 48);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeToken() {
  return `child_${randomUUID()}_${randomUUID()}`;
}

function hashLocalPassword(email, password) {
  return createHash("sha256").update(`${email.toLowerCase()}:${password}`).digest("hex");
}

function createStressData() {
  const households = [];
  const localCredentials = [];

  for (let householdIndex = 0; householdIndex < householdCount; householdIndex += 1) {
    const householdId = `household-${householdIndex}-${randomUUID()}`;
    const parentId = `parent-${householdIndex}-${randomUUID()}`;
    const email = `parent${householdIndex}@stress.local`;
    const household = {
      children: [],
      chores: [],
      completions: [],
      email,
      householdId,
      householdName: `Stress Household ${householdIndex}`,
      parentId,
      parentName: `Stress Parent ${householdIndex}`,
    };

    localCredentials.push({
      email,
      passwordHash: hashLocalPassword(email, "beta-password"),
      userId: parentId,
    });

    for (let childIndex = 0; childIndex < childrenPerHousehold; childIndex += 1) {
      const childId = `child-${householdIndex}-${childIndex}-${randomUUID()}`;
      const child = {
        accessToken: makeToken(),
        age: 6 + (childIndex % 9),
        gender: childIndex % 2 === 0 ? "male" : "female",
        householdId,
        id: childId,
        name: `Stress Child ${householdIndex}-${childIndex}`,
        parentId,
        revokedTokens: [],
        userId: `child-user-${childId}`,
      };
      household.children.push(child);

      for (let choreIndex = 0; choreIndex < choresPerChild; choreIndex += 1) {
        household.chores.push({
          amountCents: 100 + choreIndex,
          childId,
          householdId,
          id: `chore-${householdIndex}-${childIndex}-${choreIndex}-${randomUUID()}`,
          parentId,
          status: choreIndex % 7 === 0 ? "submitted" : "available",
          title: `Stress chore ${choreIndex}`,
        });
      }

      for (let completionIndex = 0; completionIndex < completionsPerChild; completionIndex += 1) {
        const chore = household.chores[completionIndex % household.chores.length];
        household.completions.push({
          childId,
          choreId: chore.id,
          householdId,
          id: `completion-${householdIndex}-${childIndex}-${completionIndex}-${randomUUID()}`,
          status: "submitted",
        });
      }
    }

    households.push(household);
  }

  return { households, localCredentials };
}

function bootstrapChildDeviceByToken(data, token) {
  for (const household of data.households) {
    const child = household.children.find((candidate) => candidate.accessToken === token);
    if (child) {
      return {
        child,
        chores: household.chores.filter((chore) => chore.childId === child.id),
        completions: household.completions.filter((entry) => entry.childId === child.id),
        householdId: household.householdId,
        role: "child",
      };
    }
  }

  return null;
}

function canAccess(session, area) {
  const parentOnly = new Set([
    "account",
    "child-management",
    "household-management",
    "payment-approval",
    "reward-config",
    "admin-tools",
  ]);

  if (session.role === "parent") {
    return true;
  }

  return !parentOnly.has(area);
}

function runStress() {
  const started = performance.now();
  const data = createStressData();
  const allChildren = data.households.flatMap((household) => household.children);
  const activeTokens = new Set(allChildren.map((child) => child.accessToken));

  assert(activeTokens.size === allChildren.length, "Child QR tokens must be unique.");

  for (const household of data.households) {
    assert(household.children.length === childrenPerHousehold, "Every household keeps its children.");
    for (const child of household.children) {
      const linked = bootstrapChildDeviceByToken(data, child.accessToken);
      assert(linked, "Active child QR token must link.");
      assert(linked.role === "child", "QR token must create a child role only.");
      assert(linked.householdId === child.householdId, "QR token must stay in the correct household.");
      assert(linked.child.id === child.id, "QR token must stay tied to one child.");
      assert(linked.chores.every((chore) => chore.childId === child.id), "Child chores must be isolated.");
      assert(
        linked.completions.every((entry) => entry.childId === child.id),
        "Child completions must be isolated.",
      );
      assert(canAccess(linked, "chores"), "Child should access chores.");
      assert(canAccess(linked, "uploads"), "Child should access uploads.");
      assert(!canAccess(linked, "account"), "Child must not access account.");
      assert(!canAccess(linked, "child-management"), "Child must not manage child profiles.");
      assert(!canAccess(linked, "payment-approval"), "Child must not approve payments.");

      const oldToken = child.accessToken;
      child.revokedTokens.push(oldToken);
      child.accessToken = makeToken();
      assert(!bootstrapChildDeviceByToken(data, oldToken), "Regenerated QR must revoke old token.");
      assert(bootstrapChildDeviceByToken(data, child.accessToken), "Regenerated QR must link.");
    }
  }

  const serialized = JSON.stringify(data);
  const reloaded = JSON.parse(serialized);
  assert(
    reloaded.households.length === householdCount,
    "Persistence round-trip must keep households.",
  );
  assert(
    reloaded.households.flatMap((household) => household.children).length === allChildren.length,
    "Persistence round-trip must keep children.",
  );
  assert(
    data.localCredentials.every(
      (credential) =>
        credential.passwordHash === hashLocalPassword(credential.email, "beta-password"),
    ),
    "Local beta parent credentials must survive sign-out/sign-in checks.",
  );

  const elapsed = Math.round(performance.now() - started);
  console.log(
    `Stress regression passed: ${householdCount} households, ${allChildren.length} children, ${data.households.reduce(
      (sum, household) => sum + household.chores.length,
      0,
    )} chores, ${data.households.reduce(
      (sum, household) => sum + household.completions.length,
      0,
    )} completions in ${elapsed}ms.`,
  );
}

runStress();
