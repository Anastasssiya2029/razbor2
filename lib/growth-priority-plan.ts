import type { AnalysisResultV1 } from "@/server/analysis-result";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId } from "@/server/7k/types";

const SOFT_ELEMENTS = new Set<SevenKElementId>(["authenticity", "audience"]);

export type GrowthPriorityPlan = {
  core: SevenKElementId[];
  supporting: SevenKElementId[];
  deferred: SevenKElementId[];
};

function unique(values: readonly SevenKElementId[]): SevenKElementId[] {
  return values.filter((value, index, all) => all.indexOf(value) === index);
}

export function resolveGrowthPriorityPlan(result: AnalysisResultV1): GrowthPriorityPlan {
  const growing = SEVEN_K_ELEMENT_IDS.filter(
    (elementId) => result.target.targetScores[elementId] > result.current.scores[elementId],
  );
  const selected = unique([
    ...(result.strategy.bundle.priority_element ? [result.strategy.bundle.priority_element] : []),
    ...result.strategy.bundle.build_elements,
  ]).filter((elementId) => growing.includes(elementId));
  const routeOrder = unique(result.route.cards.map((card) => card.elementId))
    .filter((elementId) => growing.includes(elementId));
  const ordered = unique([...selected, ...routeOrder, ...growing]);

  let core: SevenKElementId[] = selected.filter((elementId) => !SOFT_ELEMENTS.has(elementId));

  // Если продукт входит в денежную связку, а целевая модель одновременно требует
  // усилить технологию продаж, эти два твёрдых элемента должны расти вместе.
  if (
    result.strategy.bundle.priority_element === "product_method"
    && result.current.scores.sales_technology <= 2
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

  const supporting = unique([
    ...ordered.filter((elementId) => SOFT_ELEMENTS.has(elementId)),
    ...selected.filter((elementId) => !SOFT_ELEMENTS.has(elementId) && !core.includes(elementId)),
  ]).slice(0, 2);
  const assigned = new Set([...core, ...supporting]);
  const deferred = ordered.filter((elementId) => !assigned.has(elementId));

  return { core: core.slice(0, 2), supporting, deferred };
}

export function growthRole(
  plan: GrowthPriorityPlan,
  elementId: SevenKElementId,
): "Главный элемент" | "Ключевой элемент" | "Поддерживающий элемент" | "Следующий этап" {
  if (plan.core[0] === elementId) return "Главный элемент";
  if (plan.core.includes(elementId)) return "Ключевой элемент";
  if (plan.supporting.includes(elementId)) return "Поддерживающий элемент";
  return "Следующий этап";
}

export function orderedGrowthElements(plan: GrowthPriorityPlan): SevenKElementId[] {
  return [...plan.core, ...plan.supporting, ...plan.deferred];
}
