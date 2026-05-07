"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status-badge";
import {
  formatCurrency,
  formatDate,
  formatDateInput,
  formatShortDateTime,
} from "@/lib/format";
import {
  formatRepeatDays,
  formatRepeatSchedule,
  getComputedStatus,
  getProofEntries,
  getRollingProgress,
  weekdayOptions,
} from "@/lib/chore-helpers";
import {
  Chore,
  ChoreDraft,
  ChildProfile,
  Payout,
  RepeatPattern,
  User,
  WeekdayKey,
} from "@/lib/chorepay-types";

type ParentDashboardProps = {
  currentUser: User;
  childProfiles: ChildProfile[];
  chores: Chore[];
  payouts: Payout[];
  onSaveChore: (draft: ChoreDraft) => void;
  onDeleteChore: (choreId: string) => void;
  onApprove: (choreId: string) => void;
  onReject: (choreId: string, note: string) => void;
  onMarkPaid: (childId: string, notes: string) => void;
};

const emptyDraft: ChoreDraft = {
  title: "",
  description: "",
  amount: "",
  childId: "",
  startDate: "",
  dueDate: "",
  recurring: false,
  repeatDays: [],
  repeatPattern: "weekly",
  repeatDaysWeekA: [],
  repeatDaysWeekB: [],
  choreKind: "standard",
};

