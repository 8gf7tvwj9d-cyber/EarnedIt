"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { GrowthTreeCard } from "@/components/growth-tree/growth-tree-card";
import { ImageLightbox } from "@/components/image-lightbox";
import { StatusBadge } from "@/components/status-badge";
import { AppIcon, getChoreIcon } from "@/components/ui-icons";
import { formatCurrency, formatDate, formatReadableDateTime, formatShortDateTime } from "@/lib/format";
import { compressProofPhoto } from "@/lib/photo";
import {
  formatRepeatSchedule,
  getChoreKindLabel,
  getComputedStatus,
  getOptionalChoreState,
  getProofEntries,
  getRequiredRollingStreakStatus,
  getRoutineProgressDisplay,
  getTodayIsoDate,
  isOptionalInstanceChore,
  isOptionalTemplateChore,
  isOptionalChore,
  isRoutineChore,
  isChoreScheduledForDate,
} from "@/lib/chore-helpers";
import { CheckIn, Chore, ChildProfile, Payout, ProofPhotoInput, User } from "@/types/app";
import { defaultTreeProgress, getTreeProgress } from "@/lib/growth-tree/tree-progress";

type ChildDashboardProps = {
  currentUser: User;
  childProfile: ChildProfile;
  chores: Chore[];
  checkIns: CheckIn[];
  payouts: Payout[];
  onAddRollingProof: (choreId: string, photos: ProofPhotoInput[]) => Promise<{
    ok: boolean;
    message: string;
  }>;
  onSubmitChore: (choreId: string, photos: ProofPhotoInput[]) => void;
  onSubmitRollingChore: (choreId: string) => void;
};

function getDefaultChildSections() {
  return {
    available: true,
    pendingReview: true,
    approvedAwaitingPayment: true,
    paid: false,
    paymentHistory: false,
  };
}

