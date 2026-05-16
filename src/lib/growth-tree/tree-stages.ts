export type TreeStageId = "seedling" | "sapling" | "young_tree" | "mature_tree" | "large_tree";

export type TreeStage = {
  id: TreeStageId;
  label: string;
  minXp: number;
};

export type TreeProgress = {
  stage: TreeStage;
  stageIndex: number;
  totalXp: number;
  currentStageXp: number;
  nextStage: TreeStage | null;
  nextStageXp: number | null;
  progressPercent: number;
  requiredXp: number;
  optionalXp: number;
  bonusXp: number;
  missedRequiredCount: number;
  growthPaused: boolean;
};

export const treeStages: TreeStage[] = [
  { id: "seedling", label: "Seedling", minXp: 0 },
  { id: "sapling", label: "Sapling", minXp: 60 },
  { id: "young_tree", label: "Young tree", minXp: 150 },
  { id: "mature_tree", label: "Mature tree", minXp: 280 },
  { id: "large_tree", label: "Large tree", minXp: 450 },
];

export const defaultTreeProgress: TreeProgress = {
  stage: treeStages[0],
  stageIndex: 0,
  totalXp: 0,
  currentStageXp: 0,
  nextStage: treeStages[1],
  nextStageXp: treeStages[1].minXp,
  progressPercent: 0,
  requiredXp: 0,
  optionalXp: 0,
  bonusXp: 0,
  missedRequiredCount: 0,
  growthPaused: false,
};
