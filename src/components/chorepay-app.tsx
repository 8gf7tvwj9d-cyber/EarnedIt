"use client";

import { useEffect, useState } from "react";
import { ChildDashboard } from "@/components/child-dashboard";
import { ParentDashboard } from "@/components/parent-dashboard";
import {
  addRollingProof,
  approveChore,
  deleteChore,
  getChildProfileForUser,
  getCurrentUser,
  markBalancePaid,
  readAppData,
  rejectChore,
  resetAppData,
  saveChore,
  setCurrentUser,
  submitChore,
  submitRollingChore,
  writeAppData,
} from "@/lib/chorepay-store";
import { formatCurrency } from "@/lib/format";
import { AppData, ChoreDraft } from "@/lib/chorepay-types";
import { isSupabaseConfigured } from "@/lib/supabase";

type Toast = {
  id: number;
  message: string;
};

export function ChorePayApp() {
  const [appData, setAppData] = useState<AppData | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAppData(readAppData());
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!appData) {
      return;
    }

    writeAppData(appData);
  }, [appData]);

  function pushToast(message: string) {
    const id = Date.now();
    setToasts((current) => [...current, { id, message }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2600);
  }

  if (!appData) {
    return <div className="min-h-screen bg-transparent" />;
  }

  const currentUser = getCurrentUser(appData);
  const childProfile = getChildProfileForUser(appData.childProfiles, currentUser);
  const childChores = childProfile
    ? appData.chores.filter((chore) => chore.child_id === childProfile.id)
    : [];
  const childPayouts = childProfile
    ? appData.payouts.filter((payout) => payout.child_id === childProfile.id)
    : [];
  const approvedBalance = appData.chores
    .filter((chore) => chore.status === "approved")
    .reduce((sum, chore) => sum + chore.amount_cents, 0);

  function updateAppData(nextData: AppData) {
    setAppData(nextData);
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

  return (
    <main className="min-h-screen px-3 py-4 text-slate-900 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-7xl">
        <div className="app-shell rounded-[38px] px-4 py-4 sm:px-6 sm:py-6">
          <header className="hero-mesh relative mb-6 overflow-hidden rounded-[34px] px-5 py-6 text-white sm:px-7 sm:py-7">
            <div className="hero-orb hero-orb-one" />
            <div className="hero-orb hero-orb-two" />
            <div className="hero-orb hero-orb-three" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-[11px] font-extrabold uppercase section-label text-slate-100">
                  Earned
                  <span className="h-2 w-2 rounded-full bg-[#dce7ff]" />
                  Family chore tracker
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="sticker-chip quiet-chip text-white">Simple payouts</span>
                  <span className="sticker-chip quiet-chip text-white">Photo proof</span>
                  <span className="sticker-chip quiet-chip text-white">Mobile-first</span>
                </div>

                <h1 className="mt-4 max-w-2xl font-mono text-4xl font-black tracking-tight sm:text-[3.35rem] sm:leading-[1.02]">
                  Keep chores clear, motivating, and easy to manage together.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
                  Earned helps parents track what gets done, what gets approved, and what is still owed,
                  while keeping the experience simple enough for kids to actually enjoy using.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:w-[24rem]">
                <div className="mode-frame rounded-[28px] bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-200">
                    Current approved balance
                  </p>
                  <p className="mt-2 font-mono text-3xl font-black text-white">
                    {formatCurrency(approvedBalance)}
                  </p>
                  <p className="mt-2 text-sm text-slate-200">
                    What&apos;s ready to be paid out next
                  </p>
                </div>

                <div className="mode-frame rounded-[28px] bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-200">
                    App mode
                  </p>
                  <p className="mt-2 text-lg font-bold text-white">
                    {isSupabaseConfigured ? "Supabase ready" : "Demo ready"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-200">
                    {isSupabaseConfigured
                      ? "Backend keys are present."
                      : "Phone-friendly local demo data is loaded."}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative mt-5 flex flex-wrap gap-2">
              <button
                className={`rounded-full px-4 py-2.5 text-sm font-black ${
                  currentUser?.role === "parent"
                    ? "bg-white text-slate-950"
                    : "bg-white/10 text-white"
                }`}
                onClick={() => signInAs("parent")}
                type="button"
              >
                Parent view
              </button>
              <button
                className={`rounded-full px-4 py-2.5 text-sm font-black ${
                  currentUser?.role === "child"
                    ? "bg-[#d9f0eb] text-slate-950"
                    : "bg-white/10 text-white"
                }`}
                onClick={() => signInAs("child")}
                type="button"
              >
                Child view
              </button>
              <button
                className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-black text-white"
                onClick={() => {
                  updateAppData(resetAppData());
                  pushToast("Demo data reset");
                }}
                type="button"
              >
                Reset demo data
              </button>
            </div>
          </header>

          {!currentUser ? (
            <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
              <div className="panel-strong mode-frame rounded-[32px] p-6 text-white sm:p-7">
                <p className="text-xs font-extrabold uppercase section-label text-slate-100">
                  Pick a role
                </p>
                <h2 className="mt-3 max-w-lg font-mono text-3xl font-black">
                  See the app from both sides of the family.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-slate-200 sm:text-base">
                  Parent mode manages approvals and payouts. Child mode focuses on completing chores,
                  sending proof, and seeing what has been earned.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    className="metric-card rounded-[28px] bg-white px-5 py-5 text-left text-slate-900 shadow-[0_18px_35px_rgba(24,22,64,0.12)]"
                    onClick={() => signInAs("parent")}
                    type="button"
                  >
                    <span className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
                      Parent
                    </span>
                    <span className="mt-3 block text-2xl font-black">Plan chores</span>
                    <span className="mt-2 block text-sm leading-6 text-slate-600">
                      Set amounts, review proof, and log payouts after money is sent manually.
                    </span>
                  </button>

                  <button
                    className="metric-card rounded-[28px] bg-gradient-to-br from-[#e2f3ee] via-[#eef8ff] to-[#fff8df] px-5 py-5 text-left text-slate-950 shadow-[0_18px_35px_rgba(24,22,64,0.12)]"
                    onClick={() => signInAs("child")}
                    type="button"
                  >
                    <span className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
                      Child
                    </span>
                    <span className="mt-3 block text-2xl font-black">Earn rewards</span>
                    <span className="mt-2 block text-sm leading-6 text-slate-700">
                      Finish chores, snap proof, and watch approved rewards build over time.
                    </span>
                  </button>
                </div>
              </div>

              <div className="panel-soft rounded-[32px] p-6 sm:p-7">
                <p className="text-xs font-extrabold uppercase section-label text-slate-500">
                  Why it feels better
                </p>
                <h2 className="mt-3 font-mono text-3xl font-black text-slate-900">
                  Built for real family routines, not messy note-taking.
                </h2>
                <div className="mt-5 grid gap-3">
                  <FeatureCard
                    accent="from-[#f7ead4] via-[#fff5ea] to-[#fffdf8]"
                    title="Clear status tracking"
                    copy="Every chore moves through obvious stages, so nobody wonders what happened next."
                  />
                  <FeatureCard
                    accent="from-[#e7f4ef] via-[#f4fbf9] to-[#f8fcff]"
                    title="Friendly mobile flow"
                    copy="Taking photos, submitting chores, and checking progress all feel natural on a phone."
                  />
                  <FeatureCard
                    accent="from-[#eef2fb] via-[#f8f9fd] to-[#fffaf4]"
                    title="Manual money stays simple"
                    copy="Earned tracks what is owed without pretending to replace how families actually pay each other."
                  />
                </div>
              </div>
            </section>
          ) : currentUser.role === "parent" ? (
            <ParentDashboard
              childProfiles={appData.childProfiles.filter(
                (profile) => profile.parent_id === currentUser.id,
              )}
              chores={appData.chores.filter((chore) => chore.parent_id === currentUser.id)}
              currentUser={currentUser}
              payouts={appData.payouts.filter((payout) => payout.parent_id === currentUser.id)}
              onApprove={(choreId) => {
                updateAppData(approveChore(appData, choreId));
                pushToast("Chore approved");
              }}
              onDeleteChore={(choreId) => {
                updateAppData(deleteChore(appData, choreId));
                pushToast("Chore deleted");
              }}
              onMarkPaid={(childId, notes) => {
                const before = appData.payouts.length;
                const next = markBalancePaid(appData, currentUser.id, childId, notes);
                updateAppData(next);
                pushToast(
                  next.payouts.length > before
                    ? "Balance marked as paid"
                    : "No approved balance to pay yet",
                );
              }}
              onReject={(choreId, note) => {
                updateAppData(rejectChore(appData, choreId, note));
                pushToast("Chore rejected");
              }}
              onSaveChore={(draft: ChoreDraft) => {
                updateAppData(saveChore(appData, currentUser, draft));
                pushToast(draft.id ? "Chore updated" : "Chore created");
              }}
            />
          ) : childProfile ? (
            <ChildDashboard
              childProfile={childProfile}
              chores={childChores}
              currentUser={currentUser}
              payouts={childPayouts}
              onAddRollingProof={(choreId, photoUrl) => {
                updateAppData(addRollingProof(appData, choreId, photoUrl));
                pushToast("Daily proof added");
              }}
              onSubmitChore={(choreId, photoUrl) => {
                updateAppData(submitChore(appData, choreId, photoUrl));
                pushToast("Chore submitted for review");
              }}
              onSubmitRollingChore={(choreId) => {
                updateAppData(submitRollingChore(appData, choreId));
                pushToast("Rolling chore submitted for review");
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
  );
}

function FeatureCard({
  accent,
  title,
  copy,
}: {
  accent: string;
  title: string;
  copy: string;
}) {
  return (
    <div className={`rounded-[24px] border border-white/70 bg-gradient-to-br ${accent} p-4`}>
      <p className="font-black text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-700">{copy}</p>
    </div>
  );
}
