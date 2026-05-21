"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ChoreComposer } from "@/components/parent/chore-composer";
import { ChoreGroup } from "@/components/parent/chore-group";
import { PaymentReviewSheet } from "@/components/parent/payment-review-sheet";
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
  PaymentLineItem,
  WeekdayKey,
} from "@/types/app";

type ParentDashboardProps = {
  childProfiles: ChildProfile[];
  chores: Chore[];
  checkIns: CheckIn[];
  householdName?: string | null;
  payouts: Payout[];
  onCreateChild?: (draft: { name: string }) => Promise<{ ok: boolean; message: string }>;
  onRegenerateChildLink?: (childId: string) => Promise<{ ok: boolean; message: string }>;
  onSaveChore: (draft: ChoreDraft) => void;
  onDeleteChore: (choreId: string) => void;
  onApprove: (choreId: string) => void;
  onReject: (choreId: string, note: string) => void;
  onClearCompletedTestData: () => void;
  onOverrideMissedStreak: (choreId: string, missedDate: string, note: string) => void;
  onMarkPaid: (childId: string, notes: string, paymentItems?: PaymentLineItem[]) => void;
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

function getDefaultParentSections() {
  return {
    pendingReview: true,
    approvedAwaitingPayment: true,
    active: false,
    paid: false,
    missed: false,
    paymentHistory: false,
  };
}

export function ParentDashboard({
  childProfiles,
  chores,
  checkIns,
  householdName = null,
  payouts,
  onCreateChild,
  onRegenerateChildLink,
  onSaveChore,
  onDeleteChore,
  onApprove,
  onReject,
  onClearCompletedTestData,
  onOverrideMissedStreak,
  onMarkPaid,
}: ParentDashboardProps) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isPayoutCalendarOpen, setIsPayoutCalendarOpen] = useState(false);
  const [isPaymentReviewOpen, setIsPaymentReviewOpen] = useState(false);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<ChoreDraft>({
    ...emptyDraft,
    childId: childProfiles[0]?.id ?? "",
  });
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [childNameDraft, setChildNameDraft] = useState("");
  const [childSetupMessage, setChildSetupMessage] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string>("all");
  const [qrChildId, setQrChildId] = useState<string | null>(null);
  const [isRegeneratingChildId, setIsRegeneratingChildId] = useState<string | null>(null);
  const [isSavingChild, setIsSavingChild] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") {
      return getDefaultParentSections();
    }

    try {
      const saved = window.sessionStorage.getItem("earned-parent-dashboard-sections");
      return saved ? { ...getDefaultParentSections(), ...JSON.parse(saved) } : getDefaultParentSections();
    } catch {
      return getDefaultParentSections();
    }
  });
  const [lightboxImage, setLightboxImage] = useState<{ alt: string; src: string } | null>(null);

  const selectedChildProfiles =
    selectedChildId === "all"
      ? childProfiles
      : childProfiles.filter((child) => child.id === selectedChildId);
  const selectedChildIds = new Set(selectedChildProfiles.map((child) => child.id));
  const scopedChores =
    selectedChildId === "all"
      ? chores
      : chores.filter((chore) => selectedChildIds.has(chore.child_id));
  const scopedCheckIns =
    selectedChildId === "all"
      ? checkIns
      : checkIns.filter((entry) => selectedChildIds.has(entry.child_id));
  const scopedPayouts =
    selectedChildId === "all"
      ? payouts
      : payouts.filter((payout) => selectedChildIds.has(payout.child_id));
  const heroHouseholdName = householdName?.trim();
  const selectedChildLabel =
    selectedChildId === "all"
      ? "All child profiles"
      : selectedChildProfiles[0]?.name?.trim() || "child profile";

  const availableActive = scopedChores.filter((chore) => {
    const status = getComputedStatus(chore, scopedCheckIns);
    if (isOptionalInstanceChore(chore)) {
      return status === "rejected";
    }
    return status === "available" || status === "rejected";
  });
  const awaitingApproval = scopedChores.filter(
    (chore) =>
      !isOptionalTemplateChore(chore) && getComputedStatus(chore, scopedCheckIns) === "submitted",
  );
  const approvedCompleted = scopedChores.filter(
    (chore) =>
      !isOptionalTemplateChore(chore) && getComputedStatus(chore, scopedCheckIns) === "approved",
  );
  const paidChores = scopedChores.filter(
    (chore) => !isOptionalTemplateChore(chore) && getComputedStatus(chore, scopedCheckIns) === "paid",
  );
  const missedExpired = scopedChores.filter(
    (chore) =>
      !isOptionalTemplateChore(chore) && getComputedStatus(chore, scopedCheckIns) === "expired",
  );
  const totalUnpaidBalance = approvedCompleted.reduce((sum, chore) => sum + chore.amount_cents, 0);
  const clearableProgressCount =
    scopedCheckIns.length +
    scopedPayouts.length +
    scopedChores.filter(
      (chore) =>
        isOptionalInstanceChore(chore) ||
        chore.proof_entries.length > 0 ||
        chore.streak_overrides.length > 0,
    ).length +
    awaitingApproval.length +
    approvedCompleted.length +
    paidChores.length +
    missedExpired.length;
  const recentPayouts = [...scopedPayouts]
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

  useEffect(() => {
    window.sessionStorage.setItem(
      "earned-parent-dashboard-sections",
      JSON.stringify(openSections),
    );
  }, [openSections]);

  function setSectionOpen(sectionId: string, isOpen: boolean) {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: isOpen,
    }));
  }

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
    const childId = draft.childId || childProfiles[0]?.id || "";
    if (!draft.title.trim() || !draft.amount || !childId) {
      return;
    }

    if (
      (draft.choreKind === "routine" || draft.choreKind === "optional") &&
      draft.rrcSchedule.cycleType !== "weekly" &&
      (!getRoutineCalendarStart() || getRoutineRequiredOffsets().length === 0)
    ) {
      return;
    }

    onSaveChore({
      ...draft,
      childId,
    });
    resetDraft();
  }

  async function handleCreateChild() {
    if (!onCreateChild) {
      return;
    }

    setIsSavingChild(true);
    try {
      const result = await onCreateChild({
        name: childNameDraft,
      });
      setChildSetupMessage(result.message);
      if (result.ok) {
        setChildNameDraft("");
      }
    } finally {
      setIsSavingChild(false);
    }
  }

  async function handleRegenerateChildLink(childId: string) {
    if (!onRegenerateChildLink) {
      return;
    }

    setIsRegeneratingChildId(childId);
    try {
      const result = await onRegenerateChildLink(childId);
      setChildSetupMessage(result.message);
    } finally {
      setIsRegeneratingChildId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard accent="from-[#fff0cb] via-[#f1d790] to-[#fff9e8]" icon="seed" label="Approved, Unpaid" value={formatCurrency(totalUnpaidBalance)} copy="Approved rewards waiting for payment" />
        <SummaryCard accent="from-[#e4efd8] via-[#c9dfb4] to-[#fbf8ea]" icon="leaf" label="Pending Review" value={String(awaitingApproval.length)} copy="Submitted chores waiting for approval" />
        <SummaryCard accent="from-[#f4e5bd] via-[#dfc06a] to-[#fff8df]" icon="sprout" label="Payment History" value={String(scopedPayouts.length)} copy="Completed payments on record" />
      </section>

      <section className="space-y-4">
        <div className="panel-strong mode-frame rounded-[32px] p-5 text-white sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="section-kicker kicker-row">
                <span className="kicker-icon"><AppIcon className="h-4 w-4" name="sprout" /></span>
                Parent garden
              </div>
              <h2 className="mt-2 font-mono text-3xl font-black">
                {heroHouseholdName ? `Manage chores for ${heroHouseholdName}` : "Manage household chores"}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-200">
                Create chores, review submissions, and keep rewards and payments clear for {selectedChildLabel}.
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
              {onCreateChild ? (
                <div className="rounded-[24px] border border-white/14 bg-white/10 p-4 text-white">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.16em] text-[#fff0cb]">
                        Household setup
                      </p>
                      <p className="mt-1 text-base font-black">
                        {householdName ?? "Current household"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-200">
                        Child records created here stay inside this household.
                      </p>
                    </div>
                    <span className="label-chip label-chip-light">{childProfiles.length} children</span>
                  </div>

                  {childProfiles.length === 0 ? (
                    <div className="mt-4 rounded-[20px] border border-white/14 bg-white/10 px-4 py-4 text-sm font-bold text-white">
                      Create a child profile to start assigning chores.
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#fff0cb]">
                        Child profiles
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={`rounded-full px-3 py-2 text-sm font-black ${selectedChildId === "all" ? "hero-button-primary" : "hero-button-secondary"}`}
                          onClick={() => setSelectedChildId("all")}
                          type="button"
                        >
                          All children
                        </button>
                        {childProfiles.map((child) => (
                          <span className="flex flex-wrap gap-2" key={child.id}>
                            <button
                              className={`rounded-full px-3 py-2 text-sm font-black ${selectedChildId === child.id ? "hero-button-primary" : "hero-button-secondary"}`}
                              onClick={() => setSelectedChildId(child.id)}
                              type="button"
                            >
                              {child.name.trim() || "child profile"}
                            </button>
                            <button
                              className="hero-button-secondary rounded-full px-3 py-2 text-sm font-black"
                              onClick={() => setQrChildId(child.id)}
                              type="button"
                            >
                              QR
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <label className="block">
                      <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[#fff0cb]">
                        Child name
                      </span>
                      <input
                        className="field-surface min-w-0 flex-1 rounded-2xl px-4 py-4 text-base text-[#2f271f]"
                        placeholder="Add child name"
                        value={childNameDraft}
                        onChange={(event) => setChildNameDraft(event.target.value)}
                      />
                    </label>
                    <button
                      className="action-button self-end rounded-2xl bg-gradient-to-r from-[#78a85a] via-[#91b85f] to-[#d5a642] px-5 py-4 text-base font-black text-[#231d16] shadow-lg shadow-[#3d2b12]/18"
                      disabled={!onCreateChild || isSavingChild}
                      onClick={() => void handleCreateChild()}
                      type="button"
                    >
                      {isSavingChild ? "Adding..." : "Add child"}
                    </button>
                  </div>

                  {childSetupMessage ? (
                    <p className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-sm font-bold text-white">
                      {childSetupMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-[24px] border border-amber-200/35 bg-white/10 p-4 text-white">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.16em] text-amber-100">Test data reset</p>
                    <p className="mt-1 text-sm leading-6 text-slate-200">
                      Clear completions, approvals, paid history, photos, check-ins, and missed-streak overrides while keeping users and chore setup.
                    </p>
                  </div>
                  <span className="label-chip label-chip-light">{clearableProgressCount} records</span>
                </div>
                {isResetConfirmOpen ? (
                  <div className="mt-3 rounded-[20px] bg-amber-50 px-3 py-3 text-sm text-amber-950">
                    <p className="font-black">Clear testing progress?</p>
                    <p className="mt-1">This keeps chore definitions and account setup, but removes completion/payment history.</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button className="action-button flex-1 rounded-2xl bg-rose-600 px-4 py-3 font-black text-white" onClick={() => { onClearCompletedTestData(); setIsResetConfirmOpen(false); }} type="button">Clear test data</button>
                      <button className="action-button rounded-2xl border border-amber-300 bg-white px-4 py-3 font-black text-amber-950" onClick={() => setIsResetConfirmOpen(false)} type="button">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="action-button mt-3 w-full rounded-2xl border border-amber-200/35 bg-amber-100/15 px-4 py-3 font-black text-amber-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={clearableProgressCount === 0} onClick={() => setIsResetConfirmOpen(true)} type="button">Clear completed test data</button>
                )}
              </div>
              <DashboardSection
                count={`${awaitingApproval.length} submitted`}
                icon="check"
                isOpen={openSections.pendingReview}
                title="Pending Review"
                onOpenChange={(next) => setSectionOpen("pendingReview", next)}
              >
                <div className="space-y-3">
                  {awaitingApproval.length === 0 ? (
                    <EmptyState copy="No chores are waiting for review right now." />
                  ) : (
                    awaitingApproval.map((chore) => (
                      <ReviewCard key={chore.id} checkIns={scopedCheckIns} childName={childProfiles.find((child) => child.id === chore.child_id)?.name ?? "child profile"} chore={chore} chores={scopedChores} isRejecting={rejectingId === chore.id} onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })} rejectionNote={rejectionNote} onApprove={onApprove} onReject={onReject} onRejectingChange={setRejectingId} onRejectionNoteChange={setRejectionNote} />
                    ))
                  )}
                </div>
              </DashboardSection>

              <DashboardSection
                count={formatCurrency(totalUnpaidBalance)}
                icon="wallet"
                isOpen={openSections.approvedAwaitingPayment}
                title="Approved / Awaiting Payment"
                onOpenChange={(next) => setSectionOpen("approvedAwaitingPayment", next)}
              >
                <div className="space-y-3">
                  <div className="rounded-[24px] border border-[#d8c075]/55 bg-[#fff8e6] p-4 text-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-black">Payment queue</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Review approved chores before anything moves to paid.
                        </p>
                      </div>
                      <span className="stat-chip stat-chip-soft">{approvedCompleted.length} approved</span>
                    </div>
                    <button
                      className="action-button mt-4 w-full rounded-2xl bg-gradient-to-r from-[#5f8f43] to-[#d8aa3d] px-5 py-4 text-base font-black text-[#231d16] shadow-lg shadow-[#3d2b12]/14 disabled:cursor-not-allowed disabled:opacity-55"
                      disabled={approvedCompleted.length === 0}
                      onClick={() => setIsPaymentReviewOpen(true)}
                      type="button"
                    >
                      Review Payments
                    </button>
                  </div>
                  <ChoreGroup allChores={scopedChores} checkIns={scopedCheckIns} chores={approvedCompleted} onOverrideMissedStreak={onOverrideMissedStreak} childProfiles={childProfiles} isEmbedded onDeleteChore={onDeleteChore} onEdit={startEdit} onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })} title="Approved queue" />
                </div>
              </DashboardSection>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <DashboardSection
            count={`${availableActive.length} active`}
            icon="sprout"
            isOpen={openSections.active}
            title="Available / Active"
            onOpenChange={(next) => setSectionOpen("active", next)}
          >
            <ChoreGroup allChores={scopedChores} checkIns={scopedCheckIns} chores={availableActive} onOverrideMissedStreak={onOverrideMissedStreak} childProfiles={childProfiles} isEmbedded onDeleteChore={onDeleteChore} onEdit={startEdit} onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })} title="Active chores" />
          </DashboardSection>

          <DashboardSection
            count={`${paidChores.length} paid`}
            icon="trophy"
            isOpen={openSections.paid}
            title="Paid"
            onOpenChange={(next) => setSectionOpen("paid", next)}
          >
            <ChoreGroup allChores={scopedChores} checkIns={scopedCheckIns} chores={paidChores} onOverrideMissedStreak={onOverrideMissedStreak} childProfiles={childProfiles} isEmbedded onDeleteChore={onDeleteChore} onEdit={startEdit} onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })} title="Paid chores" />
          </DashboardSection>

          <DashboardSection
            count={`${missedExpired.length} missed`}
            icon="clock"
            isOpen={openSections.missed}
            title="Archived / Missed"
            onOpenChange={(next) => setSectionOpen("missed", next)}
          >
            <ChoreGroup allChores={scopedChores} checkIns={scopedCheckIns} chores={missedExpired} onOverrideMissedStreak={onOverrideMissedStreak} childProfiles={childProfiles} isEmbedded onDeleteChore={onDeleteChore} onEdit={startEdit} onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })} title="Missed / expired" />
          </DashboardSection>
        </div>

        <DashboardSection
          count={formatCurrency(scopedPayouts.reduce((sum, payout) => sum + payout.amount_cents, 0))}
          icon="seed"
          isOpen={openSections.paymentHistory}
          title="Payment History"
          onOpenChange={(next) => setSectionOpen("paymentHistory", next)}
        >
          <div className="space-y-3">
            {recentPayouts.length === 0 ? <EmptyState copy="No payments have been recorded yet." /> : recentPayouts.map((payout) => {
              const payoutChores = scopedChores.filter(
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
                      <p className="mt-2 text-3xl font-black text-slate-900">{formatCurrency(payout.amount_cents)}</p>
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
        </DashboardSection>
      </section>
      {lightboxImage ? (
        <ImageLightbox alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} src={lightboxImage.src} />
      ) : null}
      {isPayoutCalendarOpen ? (
        <PayoutCalendarModal
          checkIns={scopedCheckIns}
          chores={paidChores}
          payouts={scopedPayouts}
          onClose={() => setIsPayoutCalendarOpen(false)}
        />
      ) : null}
      {isPaymentReviewOpen ? (
        <PaymentReviewSheet
          childProfiles={childProfiles}
          chores={approvedCompleted}
          notes={payoutNotes}
          onClose={() => setIsPaymentReviewOpen(false)}
          onConfirm={(childId, notes, paymentItems) => {
            onMarkPaid(childId, notes, paymentItems);
            setPayoutNotes("");
            setIsPaymentReviewOpen(false);
          }}
          onNotesChange={setPayoutNotes}
        />
      ) : null}
      {qrChildId ? (
        <ChildDeviceLinkModal
          key={qrChildId}
          childProfile={childProfiles.find((child) => child.id === qrChildId) ?? null}
          isRegenerating={isRegeneratingChildId === qrChildId}
          onClose={() => setQrChildId(null)}
          onRegenerate={() => void handleRegenerateChildLink(qrChildId)}
        />
      ) : null}
    </div>
  );
}

function DashboardSection({
  children,
  count,
  icon,
  isOpen,
  title,
  onOpenChange,
}: {
  children: ReactNode;
  count: string;
  icon: "check" | "clock" | "seed" | "sprout" | "trophy" | "wallet";
  isOpen: boolean;
  title: string;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <section className="dashboard-section-shell rounded-[32px]">
      <button
        aria-expanded={isOpen}
        className="dashboard-section-header w-full rounded-[28px] px-4 py-4 text-left sm:px-5"
        onClick={() => onOpenChange(!isOpen)}
        type="button"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-3">
            <span className="kicker-icon shrink-0"><AppIcon className="h-4 w-4" name={icon} /></span>
            <span className="min-w-0">
              <span className="block font-mono text-xl font-black text-slate-950 sm:text-2xl">{title}</span>
              <span className="mt-1 block text-xs font-black uppercase tracking-[0.16em] text-[#6d5a2d]">{count}</span>
            </span>
          </span>
          <span className={`section-chevron ${isOpen ? "section-chevron-open" : ""}`} aria-hidden="true">v</span>
        </span>
      </button>
      <div className={`accordion-panel ${isOpen ? "accordion-panel-open" : ""}`}>
        <div className="accordion-panel-inner px-3 pb-4 pt-2 sm:px-4">{children}</div>
      </div>
    </section>
  );
}

function ChildDeviceLinkModal({
  childProfile,
  isRegenerating,
  onClose,
  onRegenerate,
}: {
  childProfile: ChildProfile | null;
  isRegenerating: boolean;
  onClose: () => void;
  onRegenerate: () => void;
}) {
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const childName = childProfile?.name.trim() || "your child";
  const childLink =
    typeof window !== "undefined" && childProfile?.access_token
      ? `${window.location.origin}${window.location.pathname}?childLink=${encodeURIComponent(
          childProfile.access_token,
        )}`
      : "";

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
              <div className="flex h-64 items-center justify-center rounded-[18px] bg-[#f8f0dc] text-sm font-bold text-slate-600">
                QR unavailable
              </div>
            )}
          </div>

          <p className="text-sm leading-6 text-slate-700">
            This QR opens only {childName}&apos;s child-safe chore view. Regenerating it revokes
            the previous QR for this child.
          </p>

          <button
            className="action-button w-full rounded-2xl border border-[#d9c075] bg-white px-5 py-4 text-base font-black text-[#3b301f] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!childProfile || isRegenerating}
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
