"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { GrowthTreeCard } from "@/components/growth-tree/growth-tree-card";
import { ImageLightbox } from "@/components/image-lightbox";
import { StatusBadge } from "@/components/status-badge";
import { AppIcon, getChoreIcon } from "@/components/ui-icons";
import { formatCurrency, formatDate, formatShortDateTime } from "@/lib/format";
import { compressProofPhoto } from "@/lib/photo";
import {
  formatRepeatSchedule,
  getChoreKindLabel,
  getComputedStatus,
  getOptionalChoreState,
  getProofEntries,
  getRequiredRollingStreakStatus,
  getRoutineProgressDisplay,
  isOptionalInstanceChore,
  isOptionalTemplateChore,
  isOptionalChore,
  isRoutineChore,
} from "@/lib/chore-helpers";
import { CheckIn, Chore, ChildProfile, Payout, User } from "@/types/app";
import { defaultTreeProgress, getTreeProgress } from "@/lib/growth-tree/tree-progress";

type ChildDashboardProps = {
  currentUser: User;
  childProfile: ChildProfile;
  chores: Chore[];
  checkIns: CheckIn[];
  payouts: Payout[];
  onAddRollingProof: (choreId: string, photoUrl: string) => Promise<{
    ok: boolean;
    message: string;
  }>;
  onSubmitChore: (choreId: string, photoUrl: string | null) => void;
  onSubmitRollingChore: (choreId: string) => void;
};

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
  const [photoDrafts, setPhotoDrafts] = useState<Record<string, string | null>>({});
  const [messages, setMessages] = useState<Record<string, string | null>>({});
  const [photoPreparing, setPhotoPreparing] = useState<Record<string, boolean>>({});
  const [routineSaving, setRoutineSaving] = useState<Record<string, boolean>>({});
  const [isPaidHistoryOpen, setIsPaidHistoryOpen] = useState(false);
  const [paidHistorySortOrder, setPaidHistorySortOrder] = useState<"newest" | "oldest">("newest");
  const [lightboxImage, setLightboxImage] = useState<{ alt: string; src: string } | null>(null);

  const availableChores = chores.filter((chore) => {
    const status = getComputedStatus(chore, checkIns);
    if (isOptionalTemplateChore(chore)) {
      const optionalState = getOptionalChoreState(chores, chore, undefined, checkIns);
      return optionalState.canSubmitToday;
    }

    if (isOptionalInstanceChore(chore)) {
      return status === "rejected";
    }

    if (!(status === "available" || status === "rejected")) {
      return false;
    }

    return true;
  });
  const awaitingApproval = chores.filter((chore) => {
    if (isOptionalTemplateChore(chore)) {
      return false;
    }

    return getComputedStatus(chore, checkIns) === "submitted";
  });
  const approvedEarned = chores.filter((chore) => {
    if (isOptionalTemplateChore(chore)) {
      return false;
    }

    const status = getComputedStatus(chore, checkIns);
    return status === "approved" || status === "paid";
  });

  const pendingApproval = awaitingApproval.reduce((sum, chore) => sum + chore.amount_cents, 0);
  const approvedUnpaid = chores
    .filter(
      (chore) => !isOptionalTemplateChore(chore) && getComputedStatus(chore, checkIns) === "approved",
    )
    .reduce((sum, chore) => sum + chore.amount_cents, 0);
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

    setPhotoPreparing((current) => ({ ...current, [choreId]: true }));
    setMessage(choreId, "Preparing photo...");

    try {
      const result = await compressProofPhoto(file);
      const chore = chores.find((entry) => entry.id === choreId);

      if (chore && isRoutineChore(chore)) {
        setPhotoDrafts((current) => ({ ...current, [choreId]: result }));
        setMessage(choreId, "Photo added. Confirm today's check-in.");
      } else {
        setPhotoDrafts((current) => ({ ...current, [choreId]: result }));
        setMessage(choreId, "Photo attached");
      }
    } catch {
      setMessage(choreId, "That photo did not load. Please try again.");
    } finally {
      setPhotoPreparing((current) => ({ ...current, [choreId]: false }));
    }
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
    const photoUrl = photoDrafts[chore.id];
    if (!photoUrl) {
      setMessage(chore.id, "Please take a photo before confirming this check-in.");
      return;
    }

    console.log("[Earned] Confirm today check-in clicked", { choreId: chore.id });
    setRoutineSaving((current) => ({ ...current, [chore.id]: true }));
    try {
      const result = await onAddRollingProof(chore.id, photoUrl);
      if (!result.ok) {
        setMessage(chore.id, result.message);
        return;
      }

      setPhotoDrafts((current) => ({ ...current, [chore.id]: null }));
      setMessage(chore.id, result.message);
    } finally {
      setRoutineSaving((current) => ({ ...current, [chore.id]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <section className="tree-progress-panel rounded-[32px] p-5 text-white sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <GrowthTreeCard progress={treeProgress} />

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
                ? `Keep finishing chores to grow toward ${treeProgress.nextStage.label}.`
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
            <ChildSection emptyCopy="No available chores right now." icon="leaf" title="Available Chores">
              {availableChores.map((chore) => (
                <ChildChoreCard
                  key={chore.id}
                  chore={chore}
                  message={messages[chore.id] ?? null}
                  onOpenCamera={openCamera}
                  onPhotoSelect={handlePhotoSelect}
                  onRegisterFileInput={registerFileInput}
                  onRoutineSubmit={handleRoutineSubmit}
                  onStandardSubmit={handleStandardSubmit}
                  photoDraft={photoDrafts[chore.id] ?? null}
                  isPhotoPreparing={photoPreparing[chore.id] ?? false}
                  chores={chores}
                  checkIns={checkIns}
                  onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })}
                  onRoutineProof={handleRoutineProof}
                  isRoutineSaving={routineSaving[chore.id] ?? false}
                />
              ))}
            </ChildSection>

            <ChildSection emptyCopy="No chores are pending review." icon="clock" title="Pending Review">
              {awaitingApproval.map((chore) => (
                <ReadOnlyChoreCard key={chore.id} checkIns={checkIns} chore={chore} onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })} subtitle="Waiting on parent review" />
              ))}
            </ChildSection>

            <ChildSection emptyCopy="No approved or paid chores yet." icon="sprout" title="Approved / Paid">
              {approvedEarned.map((chore) => (
                <ReadOnlyChoreCard
                  key={chore.id}
                  checkIns={checkIns}
                  chore={chore}
                  onOpenLightbox={(src, alt) => setLightboxImage({ src, alt })}
                  subtitle={getComputedStatus(chore, checkIns) === "paid" ? "Paid" : "Approved and awaiting payment"}
                />
              ))}
            </ChildSection>
          </div>
        </div>

        <div className="space-y-4">
          <div className="section-shell rounded-[30px] p-5 sm:p-6">
            <div className="kicker-row text-slate-500"><span className="kicker-icon"><AppIcon className="h-4 w-4" name="seed" /></span>Payment history</div>
            <h3 className="mt-2 font-mono text-2xl font-black text-slate-900">Paid rewards for {childProfile.name}</h3>
          </div>

          <div className="section-shell rounded-[30px] p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="kicker-row text-slate-500"><span className="kicker-icon"><AppIcon className="h-4 w-4" name="seed" /></span>Payments</div>
              <div className="flex items-center gap-2">
                <span className="stat-chip stat-chip-soft">{payouts.length} payments</span>
                <button className="hero-button-secondary rounded-full px-3 py-2 text-xs font-black" onClick={() => setIsPaidHistoryOpen((current) => !current)} type="button">
                  {isPaidHistoryOpen ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            {isPaidHistoryOpen ? (
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
            ) : (
              <EmptyState copy="Payment history is tucked away until you want to review it." />
            )}
          </div>
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
  photoDraft,
  message,
  chores,
  checkIns,
  isPhotoPreparing,
  isRoutineSaving,
  onRegisterFileInput,
  onOpenCamera,
  onOpenLightbox,
  onPhotoSelect,
  onRoutineProof,
  onRoutineSubmit,
  onStandardSubmit,
}: {
  chore: Chore;
  photoDraft: string | null;
  message: string | null;
  chores: Chore[];
  checkIns: CheckIn[];
  isPhotoPreparing: boolean;
  isRoutineSaving: boolean;
  onRegisterFileInput: (choreId: string, node: HTMLInputElement | null) => void;
  onOpenCamera: (choreId: string) => void;
  onOpenLightbox: (src: string, alt: string) => void;
  onPhotoSelect: (choreId: string, file: File | null) => Promise<void>;
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
              {isRoutineChore(chore) ? <span className="label-chip label-chip-light">{brokenStreak ? "Streak broken" : "Required today"}</span> : null}
            </div>
          </div>
        </div>
        <StatusBadge
          label={isRoutineChore(chore) ? (brokenStreak ? "streak broken" : todayPhotoExists ? "done today" : "active") : undefined}
          status={status}
          tone={isRoutineChore(chore) ? (brokenStreak ? "broken" : todayPhotoExists ? "done_today" : "active") : undefined}
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
        <p>{isRoutineChore(chore) ? (brokenStreak ? "Current streak failed" : "Don't miss a day") : isOptionalChore(chore) ? "Available today" : `Due ${formatDate(chore.due_date)}`}</p>
        <p>{isOptionalChore(chore) ? optionalState?.helperLabel : isRoutineChore(chore) ? `${streakStatus?.progressCount} of ${streakStatus?.requiredCount} check-ins complete` : "Submit once complete"}</p>
      </div>

      {photoDraft ? (
        <button className="mt-3 block w-full" onClick={() => onOpenLightbox(photoDraft, `${chore.title} preview`)} type="button">
          <img alt={`${chore.title} preview`} className="h-44 w-full rounded-[22px] object-cover ring-2 ring-white/16" src={photoDraft} />
        </button>
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
        type="file"
        onChange={(event) => {
          void onPhotoSelect(chore.id, event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />

      <div className="mt-4 space-y-2">
        <button className={`action-button w-full rounded-2xl px-4 py-4 text-base font-black shadow-lg shadow-orange-950/10 ${brokenStreak ? "cursor-not-allowed bg-slate-500/80 text-white" : "bg-gradient-to-r from-[#ffd27d] to-[#ffae84] text-slate-950"}`} disabled={isPhotoPreparing || isRoutineSaving || (isRoutineChore(chore) && !canCheckInToday && !photoDraft)} onClick={() => onOpenCamera(chore.id)} type="button">
          {isPhotoPreparing ? "Preparing..." : brokenStreak ? "Streak broken" : isRoutineChore(chore) && todayPhotoExists ? "Retake photo" : "Take photo"}
        </button>

        {isRoutineChore(chore) && photoDraft ? <div className="rounded-[18px] bg-white px-3 py-2 text-sm font-bold text-slate-800">Photo added. Confirm today&apos;s check-in.</div> : null}

        {isRoutineChore(chore) ? (
          <>
            <button className={`action-button w-full rounded-2xl px-4 py-4 text-base font-black ${photoDraft && !isPhotoPreparing && !isRoutineSaving ? "bg-gradient-to-r from-[#6f9a52] to-[#d4ad4f] text-slate-950" : "hero-button-secondary text-slate-200"}`} disabled={!photoDraft || isPhotoPreparing || isRoutineSaving} onClick={() => void onRoutineProof(chore)} type="button">
              {isRoutineSaving ? "Saving..." : "Check in"}
            </button>
            <button className={`action-button w-full rounded-2xl px-4 py-4 text-base font-black ${brokenStreak ? "cursor-not-allowed bg-slate-500/80 text-white" : routineProgress?.isEligible ? "hero-button-primary" : "hero-button-secondary text-slate-200"}`} disabled={brokenStreak} onClick={() => onRoutineSubmit(chore)} type="button">
              {brokenStreak ? "Streak failed" : "Submit repeating chore for approval"}
            </button>
            {brokenStreak && streakStatus?.missedDate ? <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-rose-200">Streak broken. Missed {formatDate(streakStatus.missedDate)}. Restarts {streakStatus.nextRestartDate ? formatDate(streakStatus.nextRestartDate) : "next cycle"}.</p> : todayPhotoExists ? <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-lime-100">Today&apos;s proof is already saved</p> : canCheckInToday ? <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-300">Take a photo to save today&apos;s check-in</p> : <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-300">Today is not an active required check-in day</p>}
          </>
        ) : (
          <button className={`action-button w-full rounded-2xl px-4 py-4 text-base font-black ${photoDraft && !isPhotoPreparing ? "bg-gradient-to-r from-[#6f9a52] to-[#d4ad4f] text-slate-950" : "hero-button-secondary text-slate-200"}`} disabled={!photoDraft || isPhotoPreparing} onClick={() => onStandardSubmit(chore)} type="button">
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
  const latestProofImage = proofEntries[proofEntries.length - 1]?.photo_url ?? null;
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
      {latestProofImage ? (
        <button className="mt-3 block w-full" onClick={() => onOpenLightbox(latestProofImage, `${chore.title} proof`)} type="button">
          <img alt={`${chore.title} proof`} className="h-44 w-full rounded-[22px] object-cover ring-2 ring-white/16" src={latestProofImage} />
        </button>
      ) : null}
    </article>
  );
}

function ChildSection({
  title,
  icon,
  emptyCopy,
  children,
}: {
  title: string;
  icon: "spark" | "clock" | "trophy" | "leaf" | "sprout" | "seed";
  emptyCopy: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <section>
      <div className="section-head mb-3 flex items-center justify-between rounded-[22px] px-4 py-3">
        <div className="kicker-row text-white"><span className="kicker-icon"><AppIcon className="h-4 w-4" name={icon} /></span>{title}</div>
        <span className="stat-chip stat-chip-dark">{items.length}</span>
      </div>
      <div className="space-y-3">{items.length === 0 ? <EmptyState copy={emptyCopy} /> : children}</div>
    </section>
  );
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
  return <div className="rounded-[22px] border border-dashed border-white/20 bg-white/10 px-4 py-6 text-sm text-slate-200">{copy}</div>;
}
