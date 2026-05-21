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
  regenerateChildDeviceLink,
  setActiveUser,
  signInChildWithDeviceLink,
  signInParent,
  signOutParent,
  signUpParentWithHousehold,
  submitRoutineForApproval,
  syncAppData as syncRepositoryAppData,
} from "@/lib/data/app-repository";
import type {
  AuthFlowState,
  ParentLoginDraft,
  ParentSignupDraft,
} from "@/lib/auth/auth-foundation";
import { getChildProfileForUser, getCurrentUser } from "@/lib/storage/app-state";
import { AppData, ChildProfile, ChoreDraft, PaymentLineItem, Profile, User } from "@/types/app";

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
  const [authState, setAuthState] = useState<AuthFlowState>("signed_out");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const latestAppDataRef = useRef(appData);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const parentSignupInFlightRef = useRef(false);
  const parentSignupAttemptRef = useRef(0);
  const parentLoginInFlightRef = useRef(false);
  const childDeviceLinkInFlightRef = useRef(false);
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
      setAuthState(
        initialState.appData.session.authMode === "supabase" &&
          initialState.appData.session.authUserId
          ? "ready"
          : "signed_out",
      );
      setHasLoadedStoredData(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredData || typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const childLinkToken = params.get("childLink");
    if (!childLinkToken || childDeviceLinkInFlightRef.current) {
      return;
    }

    childDeviceLinkInFlightRef.current = true;
    void (async () => {
      try {
        const result = await signInChildWithDeviceLink(
          childLinkToken,
          latestAppDataRef.current,
        );
        setAuthMessage(result.message);
        setAuthState(result.authState);
        setStorageMode(result.storageMode);
        if (result.ok) {
          latestAppDataRef.current = result.appData;
          setAppData(result.appData);
          setSyncWarning(null);
          pushToast(result.message);
        }
      } finally {
        params.delete("childLink");
        const nextSearch = params.toString();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`,
        );
        childDeviceLinkInFlightRef.current = false;
      }
    })();
  }, [hasLoadedStoredData]);

  useEffect(() => {
    if (!hasLoadedStoredData || storageMode !== "supabase") {
      return;
    }

    const activeUser = latestAppDataRef.current.users.find(
      (user) => user.id === latestAppDataRef.current.session.currentUserId,
    );
    if (activeUser?.role === "child") {
      return;
    }

    const timer = window.setInterval(async () => {
      const sessionUser = latestAppDataRef.current.users.find(
        (user) => user.id === latestAppDataRef.current.session.currentUserId,
      );
      if (sessionUser?.role === "child") {
        return;
      }

      const pulled = await pullAppDataSnapshot(latestAppDataRef.current);
      if (!pulled.ok) {
        setStorageMode(pulled.storageMode);
        setSyncWarning(
          pulled.message ?? "Shared sync unavailable. Fix Supabase before continuing beta sync.",
        );
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
  }, [appData.session.currentUserId, hasLoadedStoredData, storageMode]);

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
    const {
      appData: refreshed,
      message,
      ok,
      storageMode: mode,
    } = await syncRepositoryAppData(nextData);
    console.log("[Earned] parent/child state refreshed", {
      chores: refreshed.chores.length,
      checkIns: refreshed.checkIns.length,
      persisted: ok,
      mode,
    });
    latestAppDataRef.current = refreshed;
    setAppData(refreshed);
    setStorageMode(mode);
    setSyncWarning(ok && mode === "supabase" ? null : message ?? "Shared sync unavailable.");
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
    setAuthState("signing_up");
    try {
      const result = await signUpParentWithHousehold(draft, latestAppDataRef.current);
      setAuthMessage(result.message);
      setAuthState(result.authState);
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
      setAuthState("auth_error");
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
    setAuthState("signing_in");
    try {
      const result = await signInParent(draft, latestAppDataRef.current);
      setAuthMessage(result.message);
      setAuthState(result.authState);
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
    if (latestAppDataRef.current.session.authMode !== "supabase") {
      const signedOut = setActiveUser(latestAppDataRef.current, null);
      updateAppData(signedOut);
      setAuthState("signed_out");
      setAuthMessage("Signed out.");
      setIsAccountOpen(false);
      pushToast("Signed out.");
      return;
    }

    const result = await signOutParent(latestAppDataRef.current);
    setAuthMessage(result.message);
    setAuthState(result.authState);
    setStorageMode(result.storageMode);
    latestAppDataRef.current = result.appData;
    setAppData(result.appData);
    setSyncWarning(result.ok ? "Sign in to load your household." : syncWarning);
    if (result.ok) {
      setIsAccountOpen(false);
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
  let parentProfile: Profile | null = null;
  let householdChildren: ChildProfile[] = [];

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
    parentProfile = appData.profiles.find((profile) => profile.role === "parent") ?? null;
    householdChildren = getChildren(appData);
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
              {currentUser?.role === "child" ? (
                <button
                  className="hero-button-secondary rounded-full px-4 py-2.5 text-sm font-black"
                  onClick={() => void handleParentSignOut()}
                  type="button"
                >
                  Sign out
                </button>
              ) : appData.session.authMode === "supabase" && appData.session.authUserId ? (
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
                  {currentUser?.role === "parent" ? (
                    <button
                      className="hero-button-secondary rounded-full px-4 py-2.5 text-sm font-black"
                      onClick={() => setIsAccountOpen(true)}
                      type="button"
                    >
                      Account
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
                    className="hero-button-secondary rounded-full px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-55"
                    onClick={() => signInAs("child")}
                    disabled={householdChildren.length === 0}
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
              authState={authState}
              authWarning={authBootstrap.setupWarning}
              childLoginEnabled={householdChildren.length > 0}
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
                    className="metric-card metric-card-premium success-pulse rounded-[28px] bg-gradient-to-br from-[#e2f3d9] via-[#f6efd9] to-[#fff8df] px-5 py-5 text-left text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={householdChildren.length === 0}
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
                      {householdChildren.length === 0
                        ? "Create a child profile to start assigning chores."
                        : "Finish chores, snap proof, and watch your little garden of rewards grow."}
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
              checkIns={appData.checkIns}
              childProfiles={getChildren(appData).filter(
                (profile) => profile.parent_id === currentUser.id,
              )}
              chores={getChores(appData).filter((chore) => chore.parent_id === currentUser.id)}
              householdName={householdName}
              payouts={getPayments(appData).filter((payout) => payout.parent_id === currentUser.id)}
              onCreateChild={async (draft) => {
                const result = await createChildRecord(draft, latestAppDataRef.current);
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
              onRegenerateChildLink={async (childId) => {
                const result = await regenerateChildDeviceLink(childId, latestAppDataRef.current);
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
              This child account is not linked to a child profile yet. Sign out and ask a parent
              to create or update the child profile.
            </div>
          )}
          {isAccountOpen && currentUser?.role === "parent" ? (
            <AccountPanel
              childProfiles={householdChildren}
              currentUser={currentUser}
              householdName={householdName}
              parentProfile={parentProfile}
              onClose={() => setIsAccountOpen(false)}
            />
          ) : null}
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
    return childProfileName || "Child login";
  }

  return "Parent";
}

function AccountPanel({
  childProfiles,
  currentUser,
  householdName,
  parentProfile,
  onClose,
}: {
  childProfiles: ChildProfile[];
  currentUser: User;
  householdName: string | null;
  parentProfile: Profile | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1e1a13]/48 px-3 py-4 backdrop-blur-sm sm:items-center">
      <section className="w-full max-w-xl overflow-hidden rounded-[30px] bg-[#fffaf0] shadow-[0_28px_80px_rgba(25,20,12,0.38)]">
        <div className="payment-sheet-header px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="section-kicker kicker-row">
                <span className="kicker-icon">
                  <AppIcon className="h-4 w-4" name="seed" />
                </span>
                Account
              </div>
              <h3 className="mt-3 font-mono text-2xl font-black">
                {householdName?.trim() || "Household details"}
              </h3>
            </div>
            <button
              className="hero-button-secondary rounded-full px-3 py-2 text-xs font-black"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          <InfoRow label="Account name" value={currentUser.name || "Parent"} />
          <InfoRow label="Email" value={currentUser.email || "No email on file"} />
          <InfoRow label="Household name" value={householdName?.trim() || "Household"} />
          <InfoRow
            label="Parent profile"
            value={parentProfile?.display_name?.trim() || currentUser.name || "Parent"}
          />
          <div className="rounded-[22px] border border-[#d9c075]/50 bg-white px-4 py-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6d5a2d]">
              Child profiles
            </p>
            {childProfiles.length === 0 ? (
              <p className="mt-2 text-sm font-bold text-slate-600">
                No child profiles yet.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {childProfiles.map((child) => (
                  <span className="stat-chip stat-chip-soft" key={child.id}>
                    {child.name.trim() || "child profile"}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[#d9c075]/50 bg-white px-4 py-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6d5a2d]">{label}</p>
      <p className="mt-1 font-black text-slate-950">{value}</p>
    </div>
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