export function ChildDashboard({
  currentUser,
  childProfile,
  chores,
  checkIns,
  payouts,
  onAddRollingProof,
  onSubmitChore,
  onSubmitRollingChore,
}: ChildDashboardProps) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const previousTreeXpRef = useRef<number | null>(null);
  const [photoDrafts, setPhotoDrafts] = useState<Record<string, ProofPhotoInput[]>>({});
  const [messages, setMessages] = useState<Record<string, string | null>>({});
  const [photoPreparing, setPhotoPreparing] = useState<Record<string, boolean>>({});
  const [routineSaving, setRoutineSaving] = useState<Record<string, boolean>>({});
  const [paidHistorySortOrder, setPaidHistorySortOrder] = useState<"newest" | "oldest">("newest");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") {
      return getDefaultChildSections();
    }

    try {
      const saved = window.sessionStorage.getItem("earned-child-dashboard-sections");
      return saved ? { ...getDefaultChildSections(), ...JSON.parse(saved) } : getDefaultChildSections();
    } catch {
      return getDefaultChildSections();
    }
  });
  const [isTreeCelebrating, setIsTreeCelebrating] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ alt: string; src: string } | null>(null);

  const assignedChores = chores.filter((chore) => {
    const status = getComputedStatus(chore, checkIns);
    if (isOptionalInstanceChore(chore)) {
      return false;
    }

    return status === "available" || status === "rejected" || status === "expired";
  });
  const awaitingApproval = chores.filter((chore) => {
    if (isOptionalTemplateChore(chore)) {
      return false;
    }

    return getComputedStatus(chore, checkIns) === "submitted";
  });
  const approvedUnpaidChores = chores.filter((chore) => {
    if (isOptionalTemplateChore(chore)) {
      return false;
    }

    return getComputedStatus(chore, checkIns) === "approved";
  });
  const paidChores = chores.filter(
    (chore) => !isOptionalTemplateChore(chore) && getComputedStatus(chore, checkIns) === "paid",
  );

  const pendingApproval = awaitingApproval.reduce((sum, chore) => sum + chore.amount_cents, 0);
  const approvedUnpaid = approvedUnpaidChores.reduce((sum, chore) => sum + chore.amount_cents, 0);
  const paidTotal = payouts.reduce((sum, payout) => sum + payout.amount_cents, 0);
  let treeProgress = defaultTreeProgress;
  let treeLoadFailed = false;
  try {
    treeProgress = getTreeProgress(chores, checkIns);
  } catch (error) {
    treeLoadFailed = true;
    console.warn("[Earned] Tree progress failed to load. Falling back to seedling.", error);
  }
  const sortedPayouts = [...payouts].sort((left, right) =>
    paidHistorySortOrder === "newest"
      ? right.paid_at.localeCompare(left.paid_at)
      : left.paid_at.localeCompare(right.paid_at),
  );

  useEffect(() => {
    window.sessionStorage.setItem(
      "earned-child-dashboard-sections",
      JSON.stringify(openSections),
    );
  }, [openSections]);

  useEffect(() => {
    const previousTreeXp = previousTreeXpRef.current;
    previousTreeXpRef.current = treeProgress.totalXp;

    if (previousTreeXp === null || treeProgress.totalXp <= previousTreeXp) {
      return;
    }

    setIsTreeCelebrating(true);
    const timer = window.setTimeout(() => setIsTreeCelebrating(false), 1400);
    return () => window.clearTimeout(timer);
  }, [treeProgress.totalXp]);

  function setSectionOpen(sectionId: string, isOpen: boolean) {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: isOpen,
    }));
  }

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

  function getNextPhotoLabel(existingCount: number) {
    if (existingCount === 0) {
      return "Before" as const;
    }

    if (existingCount === 1) {
      return "After" as const;
    }

    return "Extra" as const;
  }

  async function handlePhotoSelect(choreId: string, files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    setPhotoPreparing((current) => ({ ...current, [choreId]: true }));
    setMessage(choreId, selectedFiles.length > 1 ? "Preparing photos..." : "Preparing photo...");

    try {
      const existingDrafts = photoDrafts[choreId] ?? [];
      const preparedPhotos = await Promise.all(
        selectedFiles.map(async (file, index) => ({
          photo_url: await compressProofPhoto(file),
          uploaded_at: new Date().toISOString(),
          label: getNextPhotoLabel(existingDrafts.length + index),
        })),
      );
      const chore = chores.find((entry) => entry.id === choreId);

      setPhotoDrafts((current) => ({
        ...current,
        [choreId]: [...(current[choreId] ?? []), ...preparedPhotos],
      }));
      setMessage(
        choreId,
        chore && isRoutineChore(chore)
          ? "Photo added. Confirm today's check-in."
          : preparedPhotos.length > 1
            ? "Photos attached"
            : "Photo attached",
      );
    } catch {
      setMessage(choreId, "That photo did not load. Please try again.");
    } finally {
      setPhotoPreparing((current) => ({ ...current, [choreId]: false }));
    }
  }

  function removePhotoDraft(choreId: string, index: number) {
    setPhotoDrafts((current) => ({
      ...current,
      [choreId]: (current[choreId] ?? []).filter((_, photoIndex) => photoIndex !== index),
    }));
  }
  function handleStandardSubmit(chore: Chore) {
    const photos = photoDrafts[chore.id] ?? [];
    if (photos.length === 0) {
      setMessage(chore.id, "Please add a photo before submitting this chore.");
      return;
    }

    onSubmitChore(chore.id, photos);
    setPhotoDrafts((current) => ({ ...current, [chore.id]: [] }));
    setMessage(chore.id, null);
  }

  function handleRoutineSubmit(chore: Chore) {
    const streakStatus = getRequiredRollingStreakStatus(chore, checkIns, chore.child_id);
    const progress = getRoutineProgressDisplay(chore, checkIns);
    if (streakStatus.isBroken) {
      setMessage(
        chore.id,
        streakStatus.nextRestartDate
          ? `Streak broken. Missed ${formatDate(streakStatus.missedDate)}. Restarts ${formatDate(streakStatus.nextRestartDate)}.`
          : `Streak broken. Missed ${formatDate(streakStatus.missedDate)}.`,
      );
      return;
    }

    if (!progress.isEligible) {
      setMessage(
        chore.id,
        progress.missedLabel
          ? `${progress.missedLabel} - reward is not unlocked yet`
          : "Finish every required day before submitting this chore.",
      );
      return;
    }

    onSubmitRollingChore(chore.id);
    setMessage(chore.id, null);
  }

  async function handleRoutineProof(chore: Chore) {
    const photos = photoDrafts[chore.id] ?? [];
    if (photos.length === 0) {
      setMessage(chore.id, "Please add a photo before confirming this check-in.");
      return;
    }

    console.log("[Earned] Confirm today check-in clicked", { choreId: chore.id });
    setRoutineSaving((current) => ({ ...current, [chore.id]: true }));
    try {
      const result = await onAddRollingProof(chore.id, photos);
      if (!result.ok) {
        setMessage(chore.id, result.message);
        return;
      }

      setPhotoDrafts((current) => ({ ...current, [chore.id]: [] }));
      setMessage(chore.id, result.message);
    } finally {
      setRoutineSaving((current) => ({ ...current, [chore.id]: false }));
    }
  }
  return (
    <div className="space-y-6">
      <section className="tree-progress-panel rounded-[32px] p-5 text-white sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <GrowthTreeCard isCelebrating={isTreeCelebrating} progress={treeProgress} />

          <div>
            <div className="section-kicker kicker-row">
              <span className="kicker-icon"><AppIcon className="h-4 w-4" name="sprout" /></span>
              My tree
            </div>
            <h2 className="mt-3 font-mono text-3xl font-black">
              {treeProgress.stage.label}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#f2ead4]">
              Required chores water the tree the most. Extra chores add a little sunshine.
            </p>
            <p className="mt-4 rounded-2xl border border-white/14 bg-white/10 px-4 py-3 text-sm font-bold text-[#fff7df]">
              {treeProgress.nextStage
                ? `${treeProgress.completedChoreCount} completed chore${treeProgress.completedChoreCount === 1 ? "" : "s"} counted. ${treeProgress.progressPercent}% toward ${treeProgress.nextStage.label}.`
                : "Your tree has reached its fullest stage."}
            </p>

            {treeProgress.growthPaused ? (
              <p className="mt-4 rounded-2xl border border-[#ffd27d]/35 bg-[#fff8e7]/12 px-4 py-3 text-sm font-bold text-[#fff1c9]">
                A missed required day is slowing growth this cycle, but your tree keeps what it already earned.
              </p>
            ) : (
              <p className="mt-4 rounded-2xl border border-[#9bb76a]/35 bg-[#e4efd8]/12 px-4 py-3 text-sm font-bold text-[#f4ffd9]">
                No missed required days are slowing growth right now.
              </p>
            )}
            {treeLoadFailed ? (
              <p className="mt-3 rounded-2xl border border-[#f4e0aa]/35 bg-[#fff8e7]/10 px-4 py-3 text-sm text-[#f7edd1]">
                Tree progress reset to a safe fallback while the app data reloads.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard accent="from-[#fff0cb] via-[#ffe0a1] to-[#fff9e8]" icon="seed" label="Pending Review" value={formatCurrency(pendingApproval)} copy="Submitted and awaiting parent review" />
        <SummaryCard accent="from-[#e4efd8] via-[#c9dfb4] to-[#fbf8ea]" icon="sprout" label="Approved, Unpaid" value={formatCurrency(approvedUnpaid)} copy="Approved rewards not paid yet" />
        <SummaryCard accent="from-[#f4e5bd] via-[#dfc06a] to-[#fff8df]" icon="leaf" label="Paid Earnings" value={formatCurrency(paidTotal)} copy="Rewards already paid" />
      </section>

      <section className="space-y-4">
        <div className="panel-strong mode-frame rounded-[32px] p-5 text-white sm:p-6">
          <div className="mb-5">
            <div className="section-kicker kicker-row">
              <span className="kicker-icon"><AppIcon className="h-4 w-4" name="sprout" /></span>
              Child garden
            </div>
            <h2 className="mt-2 font-mono text-3xl font-black">Keep growing, {currentUser.name}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-200">
              Complete today&apos;s chores, keep required repeating chores alive, and earn rewards as you go.
            </p>
          </div>

          <div className="space-y-5">
            <ChildDashboardSection
              count={`${assignedChores.length} assigned`}
              icon="leaf"
              isOpen={openSections.available}
              title="Assigned Chores"
              onOpenChange={(next) => setSectionOpen("available", next)}
            >
              <ChildSectionContent emptyCopy="No assigned chores right now.">
              {assignedChores.map((chore) => (
                <ChildChoreCard
                  key={chore.id}
                  chore={chore}
                  message={messages[chore.id] ?? null}
                  onOpenCamera={openCamera}
                  onPhotoSelect={handlePhotoSelect}
                  onRemovePhotoDraft={removePhotoDraft}
                  onRegisterFileInput={registerFileInput}
                  onRoutineSubmit={handleRoutineSubmit}
                  onStandardSubmit={handleStandardSubmit}
                  photoDrafts={photoDrafts[chore.id] ?? []}
                  isPhotoPreparing={photoPreparing[chore.id] ?? false}
                  chores={chores}
                  checkIns={checkIns}
                  onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })}
                  onRoutineProof={handleRoutineProof}
                  isRoutineSaving={routineSaving[chore.id] ?? false}
                />
              ))}
              </ChildSectionContent>
            </ChildDashboardSection>

            <ChildDashboardSection
              count={`${awaitingApproval.length} submitted`}
              icon="clock"
              isOpen={openSections.pendingReview}
              title="Pending Review"
              onOpenChange={(next) => setSectionOpen("pendingReview", next)}
            >
              <ChildSectionContent emptyCopy="No chores are pending review.">
              {awaitingApproval.map((chore) => (
                <ReadOnlyChoreCard key={chore.id} checkIns={checkIns} chore={chore} onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })} subtitle="Waiting on parent review" />
              ))}
              </ChildSectionContent>
            </ChildDashboardSection>

            <ChildDashboardSection
              count={formatCurrency(approvedUnpaid)}
              icon="wallet"
              isOpen={openSections.approvedAwaitingPayment}
              title="Approved / Awaiting Payment"
              onOpenChange={(next) => setSectionOpen("approvedAwaitingPayment", next)}
            >
              <ChildSectionContent emptyCopy="No approved rewards are waiting for payment.">
              {approvedUnpaidChores.map((chore) => (
                <ReadOnlyChoreCard
                  key={chore.id}
                  checkIns={checkIns}
                  chore={chore}
                  onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })}
                  subtitle="Approved and awaiting payment"
                />
              ))}
              </ChildSectionContent>
            </ChildDashboardSection>

            <ChildDashboardSection
              count={`${paidChores.length} paid`}
              icon="trophy"
              isOpen={openSections.paid}
              title="Paid"
              onOpenChange={(next) => setSectionOpen("paid", next)}
            >
              <ChildSectionContent emptyCopy="No paid chores yet.">
              {paidChores.map((chore) => (
                <ReadOnlyChoreCard
                  key={chore.id}
                  checkIns={checkIns}
                  chore={chore}
                  onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })}
                  subtitle="Paid"
                />
              ))}
              </ChildSectionContent>
            </ChildDashboardSection>
          </div>
        </div>

        <div className="space-y-4">
          <ChildDashboardSection
            count={`${payouts.length} payments`}
            icon="seed"
            isOpen={openSections.paymentHistory}
            title={`Payment History for ${childProfile.name}`}
            onOpenChange={(next) => setSectionOpen("paymentHistory", next)}
          >
            <>
            <div className="mb-4 flex justify-end">
              <select className="field-surface rounded-full px-3 py-2 text-xs font-black text-slate-900" value={paidHistorySortOrder} onChange={(event) => setPaidHistorySortOrder(event.target.value as "newest" | "oldest")}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
            <div className="space-y-3">
              {sortedPayouts.length === 0 ? (
                <EmptyState copy="No payments yet. Once a parent records a payment, it will show up here." />
              ) : (
                sortedPayouts.map((payout) => (
                  <article key={payout.id} className="card-spotlight rounded-[24px] border border-[#d9c075]/45 bg-gradient-to-br from-[#fff8e6] to-white p-4 shadow-[0_16px_30px_rgba(48,35,18,0.08)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="support-label">Reward paid</p>
                        <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-900">{formatCurrency(payout.amount_cents)}</p>
                        <p className="text-sm text-slate-600">{payout.paid_method}</p>
                      </div>
                      <span className="stat-chip stat-chip-soft">Paid</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{formatShortDateTime(payout.paid_at)}</p>
                    {payout.notes ? <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600">{payout.notes}</p> : null}
                  </article>
                ))
              )}
            </div>
            </>
          </ChildDashboardSection>
        </div>
      </section>
      {lightboxImage ? (
        <ImageLightbox alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} src={lightboxImage.src} />
      ) : null}
    </div>
  );
}

