import { P04_SYSTEM_PROMPT } from "@/server/7k/prompts/p04.v1.2";
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
- возьми только priority_element и build_elements из утверждённой P-02 связки;
- соедини их businessLevers в одну причинную бизнес-задачу, а не перечисляй подписи;
- отдельно покажи, что создают ключевые элементы и как поддерживающие элементы помогают это упаковать или внедрить;
- объясни простыми словами, что именно изменится в предложении, продаже и пути клиента;
- не называй один элемент главным, если несколько элементов образуют ключевую связку;
- не добавляй новые элементы, действия, обещания или цифры.
Пример логики, не готовый текст: продукт задаёт более дорогой результат, технология продаж помогает его продать, а аудитория и аутентичность делают предложение точным и узнаваемым для своего клиента.
</GROWTH_BUNDLE_SYNTHESIS_CONTRACT>`;

export function buildP04SystemPrompt(
  input: P04PreparedInput,
  correction: string | null = null,
): string {
  const prompt = P04_SYSTEM_PROMPT
    .replace("{{P04_CONTEXT_JSON}}", JSON.stringify(input.context))
    .replace("{{REPORT_POLICY_JSON}}", JSON.stringify(input.reportPolicy))
    .replace("{{SOURCE_REGISTRY_JSON}}", JSON.stringify(input.sourceRegistry))
    .replace("{{REPORT_GLOSSARY_JSON}}", JSON.stringify(input.reportGlossary));
  if (!correction) return `${prompt}\n\n${PLAIN_LANGUAGE_CONTRACT}\n\n${GROWTH_BUNDLE_SYNTHESIS_CONTRACT}`;
  return `${prompt}\n\n${PLAIN_LANGUAGE_CONTRACT}\n\n${GROWTH_BUNDLE_SYNTHESIS_CONTRACT}\n\n<CORRECTION_REQUIRED>\n${correction}\n</CORRECTION_REQUIRED>`;
}
