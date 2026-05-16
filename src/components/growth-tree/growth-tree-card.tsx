"use client";

import { defaultTreeProgress, TreeProgress, treeStages } from "@/lib/growth-tree/tree-progress";
import { GrowthTree } from "@/components/growth-tree/growth-tree";
import { GrowthTreeErrorBoundary } from "@/components/growth-tree/growth-tree-error-boundary";

type GrowthTreeCardProps = {
  progress?: TreeProgress | null;
};

export function GrowthTreeCard({ progress }: GrowthTreeCardProps) {
  const safeProgress = getSafeTreeProgress(progress);

  return (
    <GrowthTreeErrorBoundary>
      <div className="growth-tree-card" aria-label={`${safeProgress.stage.label} growth tree`} role="img">
        <GrowthTree label={safeProgress.stage.label} stageId={safeProgress.stage.id} />
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
    progressPercent:
      typeof progressPercent === "number" && Number.isFinite(progressPercent)
        ? Math.min(100, Math.max(0, progressPercent))
        : defaultTreeProgress.progressPercent,
  };
}