export function ParentDashboard({
  currentUser,
  childProfiles,
  chores,
  payouts,
  onSaveChore,
  onDeleteChore,
  onApprove,
  onReject,
  onMarkPaid,
}: ParentDashboardProps) {
  const [draft, setDraft] = useState<ChoreDraft>({
    ...emptyDraft,
    childId: childProfiles[0]?.id ?? "",
  });
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");

  const availableActive = chores.filter((chore) => {
    const status = getComputedStatus(chore);
    return status === "available" || status === "rejected";
  });
  const awaitingApproval = chores.filter((chore) => getComputedStatus(chore) === "submitted");
  const approvedCompleted = chores.filter((chore) => getComputedStatus(chore) === "approved");
  const paidChores = chores.filter((chore) => getComputedStatus(chore) === "paid");
  const missedExpired = chores.filter((chore) => getComputedStatus(chore) === "expired");

  const totalUnpaidBalance = approvedCompleted.reduce(
    (sum, chore) => sum + chore.amount_cents,
    0,
  );

  function startEdit(chore: Chore) {
    setDraft({
      id: chore.id,
      title: chore.title,
      description: chore.description,
      amount: (chore.amount_cents / 100).toFixed(2),
      childId: chore.child_id,
      startDate: formatDateInput(chore.start_date),
      dueDate: formatDateInput(chore.due_date),
      recurring: chore.recurring,
      repeatDays: chore.repeat_days_week_a,
      repeatPattern: chore.repeat_pattern,
      repeatDaysWeekA: chore.repeat_days_week_a,
      repeatDaysWeekB: chore.repeat_days_week_b,
      choreKind: chore.chore_kind,
    });
  }

  function resetDraft() {
    setDraft({
      ...emptyDraft,
      childId: childProfiles[0]?.id ?? "",
    });
  }

  function toggleRepeatDay(day: WeekdayKey, week: "a" | "b" = "a") {
    setDraft((current) => ({
      ...current,
      recurring: true,
      repeatDays:
        week === "a"
          ? current.repeatDays.includes(day)
            ? current.repeatDays.filter((entry) => entry !== day)
            : [...current.repeatDays, day]
          : current.repeatDays,
      repeatDaysWeekA:
        week === "a"
          ? current.repeatDaysWeekA.includes(day)
            ? current.repeatDaysWeekA.filter((entry) => entry !== day)
            : [...current.repeatDaysWeekA, day]
          : current.repeatDaysWeekA,
      repeatDaysWeekB:
        week === "b"
          ? current.repeatDaysWeekB.includes(day)
            ? current.repeatDaysWeekB.filter((entry) => entry !== day)
            : [...current.repeatDaysWeekB, day]
          : current.repeatDaysWeekB,
    }));
  }

  function setRepeatPattern(pattern: RepeatPattern) {
    setDraft((current) => ({
      ...current,
      recurring: true,
      repeatPattern: pattern,
      repeatDays: current.repeatDaysWeekA,
      repeatDaysWeekB: pattern === "weekly" ? [] : current.repeatDaysWeekB,
    }));
  }

  function applyCustodyPreset() {
    const weekADays: WeekdayKey[] = [
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    const weekBDays: WeekdayKey[] = ["wednesday", "thursday"];

    setDraft((current) => ({
      ...current,
      recurring: true,
      repeatPattern: "biweekly",
      repeatDays: weekADays,
      repeatDaysWeekA: weekADays,
      repeatDaysWeekB: weekBDays,
    }));
  }

  function submitDraft() {
    if (!draft.title.trim() || !draft.amount || !draft.childId) {
      return;
    }

    onSaveChore(draft);
    resetDraft();
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          accent="from-[#ffe0a8] via-[#ffd38f] to-[#fff4d7]"
          label="Unpaid balance"
          value={formatCurrency(totalUnpaidBalance)}
          copy="Approved money waiting on manual payout"
        />
        <SummaryCard
          accent="from-[#baf6ee] via-[#93ece0] to-[#dbfffb]"
          label="Awaiting review"
          value={String(awaitingApproval.length)}
          copy="Chores waiting for a parent decision"
        />
        <SummaryCard
          accent="from-[#ffd0dd] via-[#ffc0d1] to-[#fff0f6]"
          label="Paid records"
          value={String(payouts.length)}
          copy="Logged payout events kept in history"
        />
      </section>

      <section className="space-y-4">
        <div className="panel-strong mode-frame rounded-[32px] p-5 text-white sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase section-label text-slate-100">
                Parent workspace
              </p>
              <h2 className="mt-2 font-mono text-3xl font-black">
                Manage chores for {currentUser.name}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-200">
                Build standard chores or rolling chores, choose weekly or every-other-week timing,
                and keep approvals easy to review.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="sticker-chip quiet-chip text-white">Create chores</span>
                <span className="sticker-chip quiet-chip text-white">Review proof</span>
                <span className="sticker-chip quiet-chip text-white">Mark paid</span>
              </div>
            </div>
            <span className="rounded-full bg-white/12 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white">
              Parent controls all money values
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[28px] bg-white/10 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-mono text-xl font-black">
                  {draft.id ? "Edit chore" : "Create a chore"}
                </h3>
                {draft.id ? (
                  <button
                    className="rounded-full bg-white/12 px-3 py-2 text-sm font-black text-white"
                    onClick={resetDraft}
                    type="button"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className={`rounded-2xl px-4 py-3 text-left text-sm font-black ${
                      draft.choreKind === "standard"
                        ? "bg-white text-slate-950"
                        : "bg-white/12 text-white"
                    }`}
                    onClick={() =>
                      setDraft((current) => ({ ...current, choreKind: "standard" }))
                    }
                    type="button"
                  >
                    Standard chore
                  </button>
                  <button
                    className={`rounded-2xl px-4 py-3 text-left text-sm font-black ${
                      draft.choreKind === "rolling"
                        ? "bg-white text-slate-950"
                        : "bg-white/12 text-white"
                    }`}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        choreKind: "rolling",
                        recurring: true,
                      }))
                    }
                    type="button"
                  >
                    Rolling chore
                  </button>
                </div>

                <InputLabel dark label="Title">
                  <input
                    className="field-surface w-full rounded-2xl px-4 py-3 text-base text-slate-900"
                    placeholder="Keep room clean all week"
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                </InputLabel>

                <InputLabel dark label="Description">
                  <textarea
                    className="field-surface min-h-24 w-full rounded-2xl px-4 py-3 text-base text-slate-900"
                    placeholder="Quick note about what done looks like"
                    value={draft.description}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </InputLabel>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InputLabel dark label="Dollar amount">
                    <input
                      className="field-surface w-full rounded-2xl px-4 py-3 text-base text-slate-900"
                      min="0"
                      placeholder="10.00"
                      step="0.01"
                      type="number"
                      value={draft.amount}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, amount: event.target.value }))
                      }
                    />
                  </InputLabel>
                  <InputLabel dark label="Assigned child">
                    <select
                      className="field-surface w-full rounded-2xl px-4 py-3 text-base text-slate-900"
                      value={draft.childId}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, childId: event.target.value }))
                      }
                    >
                      {childProfiles.map((child) => (
                        <option key={child.id} value={child.id}>
                          {child.name}
                        </option>
                      ))}
                    </select>
                  </InputLabel>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InputLabel
                    dark
                    label={draft.choreKind === "rolling" ? "Start date" : "Available from"}
                  >
                    <input
                      className="field-surface w-full rounded-2xl px-4 py-3 text-base text-slate-900"
                      type="date"
                      value={draft.startDate}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, startDate: event.target.value }))
                      }
                    />
                  </InputLabel>
                  <InputLabel
                    dark
                    label={draft.choreKind === "rolling" ? "End date" : "Due date"}
                  >
                    <input
                      className="field-surface w-full rounded-2xl px-4 py-3 text-base text-slate-900"
                      type="date"
                      value={draft.dueDate}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, dueDate: event.target.value }))
                      }
                    />
                  </InputLabel>
                </div>

                <label className="rounded-2xl bg-white/12 px-4 py-3 text-sm font-bold text-white">
                  <span className="mb-2 block">Repeat days</span>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-200">
                      Pick the days this chore counts on your real schedule
                    </span>
                    <input
                      checked={draft.recurring}
                      className="h-5 w-5 accent-[#58c8bd]"
                      type="checkbox"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          recurring: event.target.checked,
                          repeatDays: event.target.checked ? current.repeatDaysWeekA : [],
                          repeatDaysWeekA: event.target.checked ? current.repeatDaysWeekA : [],
                          repeatDaysWeekB: event.target.checked ? current.repeatDaysWeekB : [],
                        }))
                      }
                    />
                  </div>

                  {draft.recurring ? (
                    <div className="mt-3 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.18em] ${
                            draft.repeatPattern === "weekly"
                              ? "bg-[#6de3d8] text-slate-950"
                              : "bg-white/10 text-white"
                          }`}
                          onClick={() => setRepeatPattern("weekly")}
                          type="button"
                        >
                          Same every week
                        </button>
                        <button
                          className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.18em] ${
                            draft.repeatPattern === "biweekly"
                              ? "bg-[#6de3d8] text-slate-950"
                              : "bg-white/10 text-white"
                          }`}
                          onClick={() => setRepeatPattern("biweekly")}
                          type="button"
                        >
                          Alternate every 2 weeks
                        </button>
                        <button
                          className="rounded-full bg-white/12 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-white"
                          onClick={applyCustodyPreset}
                          type="button"
                        >
                          Use my Wed Thu + every other Fri Sun schedule
                        </button>
                      </div>

                      <RepeatWeekPicker
                        days={draft.repeatDaysWeekA}
                        label={draft.repeatPattern === "biweekly" ? "Week A" : "Weekly schedule"}
                        onToggle={(day) => toggleRepeatDay(day, "a")}
                      />

                      {draft.repeatPattern === "biweekly" ? (
                        <RepeatWeekPicker
                          accent="warm"
                          days={draft.repeatDaysWeekB}
                          label="Week B"
                          onToggle={(day) => toggleRepeatDay(day, "b")}
                        />
                      ) : null}

                      <p className="text-sm text-slate-200">
                        {draft.repeatPattern === "biweekly"
                          ? `Week A: ${formatRepeatDays(draft.repeatDaysWeekA)} | Week B: ${formatRepeatDays(draft.repeatDaysWeekB)}`
                          : formatRepeatDays(draft.repeatDaysWeekA)}
                      </p>
                    </div>
                  ) : null}
                </label>

                {draft.choreKind === "rolling" ? (
                  <div className="rounded-2xl bg-white/12 px-4 py-3 text-sm text-slate-200">
                    Rolling chores require a photo check-in on each selected day before they can
                    be submitted for final approval.
                  </div>
                ) : null}

                <button
                  className="w-full rounded-2xl bg-gradient-to-r from-[#ffcf7c] via-[#ffbd72] to-[#ff9e85] px-5 py-4 text-base font-black text-slate-950 shadow-lg shadow-orange-900/15"
                  onClick={submitDraft}
                  type="button"
                >
                  {draft.id ? "Save changes" : "Create chore"}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="panel-soft rounded-[30px] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-mono text-xl font-black text-slate-900">
                    Awaiting approval
                  </h3>
                  <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-amber-800">
                    {awaitingApproval.length} submitted
                  </span>
                </div>

                <div className="space-y-3">
                  {awaitingApproval.length === 0 ? (
                    <EmptyState copy="No chores are waiting for review right now." />
                  ) : (
                    awaitingApproval.map((chore) => (
                      <ReviewCard
                        key={chore.id}
                        childName={
                          childProfiles.find((child) => child.id === chore.child_id)?.name ??
                          "Unknown"
                        }
                        chore={chore}
                        isRejecting={rejectingId === chore.id}
                        rejectionNote={rejectionNote}
                        onApprove={onApprove}
                        onReject={onReject}
                        onRejectingChange={setRejectingId}
                        onRejectionNoteChange={setRejectionNote}
                      />
                    ))
                  )}
                </div>
              </div>

              <div className="panel-soft rounded-[30px] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-mono text-xl font-black text-slate-900">
                    Mark balance paid
                  </h3>
                  <span className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-sky-800">
                    Manual payout
                  </span>
                </div>
                <p className="text-sm leading-6 text-slate-700">
                  Send money outside the app, then log it here so the history stays intact.
                </p>
                <textarea
                  className="field-surface mt-3 min-h-22 w-full rounded-2xl px-4 py-3 text-sm text-slate-900"
                  placeholder="Optional payout note"
                  value={payoutNotes}
                  onChange={(event) => setPayoutNotes(event.target.value)}
                />
                <button
                  className="mt-3 w-full rounded-2xl bg-gradient-to-r from-[#65d2d1] to-[#71aef8] px-5 py-4 text-base font-black text-slate-950 shadow-lg shadow-sky-900/10"
                  onClick={() => {
                    const primaryChild = childProfiles[0];
                    if (primaryChild) {
                      onMarkPaid(primaryChild.id, payoutNotes);
                      setPayoutNotes("");
                    }
                  }}
                  type="button"
                >
                  Mark balance as paid
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChoreGroup
            chores={availableActive}
            childProfiles={childProfiles}
            onDeleteChore={onDeleteChore}
            onEdit={startEdit}
            title="Available / active"
          />
          <ChoreGroup
            chores={approvedCompleted}
            childProfiles={childProfiles}
            onDeleteChore={onDeleteChore}
            onEdit={startEdit}
            title="Approved / completed"
          />
          <ChoreGroup
            chores={paidChores}
            childProfiles={childProfiles}
            onDeleteChore={onDeleteChore}
            onEdit={startEdit}
            title="Paid"
          />
          <ChoreGroup
            chores={missedExpired}
            childProfiles={childProfiles}
            onDeleteChore={onDeleteChore}
            onEdit={startEdit}
            title="Missed / expired"
          />
        </div>

        <div className="panel-soft rounded-[30px] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-mono text-2xl font-black text-slate-900">Payout history</h3>
            <span className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-sky-700">
              {formatCurrency(payouts.reduce((sum, payout) => sum + payout.amount_cents, 0))}
            </span>
          </div>

          <div className="space-y-3">
            {payouts.length === 0 ? (
              <EmptyState copy="No payouts have been recorded yet." />
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
                    <span className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-sky-800">
                      Paid
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {childProfiles.find((child) => child.id === payout.child_id)?.name} •{" "}
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
      </section>
    </div>
  );
}

