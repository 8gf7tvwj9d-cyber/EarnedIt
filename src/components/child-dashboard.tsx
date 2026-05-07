"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status-badge";
import {
  formatCurrency,
  formatDate,
  formatShortDateTime,
} from "@/lib/format";
import {
  formatRepeatSchedule,
  getComputedStatus,
  getProofEntries,
  getRollingProgress,
  getTodayIsoDate,
} from "@/lib/chore-helpers";
import { Chore, ChildProfile, Payout, User } from "@/lib/chorepay-types";

type ChildDashboardProps = {
  currentUser: User;
  childProfile: ChildProfile;
  chores: Chore[];
  payouts: Payout[];
  onAddRollingProof: (choreId: string, photoUrl: string) => void;
  onSubmitChore: (choreId: string, photoUrl: string | null) => void;
  onSubmitRollingChore: (choreId: string) => void;
};

export function ChildDashboard({
  currentUser,
  childProfile,
  chores,
  payouts,
  onAddRollingProof,
  onSubmitChore,
  onSubmitRollingChore,
}: ChildDashboardProps) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [photoDrafts, setPhotoDrafts] = useState<Record<string, string | null>>({});
  const [messages, setMessages] = useState<Record<string, string | null>>({});

  const availableChores = chores.filter((chore) => {
    const status = getComputedStatus(chore);
    return status === "available" || status === "rejected";
  });
  const awaitingApproval = chores.filter((chore) => getComputedStatus(chore) === "submitted");
  const approvedEarned = chores.filter((chore) => {
    const status = getComputedStatus(chore);
    return status === "approved" || status === "paid";
  });

  const pendingApproval = awaitingApproval.reduce(
    (sum, chore) => sum + chore.amount_cents,
    0,
  );
  const approvedUnpaid = chores
    .filter((chore) => getComputedStatus(chore) === "approved")
    .reduce((sum, chore) => sum + chore.amount_cents, 0);
  const paidTotal = payouts.reduce((sum, payout) => sum + payout.amount_cents, 0);

  function setMessage(choreId: string, message: string | null) {
    setMessages((current) => ({ ...current, [choreId]: message }));
  }

  function openCamera(choreId: string) {
    setMessage(choreId, null);
    fileInputRefs.current[choreId]?.click();
  }

  function registerFileInput(choreId: string, node: HTMLInputElement | null) {
    fileInputRefs.current[choreId] = node;
  }

  async function handlePhotoSelect(choreId: string, file: File | null) {
    if (!file) {
      return;
    }

    const fileReader = new FileReader();
    fileReader.onload = () => {
      const result = typeof fileReader.result === "string" ? fileReader.result : null;
      setPhotoDrafts((current) => ({ ...current, [choreId]: result }));
      setMessage(choreId, "Photo attached");
    };
    fileReader.onerror = () => {
      setMessage(choreId, "That photo did not load. Please try again.");
    };
    fileReader.readAsDataURL(file);
  }

  function handleStandardSubmit(chore: Chore) {
    const photoUrl = photoDrafts[chore.id];
    if (!photoUrl) {
      setMessage(chore.id, "Please take a photo before submitting this chore.");
      return;
    }

    onSubmitChore(chore.id, photoUrl);
    setMessage(chore.id, null);
  }

  function handleRollingProof(chore: Chore) {
    const photoUrl = photoDrafts[chore.id];
    if (!photoUrl) {
      setMessage(chore.id, "Please take a photo before submitting this chore.");
      return;
    }

    onAddRollingProof(chore.id, photoUrl);
    setPhotoDrafts((current) => ({ ...current, [chore.id]: null }));
    setMessage(chore.id, "Today's proof was added");
  }

  function handleRollingSubmit(chore: Chore) {
    const progress = getRollingProgress(chore);
    if (!progress.isEligible) {
      setMessage(
        chore.id,
        progress.missedLabel
          ? `${progress.missedLabel} - not eligible yet`
          : "Finish every required day before submitting this chore.",
      );
      return;
    }

    onSubmitRollingChore(chore.id);
    setMessage(chore.id, null);
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          accent="from-[#ffe1ab] via-[#ffd28f] to-[#fff6de]"
          label="Pending approval"
          value={formatCurrency(pendingApproval)}
          copy="Submitted and waiting on a parent"
        />
        <SummaryCard
          accent="from-[#bcf6ef] via-[#8eece2] to-[#e0fffb]"
          label="Approved / earned"
          value={formatCurrency(approvedUnpaid)}
          copy="Approved money still unpaid"
        />
        <SummaryCard
          accent="from-[#cce0ff] via-[#a9cbff] to-[#eff5ff]"
          label="Already paid"
          value={formatCurrency(paidTotal)}
          copy="Rewards that already landed"
        />
      </section>

      <section className="space-y-4">
        <div className="panel-strong mode-frame rounded-[32px] p-5 text-white sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-extrabold uppercase section-label text-slate-100">
              Child mode
            </p>
            <h2 className="mt-2 font-mono text-3xl font-black">
              Nice work, {currentUser.name}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-200">
              Take a quick photo when a chore is done, then send it in and track what gets approved.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="sticker-chip quiet-chip text-white">Take a photo</span>
              <span className="sticker-chip quiet-chip text-white">Send for review</span>
              <span className="sticker-chip quiet-chip text-white">Track progress</span>
            </div>
          </div>

          <div className="space-y-5">
            <ChildSection
              emptyCopy="Nothing to do right now."
              title="Available chores"
            >
              {availableChores.map((chore) => (
                <ChildChoreCard
                  key={chore.id}
                  chore={chore}
                  message={messages[chore.id] ?? null}
                  onRegisterFileInput={registerFileInput}
                  photoDraft={photoDrafts[chore.id] ?? null}
                  onOpenCamera={openCamera}
                  onPhotoSelect={handlePhotoSelect}
                  onRollingProof={handleRollingProof}
                  onRollingSubmit={handleRollingSubmit}
                  onSetMessage={setMessage}
                  onStandardSubmit={handleStandardSubmit}
                />
              ))}
            </ChildSection>

            <ChildSection
              emptyCopy="No chores are waiting on approval."
              title="Awaiting approval"
            >
              {awaitingApproval.map((chore) => (
                <ReadOnlyChoreCard
                  key={chore.id}
                  chore={chore}
                  subtitle="Waiting on parent review"
                />
              ))}
            </ChildSection>

            <ChildSection
              emptyCopy="Nothing has been approved yet."
              title="Approved / earned"
            >
              {approvedEarned.map((chore) => (
                <ReadOnlyChoreCard
                  key={chore.id}
                  chore={chore}
                  subtitle={
                    getComputedStatus(chore) === "paid"
                      ? "Already paid"
                      : "Approved and ready for payout"
                  }
                />
              ))}
            </ChildSection>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel-soft rounded-[30px] p-5 sm:p-6">
            <p className="text-xs font-extrabold uppercase section-label text-slate-500">
              Paid history
            </p>
            <h3 className="mt-2 font-mono text-2xl font-black text-slate-900">
              Money already paid to {childProfile.name}
            </h3>
          </div>

          <div className="panel-soft rounded-[30px] p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-mono text-2xl font-black text-slate-900">Payouts</h3>
              <span className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-sky-800">
                {payouts.length} payouts
              </span>
            </div>

            <div className="space-y-3">
              {payouts.length === 0 ? (
                <EmptyState copy="No payouts yet. Once a parent marks a balance as paid, it will show up here." />
              ) : (
                payouts.map((payout) => (
                  <article
                    key={payout.id}
                    className="rounded-[24px] border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-900">
                          {formatCurrency(payout.amount_cents)}
                        </p>
                        <p className="text-sm text-slate-600">{payout.paid_method}</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-sky-800">
                        Paid
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {formatShortDateTime(payout.paid_at)}
                    </p>
                    {payout.notes ? (
                      <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600">
                        {payout.notes}
                      </p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ChildChoreCard({
  chore,
  photoDraft,
  message,
  onRegisterFileInput,
  onOpenCamera,
  onPhotoSelect,
  onRollingProof,
  onRollingSubmit,
  onSetMessage,
  onStandardSubmit,
}: {
  chore: Chore;
  photoDraft: string | null;
  message: string | null;
  onRegisterFileInput: (choreId: string, node: HTMLInputElement | null) => void;
  onOpenCamera: (choreId: string) => void;
  onPhotoSelect: (choreId: string, file: File | null) => Promise<void>;
  onRollingProof: (chore: Chore) => void;
  onRollingSubmit: (chore: Chore) => void;
  onSetMessage: (choreId: string, message: string | null) => void;
  onStandardSubmit: (chore: Chore) => void;
}) {
  const status = getComputedStatus(chore);
  const proofEntries = getProofEntries(chore);
  const rollingProgress = chore.chore_kind === "rolling" ? getRollingProgress(chore) : null;
  const todayPhotoExists = proofEntries.some(
    (entry) => entry.proof_date === getTodayIsoDate(),
  );
  const progressPercent = rollingProgress
    ? Math.min(
        100,
        Math.round(
          (rollingProgress.completedDates.length /
            Math.max(rollingProgress.requiredDates.length, 1)) *
            100,
        ),
      )
    : 0;

  return (
    <article className="child-card rounded-[28px] border border-white/14 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-white">{chore.title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-200">{chore.description}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-3 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
        <p>{formatCurrency(chore.amount_cents)}</p>
        <p>
          {chore.chore_kind === "rolling"
            ? `Runs until ${formatDate(chore.due_date)}`
            : `Due ${formatDate(chore.due_date)}`}
        </p>
        <p>{chore.chore_kind === "rolling" ? "Rolling chore" : "Single-submit chore"}</p>
        <p>{formatRepeatSchedule(chore)}</p>
      </div>

      {chore.rejection_note ? (
        <p className="mt-3 rounded-2xl bg-rose-100/90 px-3 py-2 text-sm text-rose-800">
          Parent note: {chore.rejection_note}
        </p>
      ) : null}

      {rollingProgress ? (
        <div className="mt-3 rounded-[22px] bg-white/10 px-3 py-3 text-sm text-slate-100">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold">{rollingProgress.progressLabel}</p>
            <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-teal-100">
              {progressPercent}%
            </span>
          </div>
          <div className="progress-rail mt-3">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          {rollingProgress.missedLabel ? (
            <p className="mt-1 text-rose-200">
              {rollingProgress.missedLabel} - not eligible for the full reward yet
            </p>
          ) : (
            <p className="mt-1 text-teal-100">
              Add one photo on each required day to finish this rolling chore.
            </p>
          )}
          <div className="pill-track mt-3">
            {rollingProgress.requiredDates.map((date) => {
              const isDone = rollingProgress.completedDates.includes(date);
              const isMissed = rollingProgress.missedDates.includes(date);
              const pillClass = isDone
                ? "day-pill day-pill-done"
                : isMissed
                  ? "day-pill day-pill-missed"
                  : "day-pill day-pill-open";
              const label = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
                weekday: "short",
                month: "numeric",
                day: "numeric",
              });
              return (
                <span key={date} className={pillClass}>
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {photoDraft ? (
        <img
          alt={`${chore.title} preview`}
          className="mt-3 h-44 w-full rounded-[22px] object-cover ring-2 ring-white/16"
          src={photoDraft}
        />
      ) : proofEntries[0] ? (
        <img
          alt={`${chore.title} proof`}
          className="mt-3 h-44 w-full rounded-[22px] object-cover ring-2 ring-white/16"
          src={proofEntries[proofEntries.length - 1]?.photo_url ?? proofEntries[0].photo_url}
        />
      ) : null}

      <input
        ref={(node) => {
          onRegisterFileInput(chore.id, node);
        }}
        accept="image/*"
        capture="environment"
        className="hidden"
        type="file"
        onChange={(event) => {
          void onPhotoSelect(chore.id, event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />

      <div className="mt-4 space-y-2">
        <button
          className="w-full rounded-2xl bg-gradient-to-r from-[#ffd27d] to-[#ffae84] px-4 py-4 text-base font-black text-slate-950 shadow-lg shadow-orange-950/10"
          onClick={() => onOpenCamera(chore.id)}
          type="button"
        >
          {rollingProgress ? "Take Completion Photo" : "Take Completion Photo"}
        </button>

        {photoDraft ? (
          <div className="rounded-[18px] bg-white px-3 py-2 text-sm font-bold text-slate-800">
            Photo ready to attach
          </div>
        ) : null}

        {chore.chore_kind === "rolling" ? (
          <>
            <button
              className={`w-full rounded-2xl px-4 py-4 text-base font-black ${
                photoDraft
                  ? "bg-gradient-to-r from-[#68e0b6] to-[#76d7ff] text-slate-950"
                  : "bg-white/12 text-slate-200"
              }`}
              onClick={() => handleRollingProofAction(chore, photoDraft, onRollingProof, onSetMessage)}
              type="button"
            >
              Save today&apos;s check-in
            </button>
            <button
              className={`w-full rounded-2xl px-4 py-4 text-base font-black ${
                rollingProgress?.isEligible
                  ? "bg-white text-slate-950"
                  : "bg-white/12 text-slate-200"
              }`}
              onClick={() => onRollingSubmit(chore)}
              type="button"
            >
              Submit rolling chore for approval
            </button>
            {todayPhotoExists ? (
              <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-teal-100">
                Today&apos;s proof is already saved
              </p>
            ) : null}
          </>
        ) : (
          <button
            className={`w-full rounded-2xl px-4 py-4 text-base font-black ${
              photoDraft
                ? "bg-gradient-to-r from-[#68e0b6] to-[#76d7ff] text-slate-950"
                : "bg-white/12 text-slate-200"
            }`}
            onClick={() => onStandardSubmit(chore)}
            type="button"
          >
            Submit chore
          </button>
        )}
      </div>

      {message ? (
        <p className="mt-3 rounded-2xl bg-white/12 px-3 py-2 text-sm font-bold text-white">
          {message}
        </p>
      ) : null}
    </article>
  );
}

function handleRollingProofAction(
  chore: Chore,
  photoDraft: string | null,
  onRollingProof: (chore: Chore) => void,
  onSetMessage: (choreId: string, message: string | null) => void,
) {
  if (!photoDraft) {
    onSetMessage(chore.id, "Please take a photo before submitting this chore.");
    return;
  }

  onRollingProof(chore);
}

function ReadOnlyChoreCard({
  chore,
  subtitle,
}: {
  chore: Chore;
  subtitle: string;
}) {
  const status = getComputedStatus(chore);
  const rollingProgress = chore.chore_kind === "rolling" ? getRollingProgress(chore) : null;
  const progressPercent = rollingProgress
    ? Math.min(
        100,
        Math.round(
          (rollingProgress.completedDates.length /
            Math.max(rollingProgress.requiredDates.length, 1)) *
            100,
        ),
      )
    : 0;

  return (
    <article className="child-card rounded-[26px] border border-white/18 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-white">{chore.title}</p>
          <p className="mt-1 text-sm text-slate-200">{subtitle}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-3 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
        <p>{formatCurrency(chore.amount_cents)}</p>
        <p>
          {chore.chore_kind === "rolling"
            ? rollingProgress?.progressLabel
            : `Submitted ${formatShortDateTime(chore.submitted_at)}`}
        </p>
      </div>
      {rollingProgress ? (
        <div className="mt-3">
          <div className="progress-rail">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ChildSection({
  title,
  emptyCopy,
  children,
}: {
  title: string;
  emptyCopy: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <section>
      <div className="section-head mb-3 flex items-center justify-between rounded-[22px] px-4 py-3">
        <h3 className="font-mono text-xl font-black text-white sm:text-2xl">{title}</h3>
        <span className="rounded-full bg-white/12 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white">
          {items.length}
        </span>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? <EmptyState copy={emptyCopy} /> : children}
      </div>
    </section>
  );
}

function SummaryCard({
  accent,
  label,
  value,
  copy,
}: {
  accent: string;
  label: string;
  value: string;
  copy: string;
}) {
  return (
    <div className={`metric-card glass-card rounded-[26px] bg-gradient-to-br ${accent} p-4`}>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-slate-600">
        {label}
      </p>
      <p className="mt-2 font-mono text-3xl font-black text-slate-900">{value}</p>
      <p className="mt-1 max-w-52 text-sm leading-6 text-slate-700">{copy}</p>
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-white/20 bg-white/10 px-4 py-6 text-sm text-slate-200">
      {copy}
    </div>
  );
}
