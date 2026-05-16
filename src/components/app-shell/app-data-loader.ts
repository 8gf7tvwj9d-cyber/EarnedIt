import {
  initializeSharedAppData,
  resetAppData,
  type SharedAppDataInitialization,
} from "@/lib/storage/app-state";
import { demoData } from "@/lib/storage/demo-data";
import { AppData } from "@/types/app";

export function cloneBundledDemoData() {
  return JSON.parse(JSON.stringify(demoData)) as AppData;
}

export async function loadInitialAppData(): Promise<SharedAppDataInitialization> {
  try {
    return await initializeSharedAppData();
  } catch (error) {
    console.warn("[Earned] Initial app load failed, resetting demo data.", error);
    try {
      return {
        appData: resetAppData(),
        shouldPersist: false,
        storageMode: "local",
        syncWarning: "Shared sync unavailable. Using local-only data on this device.",
      };
    } catch (resetError) {
      console.warn("[Earned] Demo data reset also failed.", resetError);
      return {
        appData: cloneBundledDemoData(),
        shouldPersist: true,
        storageMode: "local",
        syncWarning: "Shared sync unavailable. Using local-only data on this device.",
      };
    }
  }
}
