import { getAuthBootstrapState } from "@/lib/data/app-repository";
export { isEarnedItAuthTestModeEnabled } from "@/lib/auth-test-mode";
import { AppData, ChildProfile, Profile } from "@/types/app";

export type ParentSignupDraft = {
  email: string;
  password: string;
  householdName: string;
  displayName: string;
};

export type ParentLoginDraft = {
  email: string;
  password: string;
};

export function createEmptyParentSignupDraft(): ParentSignupDraft {
  return {
    email: "",
    password: "",
    householdName: "",
    displayName: "",
  };
}

export function createEmptyParentLoginDraft(): ParentLoginDraft {
  return {
    email: "",
    password: "",
  };
}

export function getParentProfile(appData: AppData): Profile | null {
  return appData.profiles.find((profile) => profile.role === "parent") ?? null;
}

export function getChildRecords(appData: AppData): ChildProfile[] {
  return appData.childProfiles;
}

export function getAuthFoundationState() {
  return getAuthBootstrapState();
}
