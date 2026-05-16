"use client";

import { treeStages, TreeStageId } from "@/lib/growth-tree/tree-progress";
import { GrowthTreeStageArt } from "@/components/growth-tree/growth-tree-stage-art";

type GrowthTreeProps = {
  stageId?: TreeStageId | null;
  label?: string | null;
};

export function GrowthTree({ stageId, label }: GrowthTreeProps) {
  const stage = treeStages.find((candidate) => candidate.id === stageId) ?? treeStages[0];

  return <GrowthTreeStageArt label={label ?? stage.label} stageId={stage.id} />;
}

export default GrowthTree;