function ReviewCard({
  chore,
  childName,
  isRejecting,
  rejectionNote,
  onApprove,
  onReject,
  onRejectingChange,
  onRejectionNoteChange,
}: {
  chore: Chore;
  childName: string;
  isRejecting: boolean;
  rejectionNote: string;
  onApprove: (choreId: string) => void;
  onReject: (choreId: string, note: string) => void;
  onRejectingChange: (value: string | null) => void;
  onRejectionNoteChange: (value: string) => void;
}) {
  const proofEntries = getProofEntries(chore);
  const rollingProgress = chore.chore_kind === "rolling" ? getRollingProgress(chore) : null;

  return (
    <article className="parent-card rounded-[26px] border border-amber-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-slate-900">{chore.title}</p>
          <p className="mt-1 text-sm text-slate-600">
            {formatCurrency(chore.amount_cents)} for {childName}
          </p>
        </div>
        <StatusBadge status={getComputedStatus(chore)} />
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-700">{chore.description}</p>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
        Submitted {formatShortDateTime(chore.submitted_at)}
      </p>

      {rollingProgress ? (
        <div className="mt-3 rounded-[22px] bg-white px-3 py-3 text-sm text-slate-700">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold">{rollingProgress.progressLabel}</p>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-700">
              {Math.min(
                100,
                Math.round(
                  (rollingProgress.completedDates.length /
                    Math.max(rollingProgress.requiredDates.length, 1)) *
                    100,
                ),
              )}
              %
            </span>
          </div>
          <div className="soft-progress-rail mt-3">
            <div
              className="soft-progress-fill"
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    (rollingProgress.completedDates.length /
                      Math.max(rollingProgress.requiredDates.length, 1)) *
                      100,
                  ),
                )}%`,
              }}
            />
          </div>
          {rollingProgress.missedLabel ? (
            <p className="mt-1 text-rose-700">{rollingProgress.missedLabel}</p>
          ) : null}
          <div className="pill-track mt-3">
            {rollingProgress.requiredDates.map((date) => {
              const isDone = rollingProgress.completedDates.includes(date);
              const isMissed = rollingProgress.missedDates.includes(date);
              const pillClass = isDone
                ? "day-pill day-pill-soft-done"
                : isMissed
                  ? "day-pill day-pill-soft-missed"
                  : "day-pill day-pill-soft-open";
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

      {proofEntries.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Proof photos
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {proofEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl border border-slate-100 bg-white p-2 shadow-[0_10px_20px_rgba(44,52,92,0.06)]"
              >
                <img
                  alt={`${chore.title} proof for ${entry.proof_date}`}
                  className="h-32 w-full rounded-xl object-cover"
                  src={entry.photo_url}
                />
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  {entry.proof_date}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isRejecting ? (
        <div className="mt-3 space-y-2">
          <textarea
            className="field-surface min-h-22 w-full rounded-2xl px-4 py-3 text-sm text-slate-900"
            placeholder="Optional note to explain what should change"
            value={rejectionNote}
            onChange={(event) => onRejectionNoteChange(event.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 font-black text-white"
              onClick={() => {
                onReject(chore.id, rejectionNote);
                onRejectingChange(null);
                onRejectionNoteChange("");
              }}
              type="button"
            >
              Confirm reject
            </button>
            <button
              className="rounded-2xl border border-slate-200 px-4 py-3 font-black text-slate-700"
              onClick={() => {
                onRejectingChange(null);
                onRejectionNoteChange("");
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <button
            className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 font-black text-white"
            onClick={() => onApprove(chore.id)}
            type="button"
          >
            Approve
          </button>
          <button
            className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 font-black text-white"
            onClick={() => onRejectingChange(chore.id)}
            type="button"
          >
            Reject
          </button>
        </div>
      )}
    </article>
  );
}

function ChoreGroup({
  title,
  chores,
  childProfiles,
  onEdit,
  onDeleteChore,
}: {
  title: string;
  chores: Chore[];
  childProfiles: ChildProfile[];
  onEdit: (chore: Chore) => void;
  onDeleteChore: (choreId: string) => void;
}) {
  return (
    <div className="panel-soft rounded-[32px] p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-mono text-2xl font-black text-slate-900">{title}</h3>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-slate-600">
          {chores.length}
        </span>
      </div>
      <div className="space-y-3">
        {chores.length === 0 ? (
          <EmptyState copy={`No chores in ${title.toLowerCase()} right now.`} />
        ) : (
          chores.map((chore) => {
            const rollingProgress =
              chore.chore_kind === "rolling" ? getRollingProgress(chore) : null;
            return (
              <article
                key={chore.id}
                className="parent-card rounded-[26px] border border-white/70 p-4 shadow-[0_10px_24px_rgba(56,44,103,0.06)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-900">{chore.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{chore.description}</p>
                  </div>
                  <StatusBadge status={getComputedStatus(chore)} />
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600">
                  <p>{formatCurrency(chore.amount_cents)}</p>
                  <p>
                    {chore.chore_kind === "rolling"
                      ? `Rolling: ${formatRepeatSchedule(chore)}`
                      : `Due ${formatDate(chore.due_date)}`}
                  </p>
                  <p>
                    Assigned to{" "}
                    {childProfiles.find((child) => child.id === chore.child_id)?.name ?? "Unknown"}
                  </p>
                  <p>{rollingProgress ? rollingProgress.progressLabel : formatRepeatSchedule(chore)}</p>
                  {rollingProgress?.missedLabel ? (
                    <p className="text-rose-700">{rollingProgress.missedLabel}</p>
                  ) : null}
                </div>
                {rollingProgress ? (
                  <div className="mt-3">
                    <div className="soft-progress-rail">
                      <div
                        className="soft-progress-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (rollingProgress.completedDates.length /
                                Math.max(rollingProgress.requiredDates.length, 1)) *
                                100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                {chore.rejection_note ? (
                  <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {chore.rejection_note}
                  </p>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <button
                    className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-black text-slate-700"
                    onClick={() => onEdit(chore)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="flex-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-black text-rose-700"
                    onClick={() => onDeleteChore(chore.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function RepeatWeekPicker({
  accent = "cool",
  days,
  label,
  onToggle,
}: {
  accent?: "cool" | "warm";
  days: WeekdayKey[];
  label: string;
  onToggle: (day: WeekdayKey) => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl bg-white/8 p-3">
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-200">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {weekdayOptions.map((day) => (
          <button
            key={day.key}
            className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.18em] ${
              days.includes(day.key)
                ? accent === "cool"
                  ? "bg-[#6de3d8] text-slate-950"
                  : "bg-[#ffd27d] text-slate-950"
                : "bg-white/10 text-white"
            }`}
            onClick={() => onToggle(day.key)}
            type="button"
          >
            {day.short}
          </button>
        ))}
      </div>
    </div>
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

function InputLabel({
  label,
  dark,
  children,
}: {
  label: string;
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className={`text-sm font-bold ${dark ? "text-slate-100" : "text-slate-600"}`}>
        {label}
      </span>
      {children}
    </label>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-sm text-slate-500">
      {copy}
    </div>
  );
}
