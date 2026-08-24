import type { AnalysisResultV1 } from "@/server/analysis-result";
import { resolveTransitionSequence } from "@/server/7k/transition-resolver";
import type { SevenKElementId } from "@/server/7k/types";
import { orderedGrowthElements, resolveGrowthPriorityPlan } from "@/lib/growth-priority-plan";

export const MANAGER_PLAN_VERSION = "manager-plan.v1" as const;

export type ChecklistTask = {
  id: string;
  source: "canonical" | "manager";
  task: string;
  doneWhen: string;
};

export type ChecklistCard = {
  elementId: SevenKElementId;
  fromScore: number;
  toScore: number;
  order: number;
  narrative: AnalysisResultV1["report"]["routeCards"][number] | null;
  tasks: ChecklistTask[];
};

export type ManagerPlanContent = {
  version: typeof MANAGER_PLAN_VERSION;
  cards: Array<{
    elementId: SevenKElementId;
    tasks: ChecklistTask[];
  }>;
};

export type ManagerPlanVersion = ManagerPlanContent & {
  sourceResultHash: string;
  revision: number;
  updatedAt: string;
};

export function buildCanonicalChecklist(result: AnalysisResultV1): ChecklistCard[] {
  const growthPlan = resolveGrowthPriorityPlan(result);
  return orderedGrowthElements(growthPlan).map((elementId, index) => {
    const fromScore = result.current.scores[elementId];
    const toScore = result.target.targetScores[elementId];
    const tasks = resolveTransitionSequence([
      { element_id: elementId, from_score: fromScore, to_score: toScore },
    ]).tasks.map((task) => ({
      id: task.task_id,
      source: "canonical" as const,
      task: task.task,
      doneWhen: task.done_when,
    }));
    const resolvedCard = result.route.cards.find((card) => card.elementId === elementId);
    const narrative = resolvedCard
      ? result.report.routeCards.find((item) => item.card_id === resolvedCard.cardId) ?? null
      : null;
    return { elementId, fromScore, toScore, tasks, narrative, order: index + 1 };
  });
}

export function applyManagerPlan(
  canonicalCards: ChecklistCard[],
  managerPlan: ManagerPlanVersion | null | undefined,
  sourceResultHash: string,
): ChecklistCard[] {
  if (!managerPlan || managerPlan.sourceResultHash !== sourceResultHash) return canonicalCards;
  const edits = new Map(managerPlan.cards.map((card) => [card.elementId, card.tasks]));
  return canonicalCards.map((card) => ({ ...card, tasks: edits.get(card.elementId) ?? card.tasks }));
}

export function managerPlanContentFromCards(cards: ChecklistCard[]): ManagerPlanContent {
  return {
    version: MANAGER_PLAN_VERSION,
    cards: cards.map((card) => ({
      elementId: card.elementId,
      tasks: card.tasks.map((task) => ({ ...task })),
    })),
  };
}
