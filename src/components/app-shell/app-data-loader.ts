import {
  loadAppData,
  type SharedAppDataInitialization,
} from "@/lib/data/app-repository";
import { demoData } from "@/lib/storage/demo-data";
import { AppData } from "@/types/app";

export function cloneBundledDemoData() {
  return JSON.parse(JSON.stringify(demoData)) as AppData;
}

export async function loadInitialAppData(): Promise<SharedAppDataInitialization> {
  try {
    return await loadAppData();
  } catch (error) {
    console.warn("[Earned] Initial app load failed. Preserving saved beta data.", error);
    return {
      appData: cloneBundledDemoData(),
      shouldPersist: false,
      storageMode: "local",
      syncWarning:
        "Saved beta data was not changed, but the app could not load it. Check the console before using reset.",
    };
  }
}
