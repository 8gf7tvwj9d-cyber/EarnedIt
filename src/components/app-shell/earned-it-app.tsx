"use client";

import { useEffect, useRef, useState } from "react";
import { AppCrashBoundary } from "@/components/app-shell/app-crash-boundary";
import { cloneBundledDemoData, loadInitialAppData } from "@/components/app-shell/app-data-loader";
import { ChoreDebugState } from "@/components/chore-debug-panel";
import { ChildDashboard } from "@/components/child/child-dashboard";
import { ParentDashboard } from "@/components/parent/parent-dashboard";
import { AppIcon } from "@/components/ui-icons";
import {
  approveChore,
  commitSharedAppData,
  deleteChore,
  getChildProfileForUser,
  getCurrentUser,
  pullSharedAppDataSnapshot,
  markBalancePaid,
  rejectChore,
  resetAppData,
  saveChore,
  saveRoutineCheckIn,
  setCurrentUser,
  submitChore,
  submitRollingChore,
  writeAppData,
} from "@/lib/storage/app-state";
import { AppData, ChildProfile, ChoreDraft, User } from "@/types/app";

type Toast = {
  id: number;
  message: string;
};

type RoutineSaveResult = {
  ok: boolean;
  message: string;
  persisted: boolean;
  rawStoredCheckInsCount: number;
  filteredCheckInsCount: number;
  appData: AppData;
};

