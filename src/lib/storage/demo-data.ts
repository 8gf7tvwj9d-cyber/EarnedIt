import { AppData } from "@/types/app";

export const demoData: AppData = {
  users: [
    {
      id: "user-parent-1",
      name: "Parent",
      username: "parent",
      role: "parent",
    },
    {
      id: "user-child-1",
      name: "Child",
      username: "child",
      role: "child",
    },
  ],
  childProfiles: [
    {
      id: "child-1",
      parent_id: "user-parent-1",
      name: "Child",
      user_id: "user-child-1",
    },
  ],
  chores: [],
  checkIns: [],
  payouts: [],
  session: {
    currentUserId: null,
  },
};
