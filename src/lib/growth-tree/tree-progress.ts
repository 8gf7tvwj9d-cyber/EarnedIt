import { getRequiredProgress } from "@/lib/chore-progress";
import { Chore, CheckIn } from "@/types/app";
import { defaultTreeProgress, treeStages, TreeProgress } from "@/lib/growth-tree/tree-stages";

export { defaultTreeProgress, treeStages };
export type { TreeProgress, TreeStage, TreeStageId } from "@/lib/growth-tree/tree-stages";

function getProofCount(chore: Chore, checkIns: CheckIn[]) {
  const checkInCount = checkIns.filter((entry) => entry.chore_id === chore.id).length;
  return Math.max(checkInCount, chore.proof_entries?.length ?? 0);
}

function isCompletedForGrowth(chore: Chore) {
  return chore.status === "approved" || chore.status === "paid";
}

export function getTreeProgress(chores: Chore[], checkIns: CheckIn[]): TreeProgress {
  try {
    const safeChores = Array.isArray(chores) ? chores : [];
    const safeCheckIns = Array.isArray(checkIns) ? checkIns : [];
    const requiredChores = safeChores.filter((chore) => chore.chore_kind === "routine");
    const optionalChores = safeChores.filter((chore) => chore.chore_kind === "optional");
    const oneTimeChores = safeChores.filter((chore) => chore.chore_kind === "one_time");

    let requiredXp = 0;
    let missedRequiredCount = 0;
    let completedChoreCount = 0;

    requiredChores.forEach((chore) => {
      const progress = getRequiredProgress(chore, safeCheckIns);
      const isCompleted = isCompletedForGrowth(chore);
      requiredXp += progress.completedDates.length * 12;
      if (progress.isEligible) {
        requiredXp += 10;
      }
      if (isCompleted) {
        completedChoreCount += 1;
        requiredXp += 26;
      }
      missedRequiredCount += progress.missedDates.length;
    });

    const optionalXp = optionalChores.reduce(
      (sum, chore) => {
        const completed = isCompletedForGrowth(chore);
        if (completed) {
          completedChoreCount += 1;
        }

        return sum + getProofCount(chore, safeCheckIns) * 5 + (completed ? 18 : 0);
      },
      0,
    );

    const oneTimeXp = oneTimeChores.reduce((sum, chore) => {
      if (isCompletedForGrowth(chore)) {
        completedChoreCount += 1;
        return sum + 24;
      }

      if (chore.status === "submitted") {
        return sum + 6;
      }

      return sum + getProofCount(chore, safeCheckIns) * 4;
    }, 0);

    const consistencyBonus =
      missedRequiredCount === 0 && requiredChores.length > 0
        ? Math.min(requiredChores.length * 8, 32)
        : 0;
    const totalXp = requiredXp + optionalXp + oneTimeXp + consistencyBonus;
    const safeTotalXp = Number.isFinite(totalXp) ? Math.max(0, totalXp) : 0;
    const stageIndex = treeStages.reduce(
      (highest, stage, index) => (safeTotalXp >= stage.minXp ? index : highest),
      0,
    );
    const stage = treeStages[stageIndex] ?? treeStages[0];
    const nextStage = treeStages[stageIndex + 1] ?? null;
    const nextStageXp = nextStage?.minXp ?? null;
    const currentStageXp = safeTotalXp - stage.minXp;
    const stageRange = nextStage ? nextStage.minXp - stage.minXp : 0;
    const progressPercent =
      nextStage && stageRange > 0
        ? Math.min(100, Math.max(0, Math.round((currentStageXp / stageRange) * 100)))
        : 100;
    const choresTowardNextStage = Math.max(
      0,
      Math.ceil((stageRange - currentStageXp) / 24),
    );

    return {
      stage,
      stageIndex,
      totalXp: safeTotalXp,
      currentStageXp,
      nextStage,
      nextStageXp,
      stageRangeXp: stageRange,
      progressPercent,
      completedChoreCount,
      choresTowardNextStage,
      requiredXp: Number.isFinite(requiredXp) ? Math.max(0, requiredXp) : 0,
      optionalXp: Number.isFinite(optionalXp + oneTimeXp)
        ? Math.max(0, optionalXp + oneTimeXp)
        : 0,
      bonusXp: Number.isFinite(consistencyBonus) ? Math.max(0, consistencyBonus) : 0,
      missedRequiredCount: Number.isFinite(missedRequiredCount)
        ? Math.max(0, missedRequiredCount)
        : 0,
      growthPaused: missedRequiredCount > 0,
    };
  } catch (error) {
    console.warn("[Earned] Tree progress failed to calculate. Falling back to seedling.", error);
    return defaultTreeProgress;
  }
}