export function ChorePayApp() {
  const [appData, setAppData] = useState<AppData>(() => cloneBundledDemoData());
  const [hasLoadedStoredData, setHasLoadedStoredData] = useState(false);
  const [storageMode, setStorageMode] = useState<"local" | "supabase">("local");
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [routineDebugByChore, setRoutineDebugByChore] = useState<Record<string, ChoreDebugState>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const latestAppDataRef = useRef(appData);

  useEffect(() => {
    latestAppDataRef.current = appData;
  }, [appData]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const initialState = await loadInitialAppData();
      if (cancelled) {
        return;
      }

      setAppData(initialState.appData);
      setStorageMode(initialState.storageMode);
      setSyncWarning(initialState.syncWarning);
      setHasLoadedStoredData(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredData || storageMode !== "supabase") {
      return;
    }

    const timer = window.setInterval(async () => {
      const pulled = await pullSharedAppDataSnapshot(latestAppDataRef.current);
      if (!pulled.ok) {
        setStorageMode("local");
        setSyncWarning("Shared sync unavailable. Using local-only data on this device.");
        return;
      }

      if (!pulled.appData) {
        return;
      }

      if (JSON.stringify(pulled.appData) !== JSON.stringify(latestAppDataRef.current)) {
        setAppData(pulled.appData);
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [hasLoadedStoredData, storageMode]);

  function pushToast(message: string) {
    const id = Date.now();
    setToasts((current) => [...current, { id, message }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2600);
  }

  function updateAppData(nextData: AppData) {
    setAppData(nextData);
    writeAppData(nextData);
  }

  async function syncAppData(nextData: AppData) {
    const { appData: refreshed, ok, storageMode: mode } = await commitSharedAppData(nextData);
    console.log("[Earned] parent/child state refreshed", {
      chores: refreshed.chores.length,
      checkIns: refreshed.checkIns.length,
      persisted: ok,
      mode,
    });
    setAppData(refreshed);
    setStorageMode(mode);
    setSyncWarning(
      mode === "supabase"
        ? null
        : "Shared sync unavailable. Using local-only data on this device.",
    );
    return { refreshed, ok, mode };
  }

  function signInAs(role: "parent" | "child") {
    if (!appData) {
      return;
    }

    const user = appData.users.find((candidate) => candidate.role === role);
    if (!user) {
      return;
    }

    updateAppData(setCurrentUser(appData, user.id));
    pushToast(`Signed in as ${user.name}`);
  }

  function handleFatalReset() {
    let fresh: AppData;
    try {
      fresh = resetAppData();
    } catch (error) {
      console.warn("[Earned] Fatal reset fell back to bundled demo data.", error);
      fresh = cloneBundledDemoData();
    }
    setRoutineDebugByChore({});
    setToasts([]);
    setAppData(fresh);
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  let currentUser: User | null = null;
  let childProfile: ChildProfile | null = null;
  let childChores = [] as AppData["chores"];
  let childPayouts = [] as AppData["payouts"];

  try {
    currentUser = getCurrentUser(appData);
    childProfile = getChildProfileForUser(appData.childProfiles ?? [], currentUser);
    const profileId = childProfile?.id ?? null;
    childChores = childProfile
      ? appData.chores.filter((chore) => chore.child_id === profileId)
      : [];
    childPayouts = childProfile
      ? appData.payouts.filter((payout) => payout.child_id === profileId)
      : [];
  } catch (error) {
    console.warn("[Earned] Top-level app derivation failed.", error);
    return (
      <main className="min-h-screen px-3 py-4 text-slate-900 sm:px-5 sm:py-6">
        <div className="mx-auto max-w-3xl">
          <div className="app-shell rounded-[38px] px-4 py-6 sm:px-6 sm:py-8">
            <div className="panel-soft rounded-[32px] p-6 sm:p-7">
              <h1 className="font-mono text-3xl font-black text-slate-900">
                EarnedIt needs a quick reset
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-700 sm:text-base">
                Saved local data is out of shape enough to block the first render. Resetting the
                demo store will restore the app without changing the code path again.
              </p>
              <button
                className="mt-5 rounded-full bg-[#5f8f43] px-5 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(48,35,18,0.16)]"
                onClick={handleFatalReset}
                type="button"
              >
                Reset local demo data
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <AppCrashBoundary onReset={handleFatalReset}>
      <main className="min-h-screen px-3 py-4 text-slate-900 sm:px-5 sm:py-6">
        <div className="mx-auto max-w-7xl">
          <div className="app-shell rounded-[38px] px-4 py-4 sm:px-6 sm:py-6">
          <header className="hero-mesh relative mb-6 overflow-hidden rounded-[34px] px-5 py-6 text-white sm:px-7 sm:py-7">
            <div className="hero-grid" />
            <div className="hero-glow" />
            <div className="hero-orb hero-orb-one" />
            <div className="hero-orb hero-orb-two" />
            <div className="hero-orb hero-orb-three" />

            <div className="relative flex flex-col gap-6">
              <div className="max-w-3xl">
                <h1 className="brand-wordmark mt-2 max-w-2xl font-black leading-none">
                  <span className="brand-wordmark-main">Earned</span>
                  <span className="brand-wordmark-accent">It</span>
                </h1>
                <p className="mt-4 max-w-2xl text-[0.92rem] leading-7 text-slate-200 sm:text-[0.98rem]">
                  EarnedIt turns family chores into visible growth, quick proof, and rewards that
                  feel earned.
                </p>
              </div>
            </div>

            <div className="relative mt-6 flex flex-wrap gap-2">
              <button
                className={`rounded-full px-4 py-2.5 text-sm font-black ${
                  currentUser?.role === "parent"
                    ? "hero-button-primary"
                    : "hero-button-secondary"
                }`}
                onClick={() => signInAs("parent")}
                type="button"
              >
                Parent view
              </button>
              <button
                className={`rounded-full px-4 py-2.5 text-sm font-black ${
                  currentUser?.role === "child"
                    ? "hero-button-primary"
                    : "hero-button-secondary"
                }`}
                onClick={() => signInAs("child")}
                type="button"
              >
                Child view
              </button>
              <button
                className="hero-button-secondary rounded-full px-4 py-2.5 text-sm font-black"
                onClick={() => {
                  void syncAppData(resetAppData());
                  pushToast("Demo data reset");
                }}
                type="button"
              >
                Reset demo data
              </button>
            </div>
            {syncWarning ? (
              <p className="relative mt-3 text-sm font-bold text-[#ffe8be]">{syncWarning}</p>
            ) : (
              <p className="relative mt-3 text-sm font-bold text-[#d7efc4]">
                Shared demo household sync is active.
              </p>
            )}
          </header>

          {!currentUser ? (
            <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
              <div className="panel-strong mode-frame rounded-[32px] p-6 text-white sm:p-7">
                <div className="section-kicker kicker-row">
                  <span className="kicker-icon">
                    <AppIcon className="h-4 w-4" name="sprout" />
                  </span>
                  Pick a role
                </div>
                <h2 className="mt-3 max-w-lg font-mono text-3xl font-black">
                  Tend the habit garden from both sides.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-slate-200 sm:text-base">
                  Parent mode plants the routine and approves the harvest. Child mode keeps
                  each habit watered with proof and steady progress.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    className="metric-card metric-card-premium rounded-[28px] bg-white px-5 py-5 text-left text-slate-900"
                    onClick={() => signInAs("parent")}
                    type="button"
                  >
                    <span className="kicker-row text-slate-500">
                      <span className="kicker-icon">
                        <AppIcon className="h-4 w-4" name="seed" />
                      </span>
                      Parent
                    </span>
                    <span className="mt-3 block text-2xl font-black">Plant routines</span>
                    <span className="mt-2 block text-sm leading-6 text-slate-600">
                      Set rewards, review proof, and help routines take root.
                    </span>
                  </button>

                  <button
                    className="metric-card metric-card-premium success-pulse rounded-[28px] bg-gradient-to-br from-[#e2f3d9] via-[#f6efd9] to-[#fff8df] px-5 py-5 text-left text-slate-950"
                    onClick={() => signInAs("child")}
                    type="button"
                  >
                    <span className="kicker-row text-slate-500">
                      <span className="kicker-icon">
                        <AppIcon className="h-4 w-4" name="sprout" />
                      </span>
                      Child
                    </span>
                    <span className="mt-3 block text-2xl font-black">Grow rewards</span>
                    <span className="mt-2 block text-sm leading-6 text-slate-700">
                      Finish chores, snap proof, and watch your little garden of rewards grow.
                    </span>
                  </button>
                </div>
              </div>

              <div className="panel-soft rounded-[32px] p-6 sm:p-7">
                <div className="kicker-row text-slate-500">
                  <span className="kicker-icon">
                    <AppIcon className="h-4 w-4" name="leaf" />
                  </span>
                  Why it feels better
                </div>
                <h2 className="mt-3 font-mono text-3xl font-black text-slate-900">
                  Built for routines that need sunlight, not spreadsheets.
                </h2>
                <div className="mt-5 grid gap-3">
                  <FeatureCard
                    accent="from-[#f7ead4] via-[#fff5ea] to-[#fffdf8]"
                    copy="Every chore moves through obvious growth stages, so nobody wonders what happened next."
                    icon="check"
                    title="Clear growth stages"
                  />
                  <FeatureCard
                    accent="from-[#e4efd8] via-[#f6f1df] to-[#fff8e6]"
                    copy="Taking photos and checking progress feels like tending a tiny garden from your phone."
                    icon="sprout"
                    title="Water it anywhere"
                  />
                  <FeatureCard
                    accent="from-[#f2e7c5] via-[#f9f1dd] to-[#fffaf0]"
                    copy="Earned tracks the harvest without pretending to replace how families actually pay each other."
                    icon="seed"
                    title="Harvest stays simple"
                  />
                </div>
              </div>
            </section>
          ) : currentUser.role === "parent" ? (
            <ParentDashboard
              checkIns={appData.checkIns}
              childProfiles={appData.childProfiles.filter(
                (profile) => profile.parent_id === currentUser.id,
              )}
              chores={appData.chores.filter((chore) => chore.parent_id === currentUser.id)}
              currentUser={currentUser}
              payouts={appData.payouts.filter((payout) => payout.parent_id === currentUser.id)}
              rawStoredCheckInsCount={appData.checkIns.length}
              routineDebugByChore={routineDebugByChore}
              onApprove={(choreId) => {
                void syncAppData(approveChore(appData, choreId));
                pushToast("Chore approved");
              }}
              onDeleteChore={(choreId) => {
                void syncAppData(deleteChore(appData, choreId));
                pushToast("Chore deleted");
              }}
              onMarkPaid={(childId, notes) => {
                const before = appData.payouts.length;
                const next = markBalancePaid(appData, currentUser.id, childId, notes);
                void syncAppData(next);
                pushToast(
                  next.payouts.length > before
                    ? "Harvest marked as paid"
                    : "No approved harvest ready yet",
                );
              }}
              onReject={(choreId, note) => {
                void syncAppData(rejectChore(appData, choreId, note));
                pushToast("Chore rejected");
              }}
              onSaveChore={(draft: ChoreDraft) => {
                void syncAppData(saveChore(appData, currentUser, draft));
                pushToast(draft.id ? "Chore updated" : "Chore created");
              }}
            />
          ) : childProfile ? (
            <ChildDashboard
              childProfile={childProfile}
              checkIns={appData.checkIns.filter((entry) => entry.child_id === childProfile.id)}
              chores={childChores}
              currentUser={currentUser}
              payouts={childPayouts}
              rawStoredCheckInsCount={appData.checkIns.length}
              routineDebugByChore={routineDebugByChore}
              onAddRollingProof={async (choreId, photoUrl): Promise<RoutineSaveResult> => {
                const result = saveRoutineCheckIn(appData, choreId, photoUrl) as RoutineSaveResult;
                let persisted = result.persisted;

                if (result.ok) {
                  const syncResult = await syncAppData(result.appData);
                  persisted = syncResult.ok;
                }

                setRoutineDebugByChore((current) => ({
                  ...current,
                  [choreId]: {
                    filteredCheckInsCount: result.filteredCheckInsCount,
                    message: result.message,
                    persisted,
                    rawStoredCheckInsCount: result.rawStoredCheckInsCount,
                  },
                }));
                if (result.ok) {
                  pushToast(result.message);
                }
                return result;
              }}
              onSubmitChore={(choreId, photoUrl) => {
                void syncAppData(submitChore(appData, choreId, photoUrl));
                pushToast("Chore submitted for review");
              }}
              onSubmitRollingChore={(choreId) => {
                void syncAppData(submitRollingChore(appData, choreId));
                pushToast("Routine chore submitted for review");
              }}
            />
          ) : (
            <div className="glass-card rounded-[28px] p-6 text-slate-600">
              This child account is not linked to a child profile yet.
            </div>
          )}
        </div>

          <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className="toast-card w-full max-w-sm rounded-[20px] px-4 py-3 text-center text-sm font-bold text-white"
              >
                {toast.message}
              </div>
            ))}
          </div>
        </div>
      </main>
    </AppCrashBoundary>
  );
}

function FeatureCard({
  accent,
  icon,
  title,
  copy,
}: {
  accent: string;
  icon: "seed" | "camera" | "check" | "sprout";
  title: string;
  copy: string;
}) {
  return (
    <div
      className={`card-spotlight rounded-[24px] border border-white/70 bg-gradient-to-br ${accent} p-4 shadow-[0_18px_32px_rgba(20,33,61,0.08)]`}
    >
      <div className="kicker-row text-slate-500">
        <span className="kicker-icon">
          <AppIcon className="h-4 w-4" name={icon} />
        </span>
        Highlight
      </div>
      <p className="mt-3 font-black text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-700">{copy}</p>
    </div>
  );
}
