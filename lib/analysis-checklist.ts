import type { AnalysisResultV1 } from "@/server/analysis-result";
import { resolveTransitionSequence, type TransitionTask } from "@/server/7k/transition-resolver";
import type { SevenKElementId } from "@/server/7k/types";
import { findBundleRule } from "@/server/7k/config/bundle-rules.v1";
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

function splitTaskText(value: string): string[] {
  const lines = value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLines = lines.filter((line) => /^[•●]\s*/u.test(line));
  if (bulletLines.length < 2 || bulletLines.length !== lines.length) return [value.trim()];
  return bulletLines.map((line) => line.replace(/^[•●]\s*/u, "").trim());
}

function splitDoneWhen(value: string, count: number): string[] {
  const clauses = value.split(/;\s*/u).map((part) => part.trim()).filter(Boolean);
  return clauses.length === count ? clauses : Array.from({ length: count }, () => value.trim());
}

export function splitCanonicalTransitionTask(task: TransitionTask): ChecklistTask[] {
  return splitChecklistTask({
    id: task.task_id,
    source: "canonical",
    task: task.task,
    doneWhen: task.done_when,
  });
}

export function splitChecklistTask(task: ChecklistTask): ChecklistTask[] {
  const taskParts = splitTaskText(task.task);
  const doneWhenParts = splitDoneWhen(task.doneWhen, taskParts.length);
  return taskParts.map((taskText, index) => ({
    id: index === 0 ? task.id : `${task.id}:${index + 1}`,
    source: task.source,
    task: taskText,
    doneWhen: doneWhenParts[index],
  }));
}

export function buildCanonicalChecklist(result: AnalysisResultV1): ChecklistCard[] {
  const growthPlan = resolveGrowthPriorityPlan(result);
  const bundleRule = findBundleRule(growthPlan.core, growthPlan.supporting);
  return orderedGrowthElements(growthPlan).map((elementId, index) => {
    const fromScore = result.current.scores[elementId];
    const toScore = result.target.targetScores[elementId];
    const transitionTasks = resolveTransitionSequence([
      { element_id: elementId, from_score: fromScore, to_score: toScore },
    ]).tasks.flatMap(splitCanonicalTransitionTask);
    const tasks = index === 0 && bundleRule
      ? [{
          id: `bundle:${bundleRule.id}`,
          source: "canonical" as const,
          task: bundleRule.checklistTask,
          doneWhen: bundleRule.doneWhen,
        }, ...transitionTasks]
      : transitionTasks;
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
  return canonicalCards.map((card) => {
    const savedTasks = edits.get(card.elementId);
    if (!savedTasks) return card;
    // Older manager-plan revisions could contain several bullet items inside one
    // saved canonical task. Normalize them before merging so existing analyses
    // receive the same one-checkpoint-per-task presentation as new analyses.
    const normalizedSavedTasks = savedTasks.flatMap(splitChecklistTask);
    const savedById = new Map(normalizedSavedTasks.map((task) => [task.id, task]));
    const canonicalIds = new Set(card.tasks.map((task) => task.id));
    return {
      ...card,
      tasks: [
        ...card.tasks.map((task) => savedById.get(task.id) ?? task),
        ...normalizedSavedTasks.filter((task) => task.source === "manager" && !canonicalIds.has(task.id)),
      ],
    };
  });
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
