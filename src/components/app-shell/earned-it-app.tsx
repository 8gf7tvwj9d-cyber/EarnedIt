"use client";

import { useEffect, useRef, useState } from "react";
import { AppCrashBoundary } from "@/components/app-shell/app-crash-boundary";
import { cloneBundledDemoData, loadInitialAppData } from "@/components/app-shell/app-data-loader";
import { ParentAuthShell } from "@/components/auth/parent-auth-shell";
import { ChildDashboard } from "@/components/child/child-dashboard";
import { ParentDashboard } from "@/components/parent/parent-dashboard";
import { AppIcon } from "@/components/ui-icons";
import {
  approveChore,
  clearCompletedTestData,
  completeChore,
  completeRoutineCheckIn,
  createChildRecord,
  createChore,
  deleteChore,
  getAuthBootstrapState,
  getChildren,
  getChores,
  getHousehold,
  getPayments,
  markChorePaid,
  overrideMissedStreak,
  persistLocalAppData,
  pullAppDataSnapshot,
  rejectChore,
  resetLocalAppData,
  setActiveUser,
  signInParent,
  signOutParent,
  signUpParentWithHousehold,
  submitRoutineForApproval,
  syncAppData as syncRepositoryAppData,
} from "@/lib/data/app-repository";
import type { ParentLoginDraft, ParentSignupDraft } from "@/lib/auth/auth-foundation";
import { getChildProfileForUser, getCurrentUser } from "@/lib/storage/app-state";
import { AppData, ChildProfile, ChoreDraft, PaymentLineItem, User } from "@/types/app";

type Toast = {
  id: number;
  message: string;
};

type RoutineSaveResult = {
  ok: boolean;
  message: string;
  appData: AppData;
};

