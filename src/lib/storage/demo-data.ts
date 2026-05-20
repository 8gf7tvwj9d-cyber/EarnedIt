import { AppData } from "@/types/app";

const householdId = "family-household-1";
const timestamp = "2026-05-01T12:00:00.000Z";

export const demoData: AppData = {
  households: [
    {
      id: householdId,
      name: "My Household",
      created_at: timestamp,
      updated_at: timestamp,
    },
  ],
  profiles: [
    {
      id: "profile-parent-1",
      household_id: householdId,
      user_id: "user-parent-1",
      display_name: "Parent",
      role: "parent",
      household_role: "owner",
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: "profile-child-1",
      household_id: householdId,
      user_id: "user-child-1",
      display_name: "Child",
      role: "child",
      household_role: "viewer",
      created_at: timestamp,
      updated_at: timestamp,
    },
  ],
  users: [
    {
      id: "user-parent-1",
      household_id: householdId,
      auth_user_id: null,
      name: "Parent",
      username: "parent",
      email: null,
      role: "parent",
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: "user-child-1",
      household_id: householdId,
      auth_user_id: null,
      name: "Child",
      username: "child",
      email: null,
      role: "child",
      created_at: timestamp,
      updated_at: timestamp,
    },
  ],
  childProfiles: [
    {
      id: "child-1",
      household_id: householdId,
      parent_id: "user-parent-1",
      name: "Child",
      user_id: "user-child-1",
      created_at: timestamp,
      updated_at: timestamp,
    },
  ],
  chores: [],
  checkIns: [],
  payouts: [],
  session: {
    currentUserId: null,
    currentHouseholdId: householdId,
    authUserId: null,
    authMode: "demo",
  },
};
