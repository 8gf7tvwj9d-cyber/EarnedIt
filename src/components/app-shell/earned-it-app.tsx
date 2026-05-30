"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { AppCrashBoundary } from "@/components/app-shell/app-crash-boundary";
import { cloneBundledDemoData, loadInitialAppData } from "@/components/app-shell/app-data-loader";
import { ParentAuthShell } from "@/components/auth/parent-auth-shell";
import { ChildDashboard } from "@/components/child/child-dashboard";
import { ParentDashboard } from "@/components/parent/parent-dashboard";
import { AppIcon } from "@/components/ui-icons";
import {
  BrowserNotificationStatus,
  getBrowserNotificationStatus,
  requestBrowserNotificationPermission,
  sendBrowserNotification,
} from "@/lib/browser-notifications";
import { debugLog } from "@/lib/debug";
import {
  approveChore,
  clearCompletedTestData,
  completeChore,
  completeRoutineCheckIn,
  createChildRecord,
  createChore,
  deleteChildRecord,
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
  recordParentRoutineCheckIn,
  rejectChore,
  resetLocalAppData,
  regenerateChildDeviceLink,
  signInChildWithDeviceLink,
  signInParent,
  signOutParent,
  signUpParentWithHousehold,
  submitRoutineForApproval,
  syncAppData as syncRepositoryAppData,
  updateAccountProfile,
  updateChildRecord,
} from "@/lib/data/app-repository";
import type {
  AuthFlowState,
  ParentLoginDraft,
  ParentSignupDraft,
} from "@/lib/auth/auth-foundation";
import { getSupabaseBrowserClient, logSupabaseAuthDebug } from "@/lib/supabase";
import { getChildProfileForUser, getCurrentUser } from "@/lib/storage/app-state";
import { AppData, ChildProfile, ChoreDraft, PaymentLineItem, Profile, User } from "@/types/app";

type ChildProfileDraft = {
  age: string;
  gender: string;
  name: string;
};

type Toast = {
  id: number;
  message: string;
};

type RoutineSaveResult = {
  ok: boolean;
  message: string;
  appData: AppData;
};

const DEFAULT_MANIFEST_HREF = "/static/manifest.json";
const CHILD_SIGNED_OUT_TOKEN_KEY = "earnedit-child-signed-out-tokens-v1";

