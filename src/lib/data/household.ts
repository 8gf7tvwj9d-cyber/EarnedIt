import { AppData, ChildProfile, Chore, Household, Payout, Profile, User } from "@/types/app";

const FALLBACK_HOUSEHOLD_ID = "family-household-1";

export type HouseholdScopedRecord = {
  household_id: string;
};

export function getHouseholdId(appData: AppData) {
  return (
    appData.session.currentHouseholdId ??
    appData.households[0]?.id ??
    appData.users[0]?.household_id ??
    FALLBACK_HOUSEHOLD_ID
  );
}

export function filterByHouseholdId<T extends HouseholdScopedRecord>(
  records: T[],
  householdId: string,
) {
  return records.filter((record) => record.household_id === householdId);
}

export function getHouseholdRecord(appData: AppData, householdId = getHouseholdId(appData)): Household | null {
  return appData.households.find((household) => household.id === householdId) ?? null;
}

export function getHouseholdProfiles(appData: AppData, householdId = getHouseholdId(appData)): Profile[] {
  return filterByHouseholdId(appData.profiles, householdId);
}

export function getHouseholdUsers(appData: AppData, householdId = getHouseholdId(appData)): User[] {
  return filterByHouseholdId(appData.users, householdId);
}

export function getHouseholdChildren(
  appData: AppData,
  householdId = getHouseholdId(appData),
): ChildProfile[] {
  return filterByHouseholdId(appData.childProfiles, householdId);
}

export function getHouseholdChores(appData: AppData, householdId = getHouseholdId(appData)): Chore[] {
  return filterByHouseholdId(appData.chores, householdId);
}

export function getHouseholdPayments(appData: AppData, householdId = getHouseholdId(appData)): Payout[] {
  return filterByHouseholdId(appData.payouts, householdId);
}

export function assertHouseholdAccess(recordHouseholdId: string, householdId: string) {
  return recordHouseholdId === householdId;
}
