"use client";

import { useEffect, useRef, useState } from "react";
import { ChoreComposer } from "@/components/parent/chore-composer";
import { ChoreGroup } from "@/components/parent/chore-group";
import {
  addDays,
  getLocalDateKey,
  getWeekdayForDate,
} from "@/components/parent/parent-date-utils";
import {
  EmptyState,
  SummaryCard,
} from "@/components/parent/parent-ui";
import { ReviewCard } from "@/components/parent/review-card";
import { ImageLightbox } from "@/components/image-lightbox";
import { PayoutCalendarModal } from "@/components/payout-calendar-modal";
import { AppIcon } from "@/components/ui-icons";
import {
  formatCurrency,
  formatDate,
  formatDateInput,
} from "@/lib/format";
import {
  formatRepeatDays,
  getComputedStatus,
  getOptionalTemplate,
  getRoutineDraftSchedule,
  isOptionalInstanceChore,
  isOptionalTemplateChore,
} from "@/lib/chore-helpers";
import { formatCentsForDollarInput } from "@/lib/money";
import {
  Chore,
  ChoreDraft,
  CheckIn,
  ChildProfile,
  Payout,
  User,
  WeekdayKey,
} from "@/types/app";

type ParentDashboardProps = {
  currentUser: User;
  childProfiles: ChildProfile[];
  chores: Chore[];
  checkIns: CheckIn[];
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
  choreKind: "one_time",
  resetFrequency: "daily",
  maxCompletionsPerReset: 1,
  manualAvailability: false,
  totalRequiredCompletions: 1,
  payoutRule: "all_or_nothing",
  missBehavior: "fail_period",
  onlyWhenChildPresent: false,
  rrcSchedule: getRoutineDraftSchedule(),
};

