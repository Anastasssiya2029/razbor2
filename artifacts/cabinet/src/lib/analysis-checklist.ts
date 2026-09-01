import type { AnalysisResultV1 } from "./server/analysis-result-types";
import { resolveTransitionSequence, type TransitionTask } from "./server/7k/transition-resolver";
import type { SevenKElementId } from "./server/7k/types";
import { findBundleRule } from "./server/7k/config/bundle-rules.v1";
import { orderedGrowthElements, resolveGrowthPriorityPlan } from "./growth-priority-plan";

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

// Personalized checklist items authored by P-04's client_presentation layer.
// These replace the generic canonical task/done_when text for the client-facing
// checklist while staying grounded in the same immutable task_ids; the
// canonical Matrix 70 tasks (via resolveTransitionSequence) remain the source
// of truth and are used whenever an analysis has no client_presentation data
// (e.g. older stored analyses generated before this layer existed).
function clientPresentationTasks(
  narrative: AnalysisResultV1["report"]["routeCards"][number] | null,
): ChecklistTask[] | null {
  const items = narrative?.client_presentation?.items;
  if (!items || items.length === 0) return null;
  const seen = new Map<string, number>();
  return items.map((item) => {
    const occurrence = (seen.get(item.task_id) ?? 0) + 1;
    seen.set(item.task_id, occurrence);
    return {
      id: occurrence === 1 ? item.task_id : `${item.task_id}:${occurrence}`,
      source: "canonical" as const,
      task: item.client_task,
      doneWhen: item.client_done_when,
    };
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

// Below this weekly-hours figure, self-reported by the client on the diagnostic
// form (not an AI-inferred estimate), we treat owner overload as directly
// evidenced rather than inferred from team's maturity score.
const OWNER_OVERLOAD_WEEKLY_HOURS_THRESHOLD = 50;

// `team` reaching its target score only means the *current* target model no
// longer requires more of it -- it does not mean the owner has actually freed
// up time. When the client-reported weekly hours clearly show overload and
// `team` isn't already part of the growth bundle (core or supporting), the
// checklist still needs a concrete delegation action so that evidenced
// overload isn't silently dropped just because the score-based target was met.
function buildDelegationOverloadCard(
  result: AnalysisResultV1,
  growthPlan: { core: SevenKElementId[]; supporting: SevenKElementId[] },
  currentWeeklyHours: number | null | undefined,
  order: number,
): ChecklistCard | null {
  if (currentWeeklyHours == null || currentWeeklyHours < OWNER_OVERLOAD_WEEKLY_HOURS_THRESHOLD) return null;
  if (growthPlan.core.includes("team") || growthPlan.supporting.includes("team")) return null;
  const score = result.current.scores.team;
  return {
    elementId: "team",
    fromScore: score,
    toScore: score,
    order,
    narrative: null,
    tasks: [{
      id: "overload:team",
      source: "canonical",
      task: "Передать команде или помощнику одну конкретную повторяющуюся задачу, которая сейчас держится только на вас. Формальный уровень «Команда» уже достаточен для текущей цели, но при вашей недельной нагрузке рост системы упирается не в оценку этого элемента, а в реальные часы владельца.",
      doneWhen: "Есть ответственный, инструкция и срок передачи; задача выполняется без вашего ежедневного участия, а недельная нагрузка ощутимо снижается.",
    }],
  };
}

export function buildCanonicalChecklist(
  result: AnalysisResultV1,
  currentWeeklyHours?: number | null,
): ChecklistCard[] {
  const growthPlan = resolveGrowthPriorityPlan(result);
  const bundleRule = findBundleRule(growthPlan.core, growthPlan.supporting);
  const growthCards = orderedGrowthElements(growthPlan).map((elementId, index) => {
    const fromScore = result.current.scores[elementId];
    const toScore = result.target.targetScores[elementId];
    const resolvedCard = result.route.cards.find((card) => card.elementId === elementId);
    const narrative = resolvedCard
      ? result.report.routeCards.find((item) => item.card_id === resolvedCard.cardId) ?? null
      : null;
    const transitionTasks = clientPresentationTasks(narrative)
      ?? resolveTransitionSequence([
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
    return { elementId, fromScore, toScore, tasks, narrative, order: index + 1 };
  });
  const overloadCard = buildDelegationOverloadCard(result, growthPlan, currentWeeklyHours, growthCards.length + 1);
  return overloadCard ? [...growthCards, overloadCard] : growthCards;
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