export function EarnedItApp() {
  const [appData, setAppData] = useState<AppData>(() => cloneBundledDemoData());
  const [hasLoadedStoredData, setHasLoadedStoredData] = useState(false);
  const [storageMode, setStorageMode] = useState<"local" | "supabase">("local");
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const latestAppDataRef = useRef(appData);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const parentSignupInFlightRef = useRef(false);
  const parentSignupAttemptRef = useRef(0);
  const parentLoginInFlightRef = useRef(false);
  const authBootstrap = getAuthBootstrapState();

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

      if (initialState.shouldPersist) {
        persistLocalAppData(initialState.appData);
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
      const pulled = await pullAppDataSnapshot(latestAppDataRef.current);
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
    latestAppDataRef.current = nextData;
    setAppData(nextData);
    persistLocalAppData(nextData);
  }

  async function syncAppData(nextData: AppData) {
    const { appData: refreshed, ok, storageMode: mode } = await syncRepositoryAppData(nextData);
    console.log("[Earned] parent/child state refreshed", {
      chores: refreshed.chores.length,
      checkIns: refreshed.checkIns.length,
      persisted: ok,
      mode,
    });
    latestAppDataRef.current = refreshed;
    setAppData(refreshed);
    setStorageMode(mode);
    setSyncWarning(
      mode === "supabase"
        ? null
        : "Shared sync unavailable. Using local-only data on this device.",
    );
    return { refreshed, ok, mode };
  }

  function enqueueMutation(task: (snapshot: AppData) => Promise<void> | void) {
    mutationQueueRef.current = mutationQueueRef.current
      .then(async () => {
        await task(latestAppDataRef.current);
      })
      .catch((error) => {
        console.warn("[Earned] Queued mutation failed.", error);
      });
    return mutationQueueRef.current;
  }

  function signInAs(role: "parent" | "child") {
    if (!appData) {
      return;
    }

    const user = appData.users.find((candidate) => candidate.role === role);
    if (!user) {
      return;
    }

    updateAppData(setActiveUser(appData, user.id));
    pushToast(`Signed in as ${getRoleDisplayName(appData, role)}`);
  }

  async function handleParentSignup(draft: ParentSignupDraft) {
    if (parentSignupInFlightRef.current) {
      if (process.env.NODE_ENV === "development") {
        console.info("[Earned auth] Parent signup ignored because a signup request is already pending.");
      }
      return;
    }

    parentSignupInFlightRef.current = true;
    const attempt = parentSignupAttemptRef.current + 1;
    parentSignupAttemptRef.current = attempt;
    if (process.env.NODE_ENV === "development") {
      console.info("[Earned auth] Parent signup started.", { attempt });
    }

    setIsAuthSubmitting(true);
    try {
      const result = await signUpParentWithHousehold(draft, latestAppDataRef.current);
      setAuthMessage(result.message);
      setStorageMode(result.storageMode);
      if (result.ok) {
        latestAppDataRef.current = result.appData;
        setAppData(result.appData);
        setSyncWarning(null);
        pushToast(result.message);
      }
      if (process.env.NODE_ENV === "development") {
        console.info("[Earned auth] Parent signup finished.", {
          attempt,
          ok: result.ok,
          storageMode: result.storageMode,
        });
      }
    } catch (error) {
      console.warn("[Earned auth] Parent signup failed unexpectedly.", error);
      setAuthMessage("Parent signup hit an unexpected error. The app did not retry automatically.");
      if (process.env.NODE_ENV === "development") {
        console.info("[Earned auth] Parent signup finished.", {
          attempt,
          ok: false,
          storageMode,
        });
      }
    } finally {
      parentSignupInFlightRef.current = false;
      setIsAuthSubmitting(false);
    }
  }

  async function handleParentLogin(draft: ParentLoginDraft) {
    if (parentLoginInFlightRef.current) {
      if (process.env.NODE_ENV === "development") {
        console.info("[Earned auth] Parent login ignored because a login request is already pending.");
      }
      return;
    }

    parentLoginInFlightRef.current = true;
    setIsAuthSubmitting(true);
    try {
      const result = await signInParent(draft, latestAppDataRef.current);
      setAuthMessage(result.message);
      setStorageMode(result.storageMode);
      if (result.ok) {
        latestAppDataRef.current = result.appData;
        setAppData(result.appData);
        setSyncWarning(null);
        pushToast(result.message);
      }
    } finally {
      parentLoginInFlightRef.current = false;
      setIsAuthSubmitting(false);
    }
  }

  async function handleParentSignOut() {
    const result = await signOutParent(latestAppDataRef.current);
    setAuthMessage(result.message);
    setStorageMode(result.storageMode);
    latestAppDataRef.current = result.appData;
    setAppData(result.appData);
    setSyncWarning(result.ok ? "Sign in to load your household." : syncWarning);
    if (result.ok) {
      pushToast(result.message);
    }
  }

  function handleFatalReset() {
    let fresh: AppData;
    try {
      fresh = resetLocalAppData();
    } catch (error) {
      console.warn("[Earned] Fatal reset fell back to bundled starter data.", error);
      fresh = cloneBundledDemoData();
    }
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
  let householdName: string | null = null;

  try {
    currentUser = getCurrentUser(appData);
    childProfile = getChildProfileForUser(appData.childProfiles ?? [], currentUser);
    const profileId = childProfile?.id ?? null;
    childChores = childProfile
      ? getChores(appData).filter((chore) => chore.child_id === profileId)
      : [];
    childPayouts = childProfile
      ? getPayments(appData).filter((payout) => payout.child_id === profileId)
      : [];
    householdName = getHousehold(appData)?.name ?? null;
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
                Saved local data is out of shape enough to block the first render. Resetting local
                data will restore the app without changing the code path again.
              </p>
              <button
                className="mt-5 rounded-full bg-[#5f8f43] px-5 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(48,35,18,0.16)]"
                onClick={handleFatalReset}
                type="button"
              >
                Reset local data
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
              {appData.session.authMode === "supabase" && appData.session.authUserId ? (
                <>
                  <button
                    className={`rounded-full px-4 py-2.5 text-sm font-black ${
                      currentUser?.role === "parent"
                        ? "hero-button-primary"
                        : "hero-button-secondary"
                    }`}
                    onClick={() => signInAs("parent")}
                    type="button"
                  >
                    {getRoleDisplayName(appData, "parent")} (Parent)
                  </button>
                  {getChildren(appData).length > 0 ? (
                    <button
                      className={`rounded-full px-4 py-2.5 text-sm font-black ${
                        currentUser?.role === "child"
                          ? "hero-button-primary"
                          : "hero-button-secondary"
                      }`}
                      onClick={() => signInAs("child")}
                      type="button"
                    >
                      Preview Child
                    </button>
                  ) : null}
                  <button
                    className="hero-button-secondary rounded-full px-4 py-2.5 text-sm font-black"
                    onClick={() => void handleParentSignOut()}
                    type="button"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`rounded-full px-4 py-2.5 text-sm font-black ${
                      currentUser?.role === "parent"
                        ? "hero-button-primary"
                        : "hero-button-secondary"
                    }`}
                    onClick={() => signInAs("parent")}
                    type="button"
                  >
                    {getRoleDisplayName(appData, "parent")} (Parent)
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
                    {getRoleDisplayName(appData, "child")} (Child)
                  </button>
                </>
              )}
            </div>
            {syncWarning ? (
              <p className="relative mt-3 text-sm font-bold text-[#ffe8be]">{syncWarning}</p>
            ) : (
              <p className="relative mt-3 text-sm font-bold text-[#d7efc4]">
                Shared family sync is active.
              </p>
            )}
          </header>

          {!currentUser && appData.session.authMode === "supabase" ? (
            <ParentAuthShell
              authMessage={authMessage}
              authWarning={authBootstrap.setupWarning}
              isSubmitting={isAuthSubmitting}
              onLogin={handleParentLogin}
              onSignup={handleParentSignup}
            />
          ) : !currentUser ? (
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
                  Parent mode sets routines, reviews submissions, and records payments. Child
                  mode keeps each habit moving with proof and steady progress.
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
                      {getRoleDisplayName(appData, "parent")}
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
                      {getRoleDisplayName(appData, "child")}
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
                    copy="Earned tracks payments without pretending to replace how families actually pay each other."
                    icon="seed"
                    title="Payments stay simple"
                  />
                </div>
              </div>
            </section>
          ) : currentUser.role === "parent" ? (
            <ParentDashboard
              authMode={appData.session.authMode}
              currentUser={currentUser}
              checkIns={appData.checkIns}
              childProfiles={getChildren(appData).filter(
                (profile) => profile.parent_id === currentUser.id,
              )}
              chores={getChores(appData).filter((chore) => chore.parent_id === currentUser.id)}
              householdName={householdName}
              payouts={getPayments(appData).filter((payout) => payout.parent_id === currentUser.id)}
              onCreateChild={async (name) => {
                const result = await createChildRecord(name, latestAppDataRef.current);
                if (result.ok) {
                  latestAppDataRef.current = result.appData;
                  setAppData(result.appData);
                  pushToast(result.message);
                }
                return {
                  ok: result.ok,
                  message: result.message,
                };
              }}
              onApprove={(choreId) => {
                void enqueueMutation(async (snapshot) => {
                  await syncAppData(approveChore(snapshot, choreId));
                  pushToast("Chore approved");
                });
              }}
              onDeleteChore={(choreId) => {
                void enqueueMutation(async (snapshot) => {
                  await syncAppData(deleteChore(snapshot, choreId));
                  pushToast("Chore deleted");
                });
              }}
              onClearCompletedTestData={() => {
                void enqueueMutation(async (snapshot) => {
                  const next = clearCompletedTestData(snapshot);
                  await syncAppData(next);
                  pushToast("Test progress cleared");
                });
              }}
              onOverrideMissedStreak={(choreId, missedDate, note) => {
                void enqueueMutation(async (snapshot) => {
                  await syncAppData(overrideMissedStreak(snapshot, choreId, missedDate, note, currentUser));
                  pushToast("Missed streak excused");
                });
              }}
              onMarkPaid={(childId, notes, paymentItems?: PaymentLineItem[]) => {
                void enqueueMutation(async (snapshot) => {
                  const before = snapshot.payouts.length;
                  const next = markChorePaid(snapshot, currentUser.id, childId, notes, paymentItems);
                  await syncAppData(next);
                  pushToast(
                    next.payouts.length > before
                      ? "Payment recorded"
                      : "No approved rewards ready for payment",
                  );
                });
              }}
              onReject={(choreId, note) => {
                void enqueueMutation(async (snapshot) => {
                  await syncAppData(rejectChore(snapshot, choreId, note));
                  pushToast("Chore rejected");
                });
              }}
              onSaveChore={(draft: ChoreDraft) => {
                void enqueueMutation(async (snapshot) => {
                  await syncAppData(createChore(snapshot, currentUser, draft));
                  pushToast(draft.id ? "Chore updated" : "Chore created");
                });
              }}
            />
          ) : childProfile ? (
            <ChildDashboard
              childProfile={childProfile}
              checkIns={appData.checkIns.filter((entry) => entry.child_id === childProfile.id)}
              chores={childChores}
              payouts={childPayouts}
              onAddRollingProof={async (choreId, photos): Promise<RoutineSaveResult> => {
                let result: RoutineSaveResult = {
                  ok: false,
                  message: "Could not save check-in.",
                  appData: latestAppDataRef.current,
                };
                await enqueueMutation(async (snapshot) => {
                  result = completeRoutineCheckIn(snapshot, choreId, photos) as RoutineSaveResult;
                  if (result.ok) {
                    await syncAppData(result.appData);
                    pushToast(result.message);
                  }
                });
                return result;
              }}
              onSubmitChore={(choreId, photos) => {
                void enqueueMutation(async (snapshot) => {
                  await syncAppData(completeChore(snapshot, choreId, photos));
                  pushToast("Chore submitted for review");
                });
              }}
              onSubmitRollingChore={(choreId) => {
                void enqueueMutation(async (snapshot) => {
                  await syncAppData(submitRoutineForApproval(snapshot, choreId));
                  pushToast("Repeating chore submitted for review");
                });
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

function getRoleDisplayName(appData: AppData, role: "parent" | "child") {
  const user = appData.users.find((candidate) => candidate.role === role);
  if (user?.name?.trim()) {
    return user.name.trim();
  }

  if (role === "child") {
    const childProfileName = appData.childProfiles[0]?.name?.trim();
    return childProfileName || "Child";
  }

  return "Parent";
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

