"use client";

import { useEffect, useRef, useState } from "react";
import {
  createEmptyParentLoginDraft,
  createEmptyParentSignupDraft,
  isEarnedItAuthTestModeEnabled,
  type ParentLoginDraft,
  type ParentSignupDraft,
} from "@/lib/auth/auth-foundation";
import { AppIcon } from "@/components/ui-icons";

type ParentAuthShellProps = {
  authMessage: string | null;
  authWarning: string | null;
  isSubmitting: boolean;
  authState?: string;
  onLogin: (draft: ParentLoginDraft) => Promise<void>;
  onSignup: (draft: ParentSignupDraft) => Promise<void>;
};

export function ParentAuthShell({
  authMessage,
  authWarning,
  authState,
  isSubmitting,
  onLogin,
  onSignup,
}: ParentAuthShellProps) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [loginDraft, setLoginDraft] = useState<ParentLoginDraft>(() => createEmptyParentLoginDraft());
  const [signupDraft, setSignupDraft] = useState<ParentSignupDraft>(() => createEmptyParentSignupDraft());
  const submitLockRef = useRef(false);
  const authTestModeActive = isEarnedItAuthTestModeEnabled();

  useEffect(() => {
    if (authTestModeActive) {
      console.info("EarnedIt auth test mode active");
    }
  }, [authTestModeActive]);

  async function runOnce(task: () => Promise<void>) {
    if (isSubmitting || submitLockRef.current) {
      if (process.env.NODE_ENV === "development") {
        console.info("[Earned auth] Duplicate auth submit ignored while request is pending.");
      }
      return;
    }

    submitLockRef.current = true;
    try {
      await task();
    } finally {
      submitLockRef.current = false;
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="panel-strong mode-frame rounded-[32px] p-6 text-white sm:p-7">
        <div className="section-kicker kicker-row">
          <span className="kicker-icon">
            <AppIcon className="h-4 w-4" name="sprout" />
          </span>
          Beta household access
        </div>
        <h2 className="mt-3 max-w-xl font-mono text-3xl font-black">
          Sign in as a parent and keep each household fenced in.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
          This beta phase uses real parent auth, household records, child records, chores, and
          completion sync in Supabase.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            className={`rounded-full px-4 py-2.5 text-sm font-black ${
              mode === "signup" ? "hero-button-primary" : "hero-button-secondary"
            }`}
            onClick={() => setMode("signup")}
            type="button"
          >
            Create household
          </button>
          <button
            className={`rounded-full px-4 py-2.5 text-sm font-black ${
              mode === "login" ? "hero-button-primary" : "hero-button-secondary"
            }`}
            onClick={() => setMode("login")}
            type="button"
          >
            Parent login
          </button>
        </div>

        {authWarning ? (
          <p className="mt-4 rounded-2xl border border-[#f4e0aa]/35 bg-[#fff8e7]/10 px-4 py-3 text-sm font-bold text-[#fff1c9]">
            {authWarning}
          </p>
        ) : null}
        {authMessage ? (
          <p className="mt-4 rounded-2xl border border-white/12 bg-white/10 px-4 py-3 text-sm font-bold text-white">
            {authMessage}
          </p>
        ) : null}
        {authState ? (
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-300">
            {authState.replace(/_/g, " ")}
          </p>
        ) : null}
      </div>

      <div className="panel-soft rounded-[32px] p-6 sm:p-7">
        {mode === "signup" ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#6d5a2d]">
                Parent signup
              </p>
              <h3 className="mt-2 font-mono text-3xl font-black text-slate-900">
                Create a household
              </h3>
            </div>

            <label className="block space-y-2">
              <span className="text-[0.95rem] font-black text-[#5f5747]">Your name</span>
              <input
                className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]"
                value={signupDraft.displayName}
                onChange={(event) =>
                  setSignupDraft((current) => ({ ...current, displayName: event.target.value }))
                }
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[0.95rem] font-black text-[#5f5747]">Household name</span>
              <input
                className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]"
                placeholder="Cynthia's Home"
                value={signupDraft.householdName}
                onChange={(event) =>
                  setSignupDraft((current) => ({ ...current, householdName: event.target.value }))
                }
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[0.95rem] font-black text-[#5f5747]">Email</span>
              <input
                className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]"
                inputMode="email"
                type="email"
                value={signupDraft.email}
                onChange={(event) =>
                  setSignupDraft((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[0.95rem] font-black text-[#5f5747]">Password</span>
              <input
                className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]"
                type="password"
                value={signupDraft.password}
                onChange={(event) =>
                  setSignupDraft((current) => ({ ...current, password: event.target.value }))
                }
              />
            </label>

            <button
              className="action-button w-full rounded-2xl bg-gradient-to-r from-[#78a85a] via-[#91b85f] to-[#d5a642] px-5 py-4 text-base font-black text-[#231d16] shadow-lg shadow-[#3d2b12]/18"
              disabled={isSubmitting}
              onClick={() => void runOnce(() => onSignup(signupDraft))}
              type="button"
            >
              {isSubmitting ? "Creating..." : "Create parent account"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#6d5a2d]">
                Parent login
              </p>
              <h3 className="mt-2 font-mono text-3xl font-black text-slate-900">
                Sign back in
              </h3>
            </div>

            <label className="block space-y-2">
              <span className="text-[0.95rem] font-black text-[#5f5747]">Email</span>
              <input
                className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]"
                inputMode="email"
                type="email"
                value={loginDraft.email}
                onChange={(event) =>
                  setLoginDraft((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[0.95rem] font-black text-[#5f5747]">Password</span>
              <input
                className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]"
                type="password"
                value={loginDraft.password}
                onChange={(event) =>
                  setLoginDraft((current) => ({ ...current, password: event.target.value }))
                }
              />
            </label>

            <button
              className="action-button w-full rounded-2xl bg-gradient-to-r from-[#5f8f43] to-[#d4ad4f] px-5 py-4 text-base font-black text-[#231d16] shadow-lg shadow-[#3d2b12]/18"
              disabled={isSubmitting}
              onClick={() => void runOnce(() => onLogin(loginDraft))}
              type="button"
            >
              {isSubmitting ? "Signing in..." : "Sign in as parent"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