export function ParentDashboard({
  currentUser,
  childProfiles,
  chores,
  checkIns,
  payouts,
  onSaveChore,
  onDeleteChore,
  onApprove,
  onReject,
  onMarkPaid,
}: ParentDashboardProps) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isPayoutCalendarOpen, setIsPayoutCalendarOpen] = useState(false);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<ChoreDraft>({
    ...emptyDraft,
    childId: childProfiles[0]?.id ?? "",
  });
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [lightboxImage, setLightboxImage] = useState<{ alt: string; src: string } | null>(null);

  const availableActive = chores.filter((chore) => {
    const status = getComputedStatus(chore, checkIns);
    if (isOptionalInstanceChore(chore)) {
      return status === "rejected";
    }
    return status === "available" || status === "rejected";
  });
  const awaitingApproval = chores.filter(
    (chore) =>
      !isOptionalTemplateChore(chore) && getComputedStatus(chore, checkIns) === "submitted",
  );
  const approvedCompleted = chores.filter(
    (chore) =>
      !isOptionalTemplateChore(chore) && getComputedStatus(chore, checkIns) === "approved",
  );
  const paidChores = chores.filter(
    (chore) => !isOptionalTemplateChore(chore) && getComputedStatus(chore, checkIns) === "paid",
  );
  const missedExpired = chores.filter(
    (chore) =>
      !isOptionalTemplateChore(chore) && getComputedStatus(chore, checkIns) === "expired",
  );
  const totalUnpaidBalance = approvedCompleted.reduce((sum, chore) => sum + chore.amount_cents, 0);
  const recentPayouts = [...payouts]
    .sort((left, right) => right.paid_at.localeCompare(left.paid_at))
    .slice(0, 3);

  function startEdit(chore: Chore) {
    const sourceChore = getOptionalTemplate(chores, chore) ?? chore;
    setIsComposerOpen(true);
    setDraft({
      id: sourceChore.id,
      title: sourceChore.title,
      description: sourceChore.description,
      amount: formatCentsForDollarInput(sourceChore.amount_cents),
      childId: sourceChore.child_id,
      startDate: formatDateInput(sourceChore.start_date),
      dueDate: formatDateInput(sourceChore.due_date),
      recurring: sourceChore.recurring,
      repeatDays: sourceChore.repeat_days_week_a,
      repeatPattern: sourceChore.repeat_pattern,
      repeatDaysWeekA: sourceChore.repeat_days_week_a,
      repeatDaysWeekB: sourceChore.repeat_days_week_b,
      choreKind: sourceChore.chore_kind,
      resetFrequency: sourceChore.reset_frequency,
      maxCompletionsPerReset: sourceChore.max_completions_per_reset,
      manualAvailability: sourceChore.manual_availability,
      totalRequiredCompletions:
        sourceChore.total_required_completions ?? sourceChore.repeat_days_week_a.length ?? 1,
      payoutRule: sourceChore.payout_rule,
      missBehavior: sourceChore.miss_behavior,
      onlyWhenChildPresent: sourceChore.only_when_child_present,
      rrcSchedule: getRoutineDraftSchedule(sourceChore),
    });
  }

  useEffect(() => {
    if (!isComposerOpen || !draft.id) {
      return;
    }

    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [draft.id, isComposerOpen]);

  function resetDraft() {
    setIsComposerOpen(false);
    setDraft({
      ...emptyDraft,
      childId: childProfiles[0]?.id ?? "",
    });
  }

  function setRoutineCycleType(cycleType: ChoreDraft["rrcSchedule"]["cycleType"]) {
    setDraft((current) => {
      const nextCycleType =
        cycleType === "two_week_custody_block" || cycleType === "one_month_block"
          ? cycleType
          : "weekly";
      const currentStartDate =
        current.startDate || current.rrcSchedule.custodyPattern?.baseWeekendStartDate || "";
      const currentOffsets = [...(current.rrcSchedule.requiredDateOffsets ?? [])].sort(
        (left, right) => left - right,
      );

      return {
        ...current,
        recurring: true,
        repeatPattern: nextCycleType === "two_week_custody_block" ? "biweekly" : "weekly",
        repeatDays:
          nextCycleType === "weekly" ? current.rrcSchedule.requiredDays : [],
        repeatDaysWeekA:
          nextCycleType === "weekly" ? current.rrcSchedule.requiredDays : [],
        repeatDaysWeekB: [],
        startDate: nextCycleType === "weekly" ? "" : currentStartDate,
        rrcSchedule: {
          ...current.rrcSchedule,
          cycleType: nextCycleType,
          weekStartsOn: "sunday",
          requiredDateOffsets: nextCycleType === "weekly" ? [] : currentOffsets,
          blockWeeks: [],
          custodyPattern:
            nextCycleType === "weekly"
              ? null
              : {
                  baseWeekendStartDate: currentStartDate || null,
                  weekdayDays: [],
                  alternatingWeekendDays: [],
                },
          requiredDays:
            nextCycleType === "weekly" ? current.rrcSchedule.requiredDays : [],
        },
      };
    });
  }

  function getRoutineCalendarStart() {
    return draft.startDate || draft.rrcSchedule.custodyPattern?.baseWeekendStartDate || "";
  }

  function getRoutineRequiredOffsets() {
    return [...(draft.rrcSchedule.requiredDateOffsets ?? [])].sort((left, right) => left - right);
  }

  function getBlockWeeksFromOffsets(
    offsets: number[],
    blockStart = getRoutineCalendarStart(),
    cycleType = draft.rrcSchedule.cycleType,
  ) {
    if (cycleType === "weekly") {
      return [];
    }

    if (!blockStart) {
      return [];
    }

    const buckets = new Map<number, WeekdayKey[]>();
    offsets.forEach((offset) => {
      const weekIndex = Math.floor(offset / 7);
      const weekday = getWeekdayForDate(addDays(blockStart, offset));
      const currentDays = buckets.get(weekIndex) ?? [];
      if (!currentDays.includes(weekday)) {
        currentDays.push(weekday);
      }
      buckets.set(weekIndex, currentDays);
    });

    return Array.from(buckets.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([, weekdays]) => weekdays);
  }

  function toggleRoutineSimpleDay(day: WeekdayKey) {
    setDraft((current) => {
      if (current.rrcSchedule.cycleType !== "weekly") {
        return current;
      }

      const requiredDays = current.rrcSchedule.requiredDays.includes(day)
        ? current.rrcSchedule.requiredDays.filter((entry) => entry !== day)
        : [...current.rrcSchedule.requiredDays, day];

      return {
        ...current,
        recurring: true,
        repeatDays: requiredDays,
        repeatDaysWeekA: requiredDays,
        repeatDaysWeekB: [],
        repeatPattern: "weekly",
        rrcSchedule: {
          ...current.rrcSchedule,
          requiredDays,
          requiredDateOffsets: [],
          blockWeeks: [],
        },
      };
    });
  }

  function applyRoutineBlockCalendarDates(startDate: string, offsets: number[]) {
    setDraft((current) => {
      if (current.rrcSchedule.cycleType === "weekly") {
        return current;
      }

      const nextOffsets = [...offsets];
      nextOffsets.sort((left, right) => left - right);

      return {
        ...current,
        recurring: true,
        repeatDays: [],
        repeatDaysWeekA: [],
        repeatDaysWeekB: [],
        repeatPattern:
          current.rrcSchedule.cycleType === "two_week_custody_block" ? "biweekly" : "weekly",
        startDate,
        rrcSchedule: {
          ...current.rrcSchedule,
          requiredDays: [],
          requiredDateOffsets: nextOffsets,
          blockWeeks: getBlockWeeksFromOffsets(
            nextOffsets,
            startDate,
            current.rrcSchedule.cycleType,
          ),
          custodyPattern: {
            ...(current.rrcSchedule.custodyPattern ?? {
              baseWeekendStartDate: null,
              weekdayDays: [],
              alternatingWeekendDays: [],
            }),
            baseWeekendStartDate: startDate,
          },
        },
      };
    });
  }

  function clearRoutineBlockCalendar() {
    setDraft((current) => ({
      ...current,
      startDate: "",
      repeatDays: current.rrcSchedule.cycleType === "weekly" ? current.repeatDays : [],
      repeatDaysWeekA:
        current.rrcSchedule.cycleType === "weekly" ? current.repeatDaysWeekA : [],
      repeatDaysWeekB: [],
      rrcSchedule: {
        ...current.rrcSchedule,
        requiredDateOffsets: [],
        blockWeeks: [],
        custodyPattern:
          current.rrcSchedule.cycleType === "weekly"
            ? current.rrcSchedule.custodyPattern
            : {
                ...(current.rrcSchedule.custodyPattern ?? {
                  baseWeekendStartDate: null,
                  weekdayDays: [],
                  alternatingWeekendDays: [],
                }),
                baseWeekendStartDate: null,
              },
      },
    }));
  }

  function getScheduleSummary() {
    if (draft.choreKind === "optional") {
      const scheduleLabel =
        draft.rrcSchedule.cycleType === "two_week_custody_block"
          ? `Two-week block dates selected: ${getRoutineRequiredOffsets().length}.`
          : draft.rrcSchedule.cycleType === "one_month_block"
            ? `One-month block dates selected: ${getRoutineRequiredOffsets().length}.`
            : `Available on ${formatRepeatDays(draft.rrcSchedule.requiredDays)}.`;
      const resetLabel =
        draft.resetFrequency === "daily" ? "Available once per day. Resets tomorrow." : "Available once per week. Resets next week.";

      return `${resetLabel} ${scheduleLabel} Optional days do not affect streaks.`;
    }

    if (draft.choreKind === "routine") {
      if (draft.rrcSchedule.cycleType === "two_week_custody_block") {
        const baseDate = getRoutineCalendarStart()
          ? formatDate(getRoutineCalendarStart())
          : "the selected block start date";
        return `Two-week block anchored to ${baseDate}. Required dates selected: ${getRoutineRequiredOffsets().length}. Missing a required date breaks the block until the next block start.`;
      }

      if (draft.rrcSchedule.cycleType === "one_month_block") {
        const baseDate = getRoutineCalendarStart()
          ? formatDate(getRoutineCalendarStart())
          : "the selected block start date";
        return `One-month block anchored to ${baseDate}. Required dates selected: ${getRoutineRequiredOffsets().length}. Missing a required date breaks the block until the next block start.`;
      }

      return `Weekly cycle runs Sunday through Saturday. Required days: ${formatRepeatDays(
        draft.rrcSchedule.requiredDays,
      )}. Missing a required day breaks the cycle until next Sunday.`;
    }

    return draft.dueDate
      ? `One-time chore due ${formatDate(draft.dueDate)}. Reward is available after parent approval.`
      : "One-time chore. Reward is available after parent approval.";
  }

  function submitDraft() {
    if (!draft.title.trim() || !draft.amount || !draft.childId) {
      return;
    }

    if (
      (draft.choreKind === "routine" || draft.choreKind === "optional") &&
      draft.rrcSchedule.cycleType !== "weekly" &&
      (!getRoutineCalendarStart() || getRoutineRequiredOffsets().length === 0)
    ) {
      return;
    }

    onSaveChore(draft);
    resetDraft();
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard accent="from-[#fff0cb] via-[#f1d790] to-[#fff9e8]" icon="seed" label="Approved, Unpaid" value={formatCurrency(totalUnpaidBalance)} copy="Approved rewards waiting for payment" />
        <SummaryCard accent="from-[#e4efd8] via-[#c9dfb4] to-[#fbf8ea]" icon="leaf" label="Pending Review" value={String(awaitingApproval.length)} copy="Submitted chores waiting for approval" />
        <SummaryCard accent="from-[#f4e5bd] via-[#dfc06a] to-[#fff8df]" icon="sprout" label="Payment History" value={String(payouts.length)} copy="Completed payments on record" />
      </section>

      <section className="space-y-4">
        <div className="panel-strong mode-frame rounded-[32px] p-5 text-white sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="section-kicker kicker-row">
                <span className="kicker-icon"><AppIcon className="h-4 w-4" name="sprout" /></span>
                Parent garden
              </div>
              <h2 className="mt-2 font-mono text-3xl font-black">Manage chores for {currentUser.name}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-200">
                Create chores, review submissions, and keep rewards and payments clear.
              </p>
            </div>
            <span className="label-chip label-chip-light">Parent manages approvals and payments</span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <ChoreComposer
              childProfiles={childProfiles}
              composerRef={composerRef}
              draft={draft}
              isComposerOpen={isComposerOpen}
              routineCalendarStart={getRoutineCalendarStart()}
              routineRequiredOffsets={getRoutineRequiredOffsets()}
              scheduleSummary={getScheduleSummary()}
              onClearRoutineBlockCalendar={clearRoutineBlockCalendar}
              onResetDraft={resetDraft}
              onSetComposerOpen={setIsComposerOpen}
              onSetDraft={setDraft}
              onApplyRoutineBlockCalendarDates={applyRoutineBlockCalendarDates}
              onSetRoutineCycleType={setRoutineCycleType}
              onSubmitDraft={submitDraft}
              onToggleRoutineSimpleDay={toggleRoutineSimpleDay}
            />

            <div className="space-y-4">
              <div className="section-shell rounded-[30px] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="kicker-row text-slate-500">
                    <span className="kicker-icon"><AppIcon className="h-4 w-4" name="check" /></span>
                    Awaiting approval
                  </div>
                  <span className="stat-chip stat-chip-soft">{awaitingApproval.length} submitted</span>
                </div>
                <div className="space-y-3">
                  {awaitingApproval.length === 0 ? (
                    <EmptyState copy="No chores are waiting for review right now." />
                  ) : (
                    awaitingApproval.map((chore) => (
                      <ReviewCard key={chore.id} checkIns={checkIns} childName={childProfiles.find((child) => child.id === chore.child_id)?.name ?? "Unknown"} chore={chore} chores={chores} isRejecting={rejectingId === chore.id} onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })} rejectionNote={rejectionNote} onApprove={onApprove} onReject={onReject} onRejectingChange={setRejectingId} onRejectionNoteChange={setRejectionNote} />
                    ))
                  )}
                </div>
              </div>

              <div className="section-shell rounded-[30px] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="kicker-row text-slate-500">
                    <span className="kicker-icon"><AppIcon className="h-4 w-4" name="seed" /></span>
                    Record payments
                  </div>
                  <span className="stat-chip stat-chip-soft">Manual payment</span>
                </div>
                <p className="text-sm leading-6 text-slate-700">Send money outside the app, then record the payment here so history stays accurate.</p>
                <textarea className="field-surface mt-3 min-h-22 w-full rounded-2xl px-4 py-3 text-sm text-slate-900" placeholder="Optional payment note" value={payoutNotes} onChange={(event) => setPayoutNotes(event.target.value)} />
                <button className="action-button mt-3 w-full rounded-2xl bg-gradient-to-r from-[#6f9a52] to-[#d4ad4f] px-5 py-4 text-base font-black text-[#231d16] shadow-lg shadow-[#3d2b12]/14" onClick={() => { const primaryChild = childProfiles[0]; if (primaryChild) { onMarkPaid(primaryChild.id, payoutNotes); setPayoutNotes(""); } }} type="button">
                  Record payment
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChoreGroup allChores={chores} checkIns={checkIns} chores={availableActive} childProfiles={childProfiles} onDeleteChore={onDeleteChore} onEdit={startEdit} onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })} title="Available / active" />
          <ChoreGroup allChores={chores} checkIns={checkIns} chores={approvedCompleted} childProfiles={childProfiles} onDeleteChore={onDeleteChore} onEdit={startEdit} onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })} title="Approved / completed" />
          <ChoreGroup allChores={chores} checkIns={checkIns} chores={missedExpired} childProfiles={childProfiles} onDeleteChore={onDeleteChore} onEdit={startEdit} onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })} title="Missed / expired" />
        </div>

        <div className="section-shell rounded-[30px] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="kicker-row text-slate-500">
                <span className="kicker-icon"><AppIcon className="h-4 w-4" name="seed" /></span>
                Payment history
              </div>
              <h3 className="mt-2 font-mono text-2xl font-black text-slate-900">Paid rewards history</h3>
            </div>
            <span className="stat-chip stat-chip-soft">{formatCurrency(payouts.reduce((sum, payout) => sum + payout.amount_cents, 0))}</span>
          </div>
          <div className="space-y-3">
            {recentPayouts.length === 0 ? <EmptyState copy="No payments have been recorded yet." /> : recentPayouts.map((payout) => {
              const payoutChores = chores.filter(
                (chore) =>
                  chore.child_id === payout.child_id &&
                  chore.status === "paid" &&
                  chore.paid_at === payout.paid_at,
              );

              return (
                <article key={payout.id} className="card-spotlight rounded-[24px] border border-[#d9c075]/45 bg-gradient-to-br from-[#fff8e6] to-white p-4 shadow-[0_16px_30px_rgba(48,35,18,0.08)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="support-label">Recent payment</p>
                      <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-900">{formatCurrency(payout.amount_cents)}</p>
                      <p className="text-sm text-slate-600">{formatDate(getLocalDateKey(payout.paid_at))}</p>
                    </div>
                    <span className="stat-chip stat-chip-soft">{payout.paid_method}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {payoutChores.length} chore{payoutChores.length === 1 ? "" : "s"} paid
                  </p>
                  {payout.notes ? <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600">{payout.notes}</p> : null}
                </article>
              );
            })}
          </div>
          <button className="action-button mt-4 w-full rounded-2xl bg-gradient-to-r from-[#6f9a52] to-[#d4ad4f] px-5 py-4 text-base font-black text-[#231d16] shadow-lg shadow-[#3d2b12]/14" onClick={() => setIsPayoutCalendarOpen(true)} type="button">
            View payment calendar
          </button>
        </div>
      </section>
      {lightboxImage ? (
        <ImageLightbox alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} src={lightboxImage.src} />
      ) : null}
      {isPayoutCalendarOpen ? (
        <PayoutCalendarModal
          checkIns={checkIns}
          chores={paidChores}
          payouts={payouts}
          onClose={() => setIsPayoutCalendarOpen(false)}
        />
      ) : null}
    </div>
  );
}
