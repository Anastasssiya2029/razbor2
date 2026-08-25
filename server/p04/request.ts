import { P04_SYSTEM_PROMPT } from "@/server/7k/prompts/p04.v1.2";
import { BUNDLE_RULES_VERSION, findBundleRule } from "@/server/7k/config/bundle-rules.v1";
import { resolveGrowthPriorityPlanFromInput } from "@/lib/growth-priority-plan";
import { SEVEN_K_ELEMENT_IDS, type SevenKScores } from "@/server/7k/types";
import type { P04PreparedInput } from "./stage-types";

const PLAIN_LANGUAGE_CONTRACT = `
<CLIENT_LANGUAGE_CONTRACT>
Пиши так, как сильный практик объясняет решение другу: коротко, конкретно и без языка доклада.
- Одна мысль в одном предложении; обычно не больше 24 слов.
- Сначала факт клиента, затем простое объяснение, затем смысл для бизнеса.
- Не используй абстрактные конструкции: «управленческий переход», «фиксация результата», «комплексный результат», «главный разрыв находится», «продажи остаются ситуативными».
- Не называй простое действие процессом, механизмом или направлением, если можно назвать его прямо.
- Не повторяй внутренние названия модулей и полей.
- Не меняй факты, баллы, роли, порядок, задачи и source refs ради более красивого текста.
Перед JSON молча перечитай только клиентские тексты. Если фразу нельзя понять с первого раза, перепиши её проще.
</CLIENT_LANGUAGE_CONTRACT>`;

const GROWTH_BUNDLE_SYNTHESIS_CONTRACT = `
<GROWTH_BUNDLE_SYNTHESIS_CONTRACT>
REPORT_GLOSSARY.businessLevers объясняет денежный смысл каждого элемента 7К.
Для growthPoint.coach_explanation:
- используй только правило из APPROVED_BUNDLE_RULE; это утверждённая связка для данного разбора;
- keyCreates объясняет, что создают ключевые элементы;
- supportingAdds объясняет вклад поддерживающих элементов;
- combinedEffect объединяет их в одну денежную задачу;
- checklistTask и doneWhen нельзя менять, расширять или подменять другими задачами;
- объясни простыми словами, что именно изменится в предложении, продаже и пути клиента;
- не называй один элемент главным, если несколько элементов образуют ключевую связку;
- не добавляй новые элементы, действия, обещания или цифры.
</GROWTH_BUNDLE_SYNTHESIS_CONTRACT>`;

function currentScores(input: P04PreparedInput): SevenKScores {
  return Object.fromEntries(
    SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, input.context.current.current7k[elementId].score]),
  ) as SevenKScores;
}

function selectedBundleRule(input: P04PreparedInput) {
  const plan = resolveGrowthPriorityPlanFromInput({
    currentScores: currentScores(input),
    targetScores: input.context.target.targetScores,
    priorityElement: input.context.strategy.bundle.priority_element,
    buildElements: input.context.strategy.bundle.build_elements,
    routeElements: input.context.resolvedPlan.cards.map((card) => card.elementId),
  });
  return findBundleRule(plan.core, plan.supporting);
}

export function buildP04SystemPrompt(
  input: P04PreparedInput,
  correction: string | null = null,
): string {
  const prompt = P04_SYSTEM_PROMPT
    .replace("{{P04_CONTEXT_JSON}}", JSON.stringify(input.context))
    .replace("{{REPORT_POLICY_JSON}}", JSON.stringify(input.reportPolicy))
    .replace("{{SOURCE_REGISTRY_JSON}}", JSON.stringify(input.sourceRegistry))
    .replace("{{REPORT_GLOSSARY_JSON}}", JSON.stringify(input.reportGlossary));
  const rule = selectedBundleRule(input);
  const approvedRule = `<APPROVED_BUNDLE_RULE>\n${JSON.stringify({ version: BUNDLE_RULES_VERSION, rule })}\n</APPROVED_BUNDLE_RULE>`;
  if (!correction) return `${prompt}\n\n${PLAIN_LANGUAGE_CONTRACT}\n\n${GROWTH_BUNDLE_SYNTHESIS_CONTRACT}\n\n${approvedRule}`;
  return `${prompt}\n\n${PLAIN_LANGUAGE_CONTRACT}\n\n${GROWTH_BUNDLE_SYNTHESIS_CONTRACT}\n\n${approvedRule}\n\n<CORRECTION_REQUIRED>\n${correction}\n</CORRECTION_REQUIRED>`;
}