function ChildChoreCard({
  chore,
  photoDrafts,
  message,
  chores,
  checkIns,
  isPhotoPreparing,
  isRoutineSaving,
  onRegisterFileInput,
  onOpenCamera,
  onOpenLightbox,
  onPhotoSelect,
  onRemovePhotoDraft,
  onRoutineProof,
  onRoutineSubmit,
  onStandardSubmit,
}: {
  chore: Chore;
  photoDrafts: ProofPhotoInput[];
  message: string | null;
  chores: Chore[];
  checkIns: CheckIn[];
  isPhotoPreparing: boolean;
  isRoutineSaving: boolean;
  onRegisterFileInput: (choreId: string, node: HTMLInputElement | null) => void;
  onOpenCamera: (choreId: string) => void;
  onOpenLightbox: (src: string, alt: string) => void;
  onPhotoSelect: (choreId: string, files: FileList | null) => Promise<void>;
  onRemovePhotoDraft: (choreId: string, index: number) => void;
  onRoutineProof: (chore: Chore) => void;
  onRoutineSubmit: (chore: Chore) => void;
  onStandardSubmit: (chore: Chore) => void;
}) {
  const status = getComputedStatus(chore, checkIns);
  const proofEntries = getProofEntries(chore, checkIns);
  const routineProgress = isRoutineChore(chore) ? getRoutineProgressDisplay(chore, checkIns) : null;
  const streakStatus = isRoutineChore(chore)
    ? getRequiredRollingStreakStatus(chore, checkIns, chore.child_id)
    : null;
  const brokenStreak = Boolean(streakStatus?.isBroken);
  const optionalState = isOptionalChore(chore)
    ? getOptionalChoreState(chores, chore, undefined, checkIns)
    : null;
  const todayPhotoExists = Boolean(routineProgress?.todayCompleted);
  const latestProofImage = proofEntries[proofEntries.length - 1]?.photo_url ?? null;
  const progressPercent = routineProgress?.progressPercent ?? 0;
  const canCheckInToday = Boolean(streakStatus?.canCheckInToday);
  const today = getTodayIsoDate();
  const isExpired = status === "expired";
  const isStandardScheduledToday = isChoreScheduledForDate(chore, today);
  const optionalCompletedThisPeriod = Boolean(
    optionalState?.currentInstance && optionalState.currentInstance.status !== "rejected",
  );
  const canCompleteNow = isExpired
    ? false
    : isRoutineChore(chore)
      ? canCheckInToday && !brokenStreak
      : isOptionalChore(chore)
        ? Boolean(optionalState?.canSubmitToday)
        : (status === "available" || status === "rejected") && isStandardScheduledToday;
  const badgeState = isExpired
    ? { label: "Expired", tone: undefined }
    : brokenStreak
      ? { label: "Missed", tone: "missed" as const }
      : isRoutineChore(chore) && todayPhotoExists
        ? { label: "Done Today", tone: "done_today" as const }
        : isOptionalChore(chore) && optionalCompletedThisPeriod
          ? { label: "Done Today", tone: "done_today" as const }
          : canCompleteNow
            ? { label: "Active", tone: "active" as const }
            : { label: "Unavailable", tone: "unavailable" as const };

  return (
    <article className={`child-card card-spotlight rounded-[28px] border p-4 ${brokenStreak ? "border-rose-300 bg-rose-950/35 shadow-[0_12px_28px_rgba(127,29,29,0.28)]" : "border-white/14"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="kicker-icon mt-0.5"><AppIcon className="h-4 w-4" name={getChoreIcon(chore.title)} /></span>
          <div>
            <p className="font-black text-white">{chore.title}</p>
            <div className="title-underline title-underline-light mt-2" />
            <p className="mt-1 text-sm leading-6 text-slate-200">{chore.description}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="label-chip label-chip-light">{getChoreKindLabel(chore)}</span>
              {isOptionalChore(chore) ? <span className="label-chip label-chip-light">Optional</span> : null}
              {isRoutineChore(chore) ? <span className="label-chip label-chip-light"><AppIcon className="h-3 w-3" name="repeat" /> {brokenStreak ? "Streak broken" : "Repeating"}</span> : null}
            </div>
          </div>
        </div>
        <StatusBadge
          label={badgeState.label}
          status={status}
          tone={badgeState.tone}
        />
      </div>

      {chore.rejection_note ? <p className="mt-3 rounded-2xl bg-rose-100/90 px-3 py-2 text-sm text-rose-800">Parent note: {chore.rejection_note}</p> : null}

      {routineProgress ? (
        <div className={`mt-3 rounded-[22px] px-3 py-3 text-sm ${brokenStreak ? "bg-rose-100/92 text-rose-950" : "bg-white/10 text-slate-100"}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold">{brokenStreak ? "Streak broken" : routineProgress.streakLabel}</p>
            <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] ${brokenStreak ? "bg-rose-200 text-rose-900" : "bg-white/14 text-white"}`}>
              {streakStatus?.progressCount} of {streakStatus?.requiredCount}
            </span>
          </div>
          <div className={`mt-3 h-3 overflow-hidden rounded-full ${brokenStreak ? "bg-slate-300" : "progress-rail"}`}>
            <div className={brokenStreak ? "h-full rounded-full bg-slate-500" : "progress-fill"} style={{ width: `${progressPercent}%` }} />
          </div>
          <p className={`mt-2 ${brokenStreak ? "font-bold text-rose-900" : "text-lime-100"}`}>
            {brokenStreak && streakStatus?.missedDate
              ? `Missed check-in on ${formatDate(streakStatus.missedDate)}`
              : `${streakStatus?.progressCount} of ${streakStatus?.requiredCount} check-ins complete`}
          </p>
          {brokenStreak ? (
            <p className="mt-1 text-sm text-rose-900">
              {streakStatus?.nextRestartDate
                ? `Streak broken. Missed check-in on ${formatDate(streakStatus.missedDate)}. Restarts ${formatDate(streakStatus.nextRestartDate)}.`
                : "Start a new streak to earn this reward."}
            </p>
          ) : (
            <p className="mt-1 text-lime-100">All days required for the full reward.</p>
          )}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
        <p>{formatCurrency(chore.amount_cents)}</p>
        <p>{formatRepeatSchedule(chore)}</p>
        <p>{isRoutineChore(chore) ? (brokenStreak ? "Current streak missed" : badgeState.label) : isOptionalChore(chore) ? badgeState.label : `Due ${formatDate(chore.due_date)}`}</p>
        <p>{isOptionalChore(chore) ? optionalState?.helperLabel : isRoutineChore(chore) ? `${streakStatus?.progressCount} of ${streakStatus?.requiredCount} check-ins complete` : "Submit once complete"}</p>
      </div>

      {photoDrafts.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {photoDrafts.map((photo, index) => (
            <div key={`${photo.uploaded_at}-${index}`} className="rounded-[20px] bg-white/10 p-2">
              <button className="block w-full" onClick={() => onOpenLightbox(photo.photo_url, `${chore.title} ${photo.label ?? "proof"} preview`)} type="button">
                <img alt={`${chore.title} ${photo.label ?? "proof"} preview`} className="h-32 w-full rounded-2xl object-cover ring-2 ring-white/16" src={photo.photo_url} />
              </button>
              <div className="mt-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-lime-100">{photo.label ?? "Extra"}</p>
                  <p className="text-xs text-slate-200">Uploaded {formatReadableDateTime(photo.uploaded_at)}</p>
                </div>
                <button className="rounded-full bg-white/12 px-3 py-1 text-xs font-black text-white" onClick={() => onRemovePhotoDraft(chore.id, index)} type="button">Remove</button>
              </div>
            </div>
          ))}
        </div>
      ) : isRoutineChore(chore) && latestProofImage ? (
        <button className="mt-3 block w-full" onClick={() => onOpenLightbox(latestProofImage, `${chore.title} proof`)} type="button">
          <img alt={`${chore.title} proof`} className="h-44 w-full rounded-[22px] object-cover ring-2 ring-white/16" src={latestProofImage} />
        </button>
      ) : !isRoutineChore(chore) && proofEntries[0] ? (
        <button className="mt-3 block w-full" onClick={() => onOpenLightbox(proofEntries[proofEntries.length - 1]?.photo_url ?? proofEntries[0].photo_url, `${chore.title} proof`)} type="button">
          <img alt={`${chore.title} proof`} className="h-44 w-full rounded-[22px] object-cover ring-2 ring-white/16" src={proofEntries[proofEntries.length - 1]?.photo_url ?? proofEntries[0].photo_url} />
        </button>
      ) : null}
      <input
        ref={(node) => {
          onRegisterFileInput(chore.id, node);
        }}
        accept="image/*"
        capture="environment"
        className="hidden"
        multiple
        type="file"
        onChange={(event) => {
          void onPhotoSelect(chore.id, event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="mt-4 space-y-2">
        <button className={`action-button w-full rounded-2xl px-4 py-4 text-base font-black shadow-lg shadow-orange-950/10 ${brokenStreak ? "cursor-not-allowed bg-slate-500/80 text-white" : "bg-gradient-to-r from-[#ffd27d] to-[#ffae84] text-slate-950"}`} disabled={isPhotoPreparing || isRoutineSaving || !canCompleteNow} onClick={() => onOpenCamera(chore.id)} type="button">
          {isPhotoPreparing ? "Preparing..." : brokenStreak ? "Streak broken" : canCompleteNow ? "Add photo" : badgeState.label}
        </button>

        {isRoutineChore(chore) && photoDrafts.length > 0 ? <div className="rounded-[18px] bg-white px-3 py-2 text-sm font-bold text-slate-800">Photo added. Confirm today&apos;s check-in.</div> : null}

        {isRoutineChore(chore) ? (
          <>
            <button className={`action-button w-full rounded-2xl px-4 py-4 text-base font-black ${photoDrafts.length > 0 && !isPhotoPreparing && !isRoutineSaving ? "bg-gradient-to-r from-[#6f9a52] to-[#d4ad4f] text-slate-950" : "hero-button-secondary text-slate-200"}`} disabled={photoDrafts.length === 0 || !canCompleteNow || isPhotoPreparing || isRoutineSaving} onClick={() => void onRoutineProof(chore)} type="button">
              {isRoutineSaving ? "Saving..." : "Check in"}
            </button>
            <button className={`action-button w-full rounded-2xl px-4 py-4 text-base font-black ${brokenStreak ? "cursor-not-allowed bg-slate-500/80 text-white" : routineProgress?.isEligible ? "hero-button-primary" : "hero-button-secondary text-slate-200"}`} disabled={brokenStreak} onClick={() => onRoutineSubmit(chore)} type="button">
              {brokenStreak ? "Streak failed" : "Submit repeating chore for approval"}
            </button>
            {brokenStreak && streakStatus?.missedDate ? <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-rose-200">Streak broken. Missed {formatDate(streakStatus.missedDate)}. Restarts {streakStatus.nextRestartDate ? formatDate(streakStatus.nextRestartDate) : "next cycle"}.</p> : todayPhotoExists ? <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-lime-100">Today&apos;s proof is already saved</p> : canCompleteNow ? <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-300">Take a photo to save today&apos;s check-in</p> : <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-300">This chore is unavailable today</p>}
          </>
        ) : (
          <button className={`action-button w-full rounded-2xl px-4 py-4 text-base font-black ${photoDrafts.length > 0 && !isPhotoPreparing ? "bg-gradient-to-r from-[#6f9a52] to-[#d4ad4f] text-slate-950" : "hero-button-secondary text-slate-200"}`} disabled={photoDrafts.length === 0 || !canCompleteNow || isPhotoPreparing} onClick={() => onStandardSubmit(chore)} type="button">
            {isOptionalChore(chore) ? "Submit repeating chore" : "Submit chore"}
          </button>
        )}
      </div>

      {message ? <p className="mt-3 rounded-2xl bg-white/12 px-3 py-2 text-sm font-bold text-white">{message}</p> : null}
    </article>
  );
}

function ReadOnlyChoreCard({
  checkIns,
  chore,
  onOpenLightbox,
  subtitle,
}: {
  checkIns: CheckIn[];
  chore: Chore;
  onOpenLightbox: (src: string, alt: string) => void;
  subtitle: string;
}) {
  const status = getComputedStatus(chore, checkIns);
  const routineProgress = isRoutineChore(chore) ? getRoutineProgressDisplay(chore, checkIns) : null;
  const streakStatus = isRoutineChore(chore)
    ? getRequiredRollingStreakStatus(chore, checkIns, chore.child_id)
    : null;
  const brokenStreak = Boolean(streakStatus?.isBroken);
  const proofEntries = getProofEntries(chore, checkIns);
  const progressPercent = routineProgress?.progressPercent ?? 0;

  return (
    <article className={`child-card card-spotlight rounded-[26px] border p-4 ${brokenStreak ? "border-rose-300 bg-rose-950/35 shadow-[0_12px_28px_rgba(127,29,29,0.28)]" : "border-white/18"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="kicker-icon mt-0.5"><AppIcon className="h-4 w-4" name={getChoreIcon(chore.title)} /></span>
          <div>
            <p className="font-black text-white">{chore.title}</p>
            <div className="title-underline title-underline-light mt-2" />
            <p className="mt-1 text-sm text-slate-200">{subtitle}</p>
          </div>
        </div>
        <StatusBadge
          label={brokenStreak ? "streak broken" : undefined}
          status={status}
          tone={brokenStreak ? "broken" : undefined}
        />
      </div>
      {routineProgress ? (
        <div className={`mt-3 rounded-[22px] px-3 py-3 text-sm ${brokenStreak ? "bg-rose-100/92 text-rose-950" : "bg-white/10 text-slate-100"}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold">{brokenStreak ? "Streak broken" : routineProgress.streakLabel}</p>
            <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] ${brokenStreak ? "bg-rose-200 text-rose-900" : "bg-white/14 text-white"}`}>
              {streakStatus?.progressCount} of {streakStatus?.requiredCount}
            </span>
          </div>
          <div className={`mt-3 h-3 overflow-hidden rounded-full ${brokenStreak ? "bg-slate-300" : "progress-rail"}`}>
            <div className={brokenStreak ? "h-full rounded-full bg-slate-500" : "progress-fill"} style={{ width: `${progressPercent}%` }} />
          </div>
          <p className={`mt-2 ${brokenStreak ? "font-bold text-rose-900" : "text-lime-100"}`}>
            {brokenStreak && streakStatus?.missedDate
              ? `Missed check-in on ${formatDate(streakStatus.missedDate)}`
              : `${streakStatus?.progressCount} of ${streakStatus?.requiredCount} check-ins complete`}
          </p>
          {brokenStreak && streakStatus?.nextRestartDate ? (
            <p className="mt-1 text-sm text-rose-900">
              Restarts {formatDate(streakStatus.nextRestartDate)}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
        <p>{formatCurrency(chore.amount_cents)}</p>
        <p>{routineProgress ? `${streakStatus?.progressCount} of ${streakStatus?.requiredCount} check-ins complete` : getChoreKindLabel(chore)}</p>
      </div>
      {proofEntries.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {proofEntries.map((entry) => (
            <button key={entry.id} className="rounded-[20px] bg-white/10 p-2 text-left" onClick={() => onOpenLightbox(entry.photo_url, `${chore.title} proof`)} type="button">
              <img alt={`${chore.title} proof`} className="h-32 w-full rounded-2xl object-cover ring-2 ring-white/16" src={entry.photo_url} />
              <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-lime-100">{entry.label ?? "Proof"}</p>
              <p className="text-xs text-slate-200">Uploaded {entry.uploaded_at ? formatReadableDateTime(entry.uploaded_at) : "time unavailable"}</p>
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ChildDashboardSection({
  children,
  count,
  icon,
  isOpen,
  title,
  onOpenChange,
}: {
  children: ReactNode;
  count: string;
  icon: "clock" | "leaf" | "seed" | "sprout" | "trophy" | "wallet";
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

function ChildSectionContent({
  emptyCopy,
  children,
}: {
  emptyCopy: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return <div className="space-y-3">{items.length === 0 ? <EmptyState copy={emptyCopy} /> : children}</div>;
}

function SummaryCard({
  accent,
  icon,
  label,
  value,
  copy,
}: {
  accent: string;
  icon: "clock" | "trophy" | "wallet" | "leaf" | "sprout" | "seed";
  label: string;
  value: string;
  copy: string;
}) {
  return (
    <div className={`metric-card metric-card-premium glass-card rounded-[26px] bg-gradient-to-br ${accent} p-4`}>
      <div className="kicker-row text-slate-600"><span className="kicker-icon"><AppIcon className="h-4 w-4" name={icon} /></span>{label}</div>
      <p className="metric-value mt-3 font-mono text-3xl font-black text-slate-900">{value}</p>
      <p className="mt-1 max-w-52 text-sm leading-6 text-slate-700">{copy}</p>
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-sm text-slate-500">{copy}</div>;
}