export function EarnedItApp() {
  const [appData, setAppData] = useState<AppData>(() => cloneBundledDemoData());
  const [hasLoadedStoredData, setHasLoadedStoredData] = useState(false);
  const [storageMode, setStorageMode] = useState<"local" | "supabase">("local");
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthFlowState>("signed_out");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [notificationStatus, setNotificationStatus] =
    useState<BrowserNotificationStatus>("unsupported");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const latestAppDataRef = useRef(appData);
  const notificationBaselineRef = useRef<AppData | null>(null);
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
    const timer = window.setTimeout(() => {
      setNotificationStatus(getBrowserNotificationStatus());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

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
        initialState.appData.session.currentUserId ||
          (initialState.appData.session.authMode === "supabase" &&
            initialState.appData.session.authUserId)
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
    if (!hasLoadedStoredData || storageMode !== "supabase") {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      logSupabaseAuthDebug(event, {
        sessionExists: Boolean(session),
        userIdExists: Boolean(session?.user?.id),
      });

      if (event !== "SIGNED_IN" || !session?.user) {
        return;
      }

      window.setTimeout(() => {
        void (async () => {
          const initialState = await loadInitialAppData();
          if (initialState.shouldPersist) {
            persistLocalAppData(initialState.appData);
          }
          latestAppDataRef.current = initialState.appData;
          setAppData(initialState.appData);
          setStorageMode(initialState.storageMode);
          setSyncWarning(initialState.syncWarning);
          setAuthState(
            initialState.appData.session.currentUserId ||
              (initialState.appData.session.authMode === "supabase" &&
                initialState.appData.session.authUserId)
              ? "ready"
              : "signed_out",
          );
        })();
      }, 0);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [hasLoadedStoredData, storageMode]);

  useEffect(() => {
    if (!hasLoadedStoredData || typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const childLinkToken = params.get("token") ?? params.get("childLink");
    if (!childLinkToken || childDeviceLinkInFlightRef.current) {
      return;
    }

    if (
      isStandaloneAppLaunch() &&
      isChildTokenBlockedForStandalone(childLinkToken)
    ) {
      const timer = window.setTimeout(() => {
        setAuthMessage("Signed out on this device. Scan the QR code again in Safari to reconnect.");
        setAuthState("signed_out");
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (!isStandaloneAppLaunch()) {
      unblockChildTokenForStandalone(childLinkToken);
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
        // Next patches history during app-router hydration. Mutating the URL here can
        // dispatch a router action before initialization on the child-link route.
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

  let currentUser: User | null = null;
  let childProfile: ChildProfile | null = null;
  let childChores = [] as AppData["chores"];
  let childPayouts = [] as AppData["payouts"];
  let householdName: string | null = null;
  let parentProfile: Profile | null = null;
  let householdChildren: ChildProfile[] = [];
  let householdLoaded = false;
  let derivationError: unknown = null;

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
    householdLoaded = Boolean(getHousehold(appData));
  } catch (error) {
    derivationError = error;
  }

  useEffect(() => {
    if (currentUser?.role !== "child" || !childProfile?.access_token) {
      setManifestHref(DEFAULT_MANIFEST_HREF);
      return;
    }

    setManifestHref(
      `/child-manifest?token=${encodeURIComponent(childProfile.access_token)}`,
    );

    return () => setManifestHref(DEFAULT_MANIFEST_HREF);
  }, [childProfile?.access_token, currentUser?.role]);

  useEffect(() => {
    if (!hasLoadedStoredData || !currentUser) {
      notificationBaselineRef.current = appData;
      return;
    }

    const previous = notificationBaselineRef.current;
    notificationBaselineRef.current = appData;
    if (!previous || getBrowserNotificationStatus() !== "granted") {
      return;
    }

    getBrowserNotificationMessages(previous, appData, currentUser, childProfile).forEach(
      (notification) => {
        sendBrowserNotification(notification.title, notification.body, notification.tag);
      },
    );
  }, [appData, childProfile, currentUser, hasLoadedStoredData]);

  function pushToast(message: string) {
    const id = Date.now();
    setToasts((current) => [...current, { id, message }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2600);
  }

  async function handleEnableNotifications() {
    const nextStatus = await requestBrowserNotificationPermission();
    setNotificationStatus(nextStatus);
    if (nextStatus === "granted") {
      pushToast("Browser pings enabled while this app is open");
      return;
    }

    if (nextStatus === "needs-secure-origin") {
      pushToast("Phone pings need HTTPS or a supported installed app");
      return;
    }

    pushToast("Browser pings are not available here");
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
    debugLog("sync", "parent/child state refreshed", {
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
    const activeChildToken =
      currentUser?.role === "child" ? childProfile?.access_token ?? null : null;
    if (activeChildToken) {
      blockChildTokenForStandalone(activeChildToken);
    }

    if (latestAppDataRef.current.session.authMode !== "supabase") {
      const signedOut = {
        ...latestAppDataRef.current,
        session: {
          ...latestAppDataRef.current.session,
          currentUserId: null,
        },
      };
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

  async function handleCreateChildProfile(draft: ChildProfileDraft) {
    const result = await createChildRecord(draft, latestAppDataRef.current);
    if (result.ok) {
      latestAppDataRef.current = result.appData;
      setAppData(result.appData);
      setStorageMode(result.storageMode);
      pushToast(result.message);
    }
    return {
      ok: result.ok,
      message: result.message,
    };
  }

  async function handleUpdateChildProfile(childId: string, draft: ChildProfileDraft) {
    const result = await updateChildRecord(childId, draft, latestAppDataRef.current);
    if (result.ok) {
      latestAppDataRef.current = result.appData;
      setAppData(result.appData);
      setStorageMode(result.storageMode);
      pushToast(result.message);
    }
    return {
      ok: result.ok,
      message: result.message,
    };
  }

  async function handleDeleteChildProfile(childId: string) {
    const result = await deleteChildRecord(childId, latestAppDataRef.current);
    if (result.ok) {
      latestAppDataRef.current = result.appData;
      setAppData(result.appData);
      setStorageMode(result.storageMode);
      pushToast(result.message);
    }
    return {
      ok: result.ok,
      message: result.message,
    };
  }

  async function handleRegenerateChildLink(childId: string) {
    const result = await regenerateChildDeviceLink(childId, latestAppDataRef.current);
    if (result.ok) {
      latestAppDataRef.current = result.appData;
      setAppData(result.appData);
      setStorageMode(result.storageMode);
      pushToast(result.message);
    }
    return {
      ok: result.ok,
      message: result.message,
    };
  }

  async function handleSaveAccountProfile(draft: {
    householdName: string;
    parentDisplayName: string;
  }) {
    const result = await updateAccountProfile(draft, latestAppDataRef.current);
    setAuthMessage(result.message);
    setAuthState(result.authState);
    setStorageMode(result.storageMode);
    if (result.ok) {
      latestAppDataRef.current = result.appData;
      setAppData(result.appData);
      pushToast(result.message);
    }
    return {
      ok: result.ok,
      message: result.message,
    };
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

  if (derivationError) {
    console.warn("[Earned] Top-level app derivation failed.", derivationError);
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
              ) : currentUser?.role === "parent" && appData.session.authUserId ? (
                <>
                  <button
                    className="hero-button-secondary rounded-full px-4 py-2.5 text-sm font-black"
                    onClick={() => setIsAccountOpen(true)}
                    type="button"
                  >
                    Account
                  </button>
                  <button
                    className="hero-button-secondary rounded-full px-4 py-2.5 text-sm font-black"
                    onClick={() => void handleParentSignOut()}
                    type="button"
                  >
                    Sign out
                  </button>
                </>
              ) : null}
              {currentUser ? (
                <button
                  className="hero-button-secondary rounded-full px-4 py-2.5 text-sm font-black"
                  onClick={() => void handleEnableNotifications()}
                  type="button"
                >
                  {notificationStatus === "granted"
                    ? "Pings on"
                    : notificationStatus === "needs-secure-origin"
                      ? "Pings need HTTPS"
                      : "Enable pings"}
                </button>
              ) : null}
            </div>
            {syncWarning ? (
              <p className="relative mt-3 text-sm font-bold text-[#ffe8be]">{syncWarning}</p>
            ) : (
              <p className="relative mt-3 text-sm font-bold text-[#d7efc4]">
                Shared family sync is active.
              </p>
            )}
          </header>

          {!hasLoadedStoredData || authState === "signed_in_loading_household" ? (
            <LoadingState />
          ) : !currentUser ? (
            <ParentAuthShell
              authMessage={authMessage}
              authState={authState}
              authWarning={authBootstrap.setupWarning}
              childLoginEnabled={householdChildren.length > 0}
              isSubmitting={isAuthSubmitting}
              onLogin={handleParentLogin}
              onSignup={handleParentSignup}
            />
          ) : currentUser.role === "parent" &&
            appData.session.authUserId &&
            householdLoaded &&
            isAccountOpen ? (
            <AccountScreen
              childProfiles={getChildren(appData).filter(
                (profile) => profile.parent_id === currentUser.id,
              )}
              currentUser={currentUser}
              householdName={householdName}
              parentProfile={parentProfile}
              onBack={() => setIsAccountOpen(false)}
              onCreateChild={handleCreateChildProfile}
              onDeleteChild={handleDeleteChildProfile}
              onRegenerateChildLink={handleRegenerateChildLink}
              onSaveAccount={handleSaveAccountProfile}
              onUpdateChild={handleUpdateChildProfile}
            />
          ) : currentUser.role === "parent" &&
            appData.session.authUserId &&
            householdLoaded &&
            getChildren(appData).filter((profile) => profile.parent_id === currentUser.id).length === 0 ? (
            <FirstTimeSetupScreen
              householdName={householdName}
              onCreateChild={handleCreateChildProfile}
            />
          ) : currentUser.role === "parent" && appData.session.authUserId && householdLoaded ? (
            <ParentDashboard
              checkIns={appData.checkIns}
              childProfiles={getChildren(appData).filter(
                (profile) => profile.parent_id === currentUser.id,
              )}
              chores={getChores(appData).filter((chore) => chore.parent_id === currentUser.id)}
              householdName={householdName}
              payouts={getPayments(appData).filter((payout) => payout.parent_id === currentUser.id)}
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
              onRecordRoutineCheckIn={(choreId) => {
                void enqueueMutation(async (snapshot) => {
                  const result = recordParentRoutineCheckIn(snapshot, choreId, currentUser);
                  if (result.ok) {
                    await syncAppData(result.appData);
                  }
                  pushToast(result.message);
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
          ) : currentUser.role === "child" && childProfile && householdLoaded ? (
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
            <LoadingState copy="Confirming account access..." />
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

const genderOptions = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];

function getEmptyChildDraft(): ChildProfileDraft {
  return {
    age: "",
    gender: "",
    name: "",
  };
}

function getChildDraftFromProfile(child: ChildProfile): ChildProfileDraft {
  return {
    age: child.age ? String(child.age) : "",
    gender: child.gender ?? "",
    name: child.name ?? "",
  };
}

function getGenderLabel(gender: string | null | undefined) {
  return genderOptions.find((option) => option.value === gender)?.label ?? "Not set";
}

function getConfiguredChildLinkBase() {
  const localAuthMode =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_EARNEDIT_AUTH_TEST_MODE?.trim().toLowerCase() === "true";
  if (localAuthMode) {
    return {
      baseUrl: null,
      message:
        "Child QR device linking needs Supabase mode. Set NEXT_PUBLIC_EARNEDIT_AUTH_TEST_MODE=false, run the beta migrations, and use NEXT_PUBLIC_EARNEDIT_CHILD_LINK_BASE_URL for the device URL.",
    };
  }

  const configured = process.env.NEXT_PUBLIC_EARNEDIT_CHILD_LINK_BASE_URL?.trim();
  if (configured) {
    return {
      baseUrl: configured.replace(/\/+$/, ""),
      message: null,
    };
  }

  if (typeof window === "undefined") {
    return {
      baseUrl: null,
      message: "Child QR links need a deployed URL or LAN URL before they can be generated.",
    };
  }

  const hostname = window.location.hostname;
  const isLocalhost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (isLocalhost) {
    return {
      baseUrl: null,
      message:
        "QR scanning from another device cannot use localhost. Set NEXT_PUBLIC_EARNEDIT_CHILD_LINK_BASE_URL to your deployed app URL or a LAN IP URL, then restart the app.",
    };
  }

  return {
    baseUrl: window.location.origin,
    message: null,
  };
}

function buildChildLink(accessToken: string | null | undefined) {
  const { baseUrl, message } = getConfiguredChildLinkBase();
  if (!baseUrl || !accessToken) {
    return {
      link: "",
      message: accessToken ? message : "This child profile does not have a QR token yet.",
    };
  }

  return {
    link: `${baseUrl}/child-link?token=${encodeURIComponent(accessToken)}`,
    message: null,
  };
}

function getBrowserNotificationMessages(
  previous: AppData,
  current: AppData,
  currentUser: User,
  childProfile: ChildProfile | null,
) {
  const previousChores = new Map(previous.chores.map((chore) => [chore.id, chore]));
  if (currentUser.role === "parent") {
    return current.chores
      .filter((chore) => {
        const previousChore = previousChores.get(chore.id);
        return (
          chore.parent_id === currentUser.id &&
          chore.status === "submitted" &&
          previousChore?.status !== "submitted"
        );
      })
      .map((chore) => {
        const childName =
          current.childProfiles.find((profile) => profile.id === chore.child_id)?.name ?? "Child";
        return {
          title: "Chore submitted",
          body: `${childName} submitted ${chore.title}.`,
          tag: `submitted-${chore.id}`,
        };
      });
  }

  if (!childProfile) {
    return [];
  }

  return current.chores
    .filter((chore) => {
      const previousChore = previousChores.get(chore.id);
      return (
        chore.child_id === childProfile.id &&
        previousChore?.status !== chore.status &&
        (chore.status === "approved" || chore.status === "rejected" || chore.status === "paid")
      );
    })
    .map((chore) => ({
      title:
        chore.status === "approved"
          ? "Chore approved"
          : chore.status === "rejected"
            ? "Chore needs another try"
            : "Reward paid",
      body: `${chore.title} is now ${chore.status}.`,
      tag: `${chore.status}-${chore.id}`,
    }));
}

function setManifestHref(href: string) {
  if (typeof document === "undefined") {
    return;
  }

  const manifestLink =
    document.querySelector<HTMLLinkElement>('link[rel="manifest"]') ??
    document.head.appendChild(document.createElement("link"));
  manifestLink.rel = "manifest";
  manifestLink.href = href;
}

function isStandaloneAppLaunch() {
  if (typeof window === "undefined") {
    return false;
  }

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function readBlockedChildTokens() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CHILD_SIGNED_OUT_TOKEN_KEY) ?? "[]",
    );
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeBlockedChildTokens(tokens: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CHILD_SIGNED_OUT_TOKEN_KEY, JSON.stringify([...tokens]));
}

function blockChildTokenForStandalone(token: string) {
  const tokens = readBlockedChildTokens();
  tokens.add(token);
  writeBlockedChildTokens(tokens);
}

function unblockChildTokenForStandalone(token: string) {
  const tokens = readBlockedChildTokens();
  if (!tokens.delete(token)) {
    return;
  }

  writeBlockedChildTokens(tokens);
}

function isChildTokenBlockedForStandalone(token: string) {
  return readBlockedChildTokens().has(token);
}

function FirstTimeSetupScreen({
  householdName,
  onCreateChild,
}: {
  householdName: string | null;
  onCreateChild: (draft: ChildProfileDraft) => Promise<{ ok: boolean; message: string }>;
}) {
  const [draft, setDraft] = useState<ChildProfileDraft>(() => getEmptyChildDraft());
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    setIsSaving(true);
    try {
      const result = await onCreateChild(draft);
      setMessage(result.message);
      if (result.ok) {
        setDraft(getEmptyChildDraft());
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel-strong rounded-[32px] p-5 text-white sm:p-7">
      <div className="section-kicker kicker-row">
        <span className="kicker-icon">
          <AppIcon className="h-4 w-4" name="sprout" />
        </span>
        First-time setup
      </div>
      <h2 className="mt-3 font-mono text-3xl font-black">
        Set up {householdName?.trim() || "your household"}
      </h2>
      <p className="mt-3 max-w-2xl text-sm font-bold leading-7 text-white">
        Create a child profile to start assigning chores. The dashboard stays locked until at
        least one real child profile exists.
      </p>
      <div className="mt-6 max-w-3xl rounded-[26px] border border-[#d9c075]/55 bg-[#fffaf0] p-4 text-slate-950 shadow-[0_16px_30px_rgba(48,35,18,0.12)]">
        <ChildProfileForm
          draft={draft}
          isSaving={isSaving}
          submitLabel="Create child profile"
          onChange={setDraft}
          onSubmit={handleSubmit}
        />
        {message ? (
          <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm font-black text-slate-800">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function AccountScreen({
  childProfiles,
  currentUser,
  householdName,
  parentProfile,
  onBack,
  onCreateChild,
  onDeleteChild,
  onRegenerateChildLink,
  onSaveAccount,
  onUpdateChild,
}: {
  childProfiles: ChildProfile[];
  currentUser: User;
  householdName: string | null;
  parentProfile: Profile | null;
  onBack: () => void;
  onCreateChild: (draft: ChildProfileDraft) => Promise<{ ok: boolean; message: string }>;
  onDeleteChild: (childId: string) => Promise<{ ok: boolean; message: string }>;
  onRegenerateChildLink: (childId: string) => Promise<{ ok: boolean; message: string }>;
  onSaveAccount: (draft: {
    householdName: string;
    parentDisplayName: string;
  }) => Promise<{ ok: boolean; message: string }>;
  onUpdateChild: (
    childId: string,
    draft: ChildProfileDraft,
  ) => Promise<{ ok: boolean; message: string }>;
}) {
  const [householdDraft, setHouseholdDraft] = useState(householdName?.trim() || "");
  const [parentNameDraft, setParentNameDraft] = useState(
    parentProfile?.display_name?.trim() || currentUser.name || "",
  );
  const [newChildDraft, setNewChildDraft] = useState<ChildProfileDraft>(() => getEmptyChildDraft());
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [editingChildDraft, setEditingChildDraft] = useState<ChildProfileDraft>(() =>
    getEmptyChildDraft(),
  );
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [qrChildId, setQrChildId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState<string | null>(null);
  const qrChild = childProfiles.find((child) => child.id === qrChildId) ?? null;

  async function handleSaveAccount() {
    setSavingTask("account");
    try {
      const result = await onSaveAccount({
        householdName: householdDraft,
        parentDisplayName: parentNameDraft,
      });
      setMessage(result.message);
      if (result.ok) {
        setIsEditingAccount(false);
      }
    } finally {
      setSavingTask(null);
    }
  }

  async function handleCreateChild() {
    setSavingTask("create-child");
    try {
      const result = await onCreateChild(newChildDraft);
      setMessage(result.message);
      if (result.ok) {
        setNewChildDraft(getEmptyChildDraft());
      }
    } finally {
      setSavingTask(null);
    }
  }

  async function handleUpdateChild(childId: string) {
    setSavingTask(`update-${childId}`);
    try {
      const result = await onUpdateChild(childId, editingChildDraft);
      setMessage(result.message);
      if (result.ok) {
        setEditingChildId(null);
      }
    } finally {
      setSavingTask(null);
    }
  }

  async function handleDeleteChild(child: ChildProfile) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Remove ${child.name.trim() || "this child profile"} and their chores?`)
    ) {
      return;
    }

    setSavingTask(`delete-${child.id}`);
    try {
      const result = await onDeleteChild(child.id);
      setMessage(result.message);
      if (result.ok && qrChildId === child.id) {
        setQrChildId(null);
      }
    } finally {
      setSavingTask(null);
    }
  }

  async function handleRegenerateChildLink(childId: string) {
    setSavingTask(`qr-${childId}`);
    try {
      const result = await onRegenerateChildLink(childId);
      setMessage(result.message);
    } finally {
      setSavingTask(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="panel-strong rounded-[32px] p-5 text-white sm:p-7">
        <button
          className="hero-button-secondary rounded-full px-4 py-2.5 text-sm font-black"
          onClick={onBack}
          type="button"
        >
          &lt; Back
        </button>
        <div className="mt-5">
          <div className="section-kicker kicker-row">
            <span className="kicker-icon">
              <AppIcon className="h-4 w-4" name="seed" />
            </span>
            Account
          </div>
          <h2 className="mt-3 font-mono text-3xl font-black">
            {householdName?.trim() || "Household details"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-200">
            Manage household identity, parent profile details, child profiles, and QR access.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="panel-soft rounded-[32px] p-5 sm:p-6">
          <div className="section-kicker kicker-row text-[#6d5a2d]">
            <span className="kicker-icon">
              <AppIcon className="h-4 w-4" name="leaf" />
            </span>
            Account Info
          </div>
          <div className="mt-4 space-y-4">
            <ReadOnlyInfo label="Account name" value={currentUser.name || "Parent"} />
            <ReadOnlyInfo label="Email" value={currentUser.email || "No email on file"} />
            <ReadOnlyInfo
              label="Password/security"
              value="Password changes unavailable during beta."
            />
            {!isEditingAccount ? (
              <>
                <ReadOnlyInfo label="Household name" value={householdName?.trim() || "Household"} />
                <ReadOnlyInfo
                  label="Parent profile name"
                  value={parentProfile?.display_name?.trim() || currentUser.name || "Parent"}
                />
                <button
                  className="action-button w-full rounded-2xl bg-gradient-to-r from-[#78a85a] via-[#91b85f] to-[#d5a642] px-5 py-4 text-base font-black text-[#231d16] shadow-lg shadow-[#3d2b12]/18"
                  onClick={() => setIsEditingAccount(true)}
                  type="button"
                >
                  Edit account info
                </button>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#4f3f1f]">
                    Household name
                  </span>
                  <input
                    className="field-surface w-full rounded-2xl bg-white px-4 py-3 text-base font-bold text-slate-950 placeholder:text-slate-500"
                    value={householdDraft}
                    onChange={(event) => setHouseholdDraft(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#4f3f1f]">
                    Parent profile name
                  </span>
                  <input
                    className="field-surface w-full rounded-2xl bg-white px-4 py-3 text-base font-bold text-slate-950 placeholder:text-slate-500"
                    value={parentNameDraft}
                    onChange={(event) => setParentNameDraft(event.target.value)}
                  />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    className="action-button flex-1 rounded-2xl bg-gradient-to-r from-[#78a85a] via-[#91b85f] to-[#d5a642] px-5 py-4 text-base font-black text-[#231d16] shadow-lg shadow-[#3d2b12]/18 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={savingTask === "account"}
                    onClick={() => void handleSaveAccount()}
                    type="button"
                  >
                    {savingTask === "account" ? "Saving..." : "Save account info"}
                  </button>
                  <button
                    className="rounded-2xl border border-[#d9c075] bg-white px-5 py-4 text-base font-black text-slate-800"
                    onClick={() => {
                      setHouseholdDraft(householdName?.trim() || "");
                      setParentNameDraft(parentProfile?.display_name?.trim() || currentUser.name || "");
                      setIsEditingAccount(false);
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
            {message ? (
              <p className="rounded-2xl bg-white px-3 py-2 text-sm font-bold text-slate-700">
                {message}
              </p>
            ) : null}
          </div>
        </section>

        <section className="panel-soft rounded-[32px] p-5 sm:p-6">
          <div className="section-kicker kicker-row text-[#6d5a2d]">
            <span className="kicker-icon">
              <AppIcon className="h-4 w-4" name="sprout" />
            </span>
            Child profiles
          </div>

          {childProfiles.length === 0 ? (
            <p className="mt-4 rounded-[22px] border border-[#d9c075]/50 bg-white px-4 py-4 text-sm font-bold text-slate-600">
              Create a child profile to start assigning chores.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {childProfiles.map((child) => {
                const isEditing = editingChildId === child.id;
                return (
                  <article
                    className="rounded-[24px] border border-[#d9c075]/50 bg-white p-4"
                    key={child.id}
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <ChildProfileForm
                          draft={editingChildDraft}
                          isSaving={savingTask === `update-${child.id}`}
                          submitLabel="Save child profile"
                          onChange={setEditingChildDraft}
                          onSubmit={() => void handleUpdateChild(child.id)}
                        />
                        <button
                          className="rounded-2xl border border-[#d9c075] bg-white px-4 py-3 text-sm font-black text-slate-700"
                          onClick={() => setEditingChildId(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xl font-black text-slate-950">
                              {child.name.trim() || "your child"}
                            </p>
                            <p className="mt-1 text-sm font-bold text-slate-600">
                              Age {child.age ?? "not set"} - {getGenderLabel(child.gender)}
                            </p>
                          </div>
                          <span className="stat-chip stat-chip-soft">Child access</span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            className="rounded-full border border-[#d9c075] bg-white px-3 py-2 text-sm font-black text-slate-800"
                            onClick={() => {
                              setEditingChildId(child.id);
                              setEditingChildDraft(getChildDraftFromProfile(child));
                            }}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="rounded-full border border-[#d9c075] bg-white px-3 py-2 text-sm font-black text-slate-800"
                            onClick={() => setQrChildId(child.id)}
                            type="button"
                          >
                            QR access
                          </button>
                          <button
                            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black text-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={savingTask === `delete-${child.id}`}
                            onClick={() => void handleDeleteChild(child)}
                            type="button"
                          >
                            {savingTask === `delete-${child.id}` ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-5 rounded-[24px] border border-[#d9c075]/50 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6d5a2d]">
              Add child profile
            </p>
            <div className="mt-3">
              <ChildProfileForm
                draft={newChildDraft}
                isSaving={savingTask === "create-child"}
                submitLabel="Add child"
                onChange={setNewChildDraft}
                onSubmit={() => void handleCreateChild()}
              />
            </div>
          </div>
        </section>
      </div>

      {qrChild ? (
        <ChildDeviceLinkModal
          key={qrChild.id}
          childProfile={qrChild}
          isRegenerating={savingTask === `qr-${qrChild.id}`}
          onClose={() => setQrChildId(null)}
          onRegenerate={() => void handleRegenerateChildLink(qrChild.id)}
        />
      ) : null}
    </section>
  );
}

function ChildProfileForm({
  draft,
  isSaving,
  submitLabel,
  onChange,
  onSubmit,
}: {
  draft: ChildProfileDraft;
  isSaving: boolean;
  submitLabel: string;
  onChange: (draft: ChildProfileDraft) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_0.55fr_0.9fr_auto]">
      <label className="block">
        <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#4f3f1f]">
          Child name
        </span>
        <input
          className="field-surface w-full rounded-2xl bg-white px-4 py-3 text-base font-bold text-slate-950 placeholder:text-slate-500"
          placeholder="Child name"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#4f3f1f]">
          Age
        </span>
        <input
          className="field-surface w-full rounded-2xl bg-white px-4 py-3 text-base font-bold text-slate-950 placeholder:text-slate-500"
          inputMode="numeric"
          min={1}
          max={18}
          placeholder="Age"
          type="number"
          value={draft.age}
          onChange={(event) => onChange({ ...draft, age: event.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#4f3f1f]">
          Gender
        </span>
        <select
          className="field-surface w-full rounded-2xl bg-white px-4 py-3 text-base font-bold text-slate-950"
          value={draft.gender}
          onChange={(event) => onChange({ ...draft, gender: event.target.value })}
        >
          <option value="">Select</option>
          {genderOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="action-button self-end rounded-2xl bg-gradient-to-r from-[#78a85a] via-[#91b85f] to-[#d5a642] px-5 py-3 text-base font-black text-[#231d16] shadow-lg shadow-[#3d2b12]/18 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving}
        onClick={onSubmit}
        type="button"
      >
        {isSaving ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

function ReadOnlyInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[#d9c075]/50 bg-white px-4 py-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6d5a2d]">{label}</p>
      <p className="mt-1 font-black text-slate-950">{value}</p>
    </div>
  );
}

function ChildDeviceLinkModal({
  childProfile,
  isRegenerating,
  onClose,
  onRegenerate,
}: {
  childProfile: ChildProfile;
  isRegenerating: boolean;
  onClose: () => void;
  onRegenerate: () => void;
}) {
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const childName = childProfile.name.trim() || "your child";
  const { link: childLink, message } = buildChildLink(childProfile.access_token);

  useEffect(() => {
    let cancelled = false;

    if (!childLink) {
      return;
    }

    void QRCode.toDataURL(childLink, {
      margin: 2,
      scale: 7,
      width: 260,
    }).then((dataUrl) => {
      if (!cancelled) {
        setQrImageUrl(dataUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [childLink]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1e1a13]/48 px-3 py-4 backdrop-blur-sm sm:items-center">
      <section className="w-full max-w-md overflow-hidden rounded-[30px] bg-[#fffaf0] shadow-[0_28px_80px_rgba(25,20,12,0.38)]">
        <div className="payment-sheet-header px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="section-kicker kicker-row">
                <span className="kicker-icon">
                  <AppIcon className="h-4 w-4" name="spark" />
                </span>
                Child device QR
              </div>
              <h3 className="mt-3 font-mono text-2xl font-black">{childName}</h3>
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

        <div className="space-y-4 px-5 py-5 text-slate-900">
          <div className="rounded-[26px] border border-[#d9c075]/50 bg-white p-4 text-center">
            {qrImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`Child device QR for ${childName}`}
                className="mx-auto h-64 w-64 rounded-[18px]"
                src={qrImageUrl}
              />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-[18px] bg-[#f8f0dc] px-4 text-sm font-bold text-slate-600">
                {message ?? "Building QR code..."}
              </div>
            )}
          </div>

          <p className="text-sm leading-6 text-slate-700">
            This QR opens only {childName}&apos;s child-safe chore view. Regenerating it revokes
            the previous QR for this child.
          </p>
          {childLink ? (
            <p className="break-all rounded-[18px] bg-white px-3 py-3 text-xs font-bold text-slate-600">
              {childLink}
            </p>
          ) : null}

          <button
            className="action-button w-full rounded-2xl border border-[#d9c075] bg-white px-5 py-4 text-base font-black text-[#3b301f] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isRegenerating}
            onClick={onRegenerate}
            type="button"
          >
            {isRegenerating ? "Regenerating..." : "Regenerate QR"}
          </button>
        </div>
      </section>
    </div>
  );
}

function LoadingState({ copy = "Loading household access..." }: { copy?: string }) {
  return (
    <section className="panel-soft rounded-[32px] p-6 text-slate-700 sm:p-7">
      <div className="kicker-row text-slate-500">
        <span className="kicker-icon">
          <AppIcon className="h-4 w-4" name="sprout" />
        </span>
        Please wait
      </div>
      <h2 className="mt-3 font-mono text-3xl font-black text-slate-900">
        Checking access
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-7 sm:text-base">{copy}</p>
    </section>
  );
}
