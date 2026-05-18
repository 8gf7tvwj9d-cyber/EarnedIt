"use client";

import { defaultTreeProgress, TreeProgress, treeStages } from "@/lib/growth-tree/tree-progress";
import { GrowthTree } from "@/components/growth-tree/growth-tree";
import { GrowthTreeErrorBoundary } from "@/components/growth-tree/growth-tree-error-boundary";

type GrowthTreeCardProps = {
  progress?: TreeProgress | null;
  isCelebrating?: boolean;
};

export function GrowthTreeCard({ progress, isCelebrating = false }: GrowthTreeCardProps) {
  const safeProgress = getSafeTreeProgress(progress);
  const stageProgress = safeProgress.nextStage
    ? `${safeProgress.currentStageXp} of ${safeProgress.stageRangeXp} growth points`
    : "Full growth stage reached";

  return (
    <GrowthTreeErrorBoundary>
      <div className={`growth-tree-card ${isCelebrating ? "growth-tree-card-celebrate" : ""}`} aria-label={`${safeProgress.stage.label} growth tree`} role="img">
        {isCelebrating ? <div className="tree-grew-badge">Tree grew!</div> : null}
        <div className="growth-sparkle growth-sparkle-one" />
        <div className="growth-sparkle growth-sparkle-two" />
        <div className="growth-sparkle growth-sparkle-three" />
        <GrowthTree label={safeProgress.stage.label} stageId={safeProgress.stage.id} />
        <div className="growth-progress-panel">
          <div className="flex items-center justify-between gap-3">
            <span>{safeProgress.stage.label}</span>
            <span>{safeProgress.progressPercent}%</span>
          </div>
          <div className="growth-progress-track mt-2">
            <div className="growth-progress-fill" style={{ width: `${safeProgress.progressPercent}%` }} />
          </div>
          <p className="mt-2">
            {safeProgress.completedChoreCount} chore{safeProgress.completedChoreCount === 1 ? "" : "s"} completed toward growth.
          </p>
          <p className="mt-1">
            {safeProgress.nextStage
              ? `${stageProgress}. About ${safeProgress.choresTowardNextStage} more approved chore${safeProgress.choresTowardNextStage === 1 ? "" : "s"} to ${safeProgress.nextStage.label}.`
              : stageProgress}
          </p>
        </div>
      </div>
    </GrowthTreeErrorBoundary>
  );
}

function getSafeTreeProgress(progress: TreeProgress | null | undefined): TreeProgress {
  const stage = treeStages.find((candidate) => candidate.id === progress?.stage?.id);
  const totalXp = progress?.totalXp;
  const progressPercent = progress?.progressPercent;

  if (!progress || !stage || typeof totalXp !== "number" || !Number.isFinite(totalXp)) {
    return defaultTreeProgress;
  }

  return {
    ...defaultTreeProgress,
    ...progress,
    stage,
    totalXp: Math.max(0, totalXp),
    currentStageXp: Math.max(0, progress.currentStageXp),
    stageRangeXp: Math.max(0, progress.stageRangeXp),
    completedChoreCount: Math.max(0, progress.completedChoreCount),
    choresTowardNextStage: Math.max(0, progress.choresTowardNextStage),
    progressPercent:
      typeof progressPercent === "number" && Number.isFinite(progressPercent)
        ? Math.min(100, Math.max(0, progressPercent))
        : defaultTreeProgress.progressPercent,
  };
}
