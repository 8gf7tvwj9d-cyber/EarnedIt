"use client";

import { getRollingProgress, getTodayIsoDate } from "@/lib/chore-helpers";
import { demoData } from "@/lib/demo-data";
import {
  AppData,
  Chore,
  ChoreDraft,
  ChildProfile,
  Payout,
  User,
} from "@/lib/chorepay-types";

const STORAGE_KEY = "chorepay-demo-store";

function cloneDemoData() {
  return JSON.parse(JSON.stringify(demoData)) as AppData;
}

function normalizeChore(chore: Chore): Chore {
  const weeklyDays = chore.repeat_days ?? [];
  return {
    ...chore,
    start_date: chore.start_date ?? chore.created_at.slice(0, 10),
    repeat_days: weeklyDays,
    repeat_pattern: chore.repeat_pattern ?? "weekly",
    repeat_days_week_a: chore.repeat_days_week_a ?? weeklyDays,
    repeat_days_week_b: chore.repeat_days_week_b ?? [],
    chore_kind: chore.chore_kind ?? "standard",
    proof_entries: chore.proof_entries ?? [],
  };
}

function normalizeAppData(appData: AppData): AppData {
  return {
    ...appData,
    chores: appData.chores.map((chore) => normalizeChore(chore)),
  };
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

export function readAppData(): AppData {
  if (typeof window === "undefined") {
    return cloneDemoData();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const fresh = normalizeAppData(cloneDemoData());
    writeAppData(fresh);
    return fresh;
  }

  try {
    return normalizeAppData(JSON.parse(raw) as AppData);
  } catch {
    const fresh = normalizeAppData(cloneDemoData());
    writeAppData(fresh);
    return fresh;
  }
}

export function writeAppData(nextData: AppData) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
}

export function resetAppData() {
  const fresh = normalizeAppData(cloneDemoData());
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
  const amountCents = Math.round(Number(draft.amount || "0") * 100);
  const baseRecord = {
    parent_id: parent.id,
    child_id: draft.childId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    amount_cents: amountCents,
    start_date: draft.startDate || timestamp.slice(0, 10),
    due_date: draft.dueDate || null,
    recurring: draft.recurring,
    repeat_days: draft.repeatDaysWeekA,
    repeat_pattern: draft.repeatPattern,
    repeat_days_week_a: draft.repeatDaysWeekA,
    repeat_days_week_b: draft.repeatPattern === "biweekly" ? draft.repeatDaysWeekB : [],
    chore_kind: draft.choreKind,
    updated_at: timestamp,
  };

  if (draft.id) {
    return {
      ...appData,
      chores: appData.chores.map((chore) =>
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
  return {
    ...appData,
    chores: appData.chores.filter((chore) => chore.id !== choreId),
  };
}

export function submitChore(
  appData: AppData,
  choreId: string,
  photoUrl: string | null,
): AppData {
  const timestamp = new Date().toISOString();

  return {
    ...appData,
    chores: appData.chores.map<Chore>((chore) =>
      chore.id === choreId
        ? {
            ...chore,
            status: "submitted",
            photo_url: photoUrl,
            proof_entries: photoUrl
              ? [
                  {
                    id: makeId("proof"),
                    proof_date: timestamp.slice(0, 10),
                    photo_url: photoUrl,
                    submitted_at: timestamp,
                  },
                ]
              : chore.proof_entries,
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
  photoUrl: string,
  proofDate = getTodayIsoDate(),
): AppData {
  const timestamp = new Date().toISOString();

  return {
    ...appData,
    chores: appData.chores.map<Chore>((chore) => {
      if (chore.id !== choreId) {
        return chore;
      }

      const nextEntries = [
        ...chore.proof_entries.filter((entry) => entry.proof_date !== proofDate),
        {
          id: makeId("proof"),
          proof_date: proofDate,
          photo_url: photoUrl,
          submitted_at: timestamp,
        },
      ].sort((left, right) => left.proof_date.localeCompare(right.proof_date));

      return {
        ...chore,
        photo_url: photoUrl,
        proof_entries: nextEntries,
        updated_at: timestamp,
        rejection_note: null,
      };
    }),
  };
}

export function submitRollingChore(appData: AppData, choreId: string): AppData {
  const timestamp = new Date().toISOString();

  return {
    ...appData,
    chores: appData.chores.map<Chore>((chore) => {
      if (chore.id !== choreId) {
        return chore;
      }

      const progress = getRollingProgress(chore);
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
): AppData {
  const timestamp = new Date().toISOString();
  const payable = appData.chores.filter(
    (chore) => chore.child_id === childId && chore.status === "approved",
  );
  const amountCents = payable.reduce(
    (sum, chore) => sum + chore.amount_cents,
    0,
  );

  if (amountCents === 0) {
    return appData;
  }

  const payout: Payout = {
    id: makeId("payout"),
    parent_id: parentId,
    child_id: childId,
    amount_cents: amountCents,
    paid_method: "Manual Apple Cash",
    paid_at: timestamp,
    notes: notes.trim() || null,
  };

  return {
    ...appData,
    chores: appData.chores.map<Chore>((chore) =>
      chore.child_id === childId && chore.status === "approved"
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
