import type { AnalysisResultV1 } from "@/server/analysis-result/types";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId, type SevenKScores } from "@/server/7k/types";

const SOFT_ELEMENTS = new Set<SevenKElementId>(["authenticity", "audience"]);

export type GrowthPriorityPlan = {
  core: SevenKElementId[];
  supporting: SevenKElementId[];
  deferred: SevenKElementId[];
};

export type GrowthPriorityPlanInput = {
  currentScores: SevenKScores;
  targetScores: SevenKScores;
  priorityElement: SevenKElementId | null;
  buildElements: SevenKElementId[];
  routeElements: SevenKElementId[];
};

function unique(values: readonly SevenKElementId[]): SevenKElementId[] {
  return values.filter((value, index, all) => all.indexOf(value) === index);
}

function sortByMissingLevels(
  input: Pick<GrowthPriorityPlanInput, "currentScores" | "targetScores">,
  elementIds: readonly SevenKElementId[],
): SevenKElementId[] {
  return elementIds
    .map((elementId, index) => ({
      elementId,
      index,
      missingLevels: input.targetScores[elementId] - input.currentScores[elementId],
    }))
    .sort((left, right) => right.missingLevels - left.missingLevels || left.index - right.index)
    .map(({ elementId }) => elementId);
}

export function resolveGrowthPriorityPlanFromInput(input: GrowthPriorityPlanInput): GrowthPriorityPlan {
  const growing = SEVEN_K_ELEMENT_IDS.filter(
    (elementId) => input.targetScores[elementId] > input.currentScores[elementId],
  );
  const selected = unique([
    ...(input.priorityElement ? [input.priorityElement] : []),
    ...input.buildElements,
  ]).filter((elementId) => growing.includes(elementId));
  const routeOrder = unique(input.routeElements)
    .filter((elementId) => growing.includes(elementId));
  const ordered = unique([...selected, ...routeOrder, ...growing]);

  let core: SevenKElementId[] = selected.filter((elementId) => !SOFT_ELEMENTS.has(elementId));

  // Если продукт входит в денежную связку, а целевая модель одновременно требует
  // усилить технологию продаж, эти два твёрдых элемента должны расти вместе.
  if (
    input.priorityElement === "product_method"
    && input.currentScores.sales_technology <= 2
    && growing.includes("sales_technology")
  ) {
    core = ["product_method", "sales_technology"];
  }

  if (core.length === 0) {
    const firstHard = ordered.find((elementId) => !SOFT_ELEMENTS.has(elementId));
    if (firstHard) core.push(firstHard);
  }
  for (const elementId of ordered) {
    if (core.length >= 2) break;
    if (!SOFT_ELEMENTS.has(elementId) && !core.includes(elementId)) core.push(elementId);
  }

  const sortedCore = sortByMissingLevels(input, core.slice(0, 2));
  const supporting = sortByMissingLevels(
    input,
    ordered.filter((elementId) => !sortedCore.includes(elementId)),
  );

  return { core: sortedCore, supporting, deferred: [] };
}

export function resolveGrowthPriorityPlan(result: AnalysisResultV1): GrowthPriorityPlan {
  return resolveGrowthPriorityPlanFromInput({
    currentScores: result.current.scores,
    targetScores: result.target.targetScores,
    priorityElement: result.strategy.bundle.priority_element,
    buildElements: result.strategy.bundle.build_elements,
    routeElements: result.route.cards.map((card) => card.elementId),
  });
}

export function growthRole(
  plan: GrowthPriorityPlan,
  elementId: SevenKElementId,
): "Ключевой элемент" | "Поддерживающий элемент" | "Следующий этап" {
  if (plan.core.includes(elementId)) return "Ключевой элемент";
  if (plan.supporting.includes(elementId)) return "Поддерживающий элемент";
  return "Следующий этап";
}

export function orderedGrowthElements(plan: GrowthPriorityPlan): SevenKElementId[] {
  return [...plan.core, ...plan.supporting, ...plan.deferred];
}
