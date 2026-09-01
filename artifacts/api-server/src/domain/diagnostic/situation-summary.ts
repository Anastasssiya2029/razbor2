import { completeOpenRouterJson } from "../../reference/server/ai/openrouter-json";
import { withCallLogging, type GenericProvider } from "../../reference/server/ai/call-log";

export class SituationSummaryConfigurationError extends Error {
  readonly code = "SITUATION_SUMMARY_CONFIGURATION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "SituationSummaryConfigurationError";
  }
}

export class SituationSummaryGenerationError extends Error {
  readonly code = "SITUATION_SUMMARY_GENERATION_ERROR" as const;

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SituationSummaryGenerationError";
  }
}

export interface SituationSummary {
  text: string;
  source: "ai" | "fallback";
}

// ---------------------------------------------------------------------------
// 1. Whitelist-only input. This is the ONLY data that may reach the model or
// the fallback builder for the "Ваша ситуация" confirmation block. Anything
// not listed here (client results/case studies, best period, failures,
// team/uniqueness/sales/sources/clientPath/socialAssets used for 7K scoring)
// must never be passed in, per the block's contract: it is a pre-analysis
// point A / point B / obstacles sanity check, not a business-system read.
// ---------------------------------------------------------------------------

export interface SituationConfirmationInput {
  pointB: {
    goalIncome?: string;
    deadline?: string;
    goalModel?: string;
    additionalTargets: string[];
  };
  pointA: {
    currentIncome?: string;
    currentModel?: string;
    currentFacts: string[];
  };
  perceivedObstacles: string[];
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// Money figures (the goal amount and the current income) get wrapped in
// **bold** markers right at the source. Both the deterministic fallback and
// the AI path are instructed to copy this markup through verbatim rather
// than re-deciding what to bold -- this is far more reliable than asking
// either path to locate "the right number" inside a full sentence after
// the fact.
function cleanMoney(value: string | undefined): string | undefined {
  const trimmed = clean(value);
  return trimmed ? `**${trimmed}**` : undefined;
}

// Best-effort deterministic reformulation of a couple of common obstacle
// phrasings. This only runs on the no-AI fallback path (the AI path gets
// the equivalent instructions in SYSTEM_PROMPT and can additionally merge
// several sentences about the same underlying issue into one thesis, which
// a regex cannot do reliably).
const NOT_UNDERSTANDING_TRANSITION = /(не знаю|не понимаю)[^.!?]*(переход|дальше|двигаться|развива|следующ[а-я]* уровень)/iu;
const BELIEVES_SOLUTION_IS = /(?:мне кажется|я думаю|я считаю)[^.!?]*?поможет(?:\s+(?:мне\s+)?перейти(?:\s+на\s+(?:следующий|новый)\s+уровень)?)?[,:\s-]*(.+)/iu;

function applyObstacleHeuristics(obstacle: string): string {
  if (NOT_UNDERSTANDING_TRANSITION.test(obstacle)) {
    return "Вы не понимаете, как сделать этот переход.";
  }
  const believesMatch = obstacle.match(BELIEVES_SOLUTION_IS);
  const believedSolution = believesMatch?.[1]?.trim().replace(/[.!?]+$/u, "");
  if (believedSolution) {
    return `Вы считаете, что сделать переход вам поможет ${believedSolution}.`;
  }
  return obstacle;
}

function normalizeForDedupe(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function dedupeObstacles(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = normalizeForDedupe(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function splitObstacles(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const pieces = raw
    .split(/\r?\n|(?<=[.!?])\s+(?=[А-ЯA-Z])|•|(?:^|\s)-\s+/gu)
    .map((piece) => piece.trim().replace(/^[-•\d.)\s]+/u, "").trim())
    .filter(Boolean)
    .map(applyObstacleHeuristics);
  // No count cap and no per-item truncation: every obstacle the client
  // actually named must reach the confirmation text.
  return dedupeObstacles(pieces);
}

export function buildSituationConfirmationInput(answers: Record<string, string>): SituationConfirmationInput {
  const additionalTargets: string[] = [];
  const delegate = clean(answers.delegate);
  if (delegate) additionalTargets.push(`делегировать: ${delegate}`);
  const systemTime = clean(answers.systemTime);
  if (systemTime) additionalTargets.push(`желаемая нагрузка при выстроенной системе: ${systemTime} ч/нед`);

  const currentFacts: string[] = [];
  const clientsCount = clean(answers.clientsCount);
  if (clientsCount) currentFacts.push(`клиентов в месяц: ${clientsCount}`);
  // Only surface current workload if the client actually named a workload
  // target (systemTime) — otherwise it's an unmatched category per the
  // "compare like categories" rule and should be left out.
  const weeklyTime = clean(answers.weeklyTime);
  if (weeklyTime && systemTime) currentFacts.push(`текущая занятость: ${weeklyTime} ч/нед`);

  return {
    pointB: {
      goalIncome: cleanMoney(answers.goalIncome),
      deadline: clean(answers.deadline),
      goalModel: clean(answers.goalModel),
      additionalTargets,
    },
    pointA: {
      currentIncome: cleanMoney(answers.currentIncome),
      currentModel: clean(answers.products),
      currentFacts,
    },
    perceivedObstacles: splitObstacles(answers.struggles),
  };
}

// ---------------------------------------------------------------------------
// 2. AI shortening pass: takes ONLY the SituationConfirmationInput object.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Ты формируешь короткую сверку перед расчётом диагностики бизнес-системы 7К.

Твоя задача - не анализировать бизнес и не давать рекомендации, а точно и кратко проверить, правильно ли сервис понял клиента.

Работай только с данными из переданного объекта. Не добавляй знания из других полей, не делай выводов и не придумывай причины.

Собери текст по логике:
1. Точка Б: какой основной измеримый результат хочет получить клиент, за какой срок и на какой модели. Если результат выражен в деньгах, всегда формулируй его как доход за месяц (в месяц) — даже если клиент сам не уточнил период явно в этом поле.
2. Дополнительные цели: что ещё должно измениться в важных категориях - продукте, роли владельца, нагрузке, команде, продажах или других прямо указанных категориях.
3. Мотивация: зачем это клиенту. Добавляй только при наличии прямого основания во входных данных.
4. Точка А: где клиент находится сейчас. Сопоставляй её с теми же категориями, которые названы в точке Б. Если доход выражен в деньгах, тоже формулируй его как доход за месяц (в месяц). Если известно, за счёт чего клиент сейчас зарабатывает (currentModel), опиши это обобщённо, как тип или направление деятельности в целом — не перечисляй отдельные продукты или услуги по одному, даже если во входных данных они перечислены списком.
5. Названные клиентом препятствия: перечисли все существенные трудности, которые клиент прямо называет, — не ограничивай список произвольным числом пунктов, но и не придумывай пункты, которых нет во входных данных. Если несколько формулировок клиента по сути описывают одну и ту же трудность, объедини их в один общий, более практичный тезис вместо того, чтобы перечислять близкие по смыслу пункты отдельно. Например, если клиент несколькими фразами говорит, что пришло лето, он не ожидал сезонности и не понимает, почему просели продажи, — это один тезис: "Вы не понимаете, как работать в несезонный период, чтобы не уходить в минус." Если клиент прямо называет, что, по его мнению, поможет ему перейти на следующий уровень, сформулируй пункт как "Вы считаете, что сделать переход вам поможет <то, что он назвал>." Если клиент говорит, что не знает или не понимает, что поможет сделать переход, сформулируй пункт как "Вы не понимаете, как сделать этот переход." Это субъективное видение клиента до диагностики, а не вывод AI.

Запрещено включать:
- результаты клиентов и кейсы;
- лучший период;
- прошлые ошибки и провалы;
- баллы, архетип, рекомендации и задачи;
- выводы о скрытой или системной первопричине;
- сведения, которых нет во входном объекте.

Сохраняй точные суммы, сроки, цены и другие числа. Не меняй их и не округляй. Не повторяй одну мысль разными словами.

Денежные суммы во входных данных (goalIncome, currentIncome) уже могут быть обёрнуты в двойные звёздочки, например **500 000 рублей**. Копируй эту разметку дословно на то же место в своём тексте — не убирай её и не добавляй новую в других местах.

Верни JSON строго следующего вида:
{
  "pointB": "краткое описание точки Б",
  "additionalTargets": ["дополнительная цель"],
  "motivation": "мотивация или null",
  "pointA": "краткое описание точки А в сопоставимых категориях",
  "perceivedObstacles": ["препятствие 1", "препятствие 2"]
}`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    pointB: { type: "string" },
    additionalTargets: { type: "array", items: { type: "string" } },
    motivation: { type: ["string", "null"] },
    pointA: { type: "string" },
    perceivedObstacles: { type: "array", items: { type: "string" } },
  },
  required: ["pointB", "additionalTargets", "motivation", "pointA", "perceivedObstacles"],
  additionalProperties: false,
} as const;

const MAX_FIELD_LENGTH = 220;

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

interface ShortenedSituation {
  pointB: string;
  additionalTargets: string[];
  motivation: string | null;
  pointA: string;
  perceivedObstacles: string[];
}

function parseShortenedSituation(rawText: string): ShortenedSituation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new SituationSummaryGenerationError("Модель вернула невалидный JSON", error);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new SituationSummaryGenerationError("Модель вернула неожиданный формат ответа");
  }
  const record = parsed as Record<string, unknown>;

  const pointB = record.pointB;
  if (typeof pointB !== "string" || !pointB.trim()) {
    throw new SituationSummaryGenerationError('Модель не заполнила поле "pointB"');
  }
  const pointA = record.pointA;
  if (typeof pointA !== "string" || !pointA.trim()) {
    throw new SituationSummaryGenerationError('Модель не заполнила поле "pointA"');
  }
  const perceivedObstaclesRaw = record.perceivedObstacles;
  if (!Array.isArray(perceivedObstaclesRaw) || !perceivedObstaclesRaw.every((item) => typeof item === "string")) {
    throw new SituationSummaryGenerationError('Модель вернула некорректное поле "perceivedObstacles"');
  }
  const additionalTargetsRaw = record.additionalTargets;
  const additionalTargets =
    Array.isArray(additionalTargetsRaw) && additionalTargetsRaw.every((item) => typeof item === "string")
      ? additionalTargetsRaw.map((item) => truncate(item, MAX_FIELD_LENGTH)).filter(Boolean)
      : [];
  const motivationRaw = record.motivation;
  const motivation = typeof motivationRaw === "string" && motivationRaw.trim() ? truncate(motivationRaw, MAX_FIELD_LENGTH) : null;

  return {
    pointB: truncate(pointB, MAX_FIELD_LENGTH),
    additionalTargets,
    motivation,
    pointA: truncate(pointA, MAX_FIELD_LENGTH),
    // No count cap and no per-item truncation here either: every obstacle
    // the model reports back must reach the confirmation text intact.
    perceivedObstacles: dedupeObstacles(perceivedObstaclesRaw.map((item) => item.trim())).filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// 3. Deterministic text assembly — shared by both the AI path and the
// no-AI fallback, so the final rendering rules (no empty clauses, no
// "чтобы" without motivation, etc.) live in exactly one place.
// ---------------------------------------------------------------------------

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} и ${items[items.length - 1]}`;
}

// The final sentence always starts with a fixed "Сейчас ..." prefix (below).
// The substituted pointA text comes either from the AI (no control over its
// wording) or the deterministic fallback, and either can independently start
// with "сейчас" — strip a redundant leading occurrence so the two sources
// never collide into "Сейчас сейчас ...".
function stripRedundantLeadingSeychas(text: string): string {
  return text.replace(/^\s*сейчас\s*,?\s*/iu, "");
}

function assembleSituationText(shortened: ShortenedSituation): string {
  const additionalClause = shortened.additionalTargets.length ? ` и ${joinWithAnd(shortened.additionalTargets)}` : "";
  const motivationClause = shortened.motivation ? `, чтобы ${shortened.motivation}` : "";
  const pointA = stripRedundantLeadingSeychas(shortened.pointA);

  const lines: string[] = ["Итак, давайте сверимся, правильно ли мы вас поняли.", ""];
  lines.push(`Вы хотите ${shortened.pointB}${additionalClause}${motivationClause}.`, "");
  lines.push(`Сейчас ${pointA}.`);

  if (shortened.perceivedObstacles.length > 0) {
    lines.push("", "**Среди главных препятствий вы называете:**");
    shortened.perceivedObstacles.forEach((obstacle, index) => {
      lines.push(`${index + 1}. ${obstacle}`);
    });
  }

  lines.push("", "Всё верно? Мы ничего важного не пропустили?");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 4. Fallback (no AI): builds the same shape directly from the whitelist
// object, with a safe per-field length limit instead of AI paraphrasing.
// ---------------------------------------------------------------------------

// Generalizes a raw "what do you sell" answer instead of enumerating every
// item verbatim. A single named product/service is still stated plainly;
// once the client lists more than one, we switch to a generic "you have a
// few products/directions" phrasing rather than reading the list back item
// by item (real paraphrasing of *what kind* of business it is needs the AI
// path — this fallback only avoids the literal enumeration).
function summarizeCurrentModel(raw: string): string {
  const items = raw
    .split(/\r?\n|[,;]|\s+и\s+/giu)
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length > 1) {
    return "у вас есть несколько продуктов, которые приносят доход";
  }
  return `вы зарабатываете на ${raw}`;
}

function buildFallbackShortenedSituation(input: SituationConfirmationInput): ShortenedSituation {
  const pointBParts: string[] = [];
  if (input.pointB.goalIncome) pointBParts.push(`выйти на ${input.pointB.goalIncome} в месяц`);
  if (input.pointB.deadline) pointBParts.push(`за ${input.pointB.deadline}`);
  if (input.pointB.goalModel) pointBParts.push(`за счёт ${input.pointB.goalModel}`);
  const pointB = truncate(pointBParts.length ? pointBParts.join(", ") : "изменить текущую бизнес-систему", MAX_FIELD_LENGTH);

  const pointAParts: string[] = [];
  if (input.pointA.currentIncome) pointAParts.push(`ваш доход — ${input.pointA.currentIncome} в месяц`);
  if (input.pointA.currentModel) pointAParts.push(summarizeCurrentModel(input.pointA.currentModel));
  pointAParts.push(...input.pointA.currentFacts);
  const pointA = truncate(pointAParts.length ? pointAParts.join(", ") : "мы уточняем вашу текущую точку А", MAX_FIELD_LENGTH);

  return {
    pointB,
    additionalTargets: input.pointB.additionalTargets.map((item) => truncate(item, MAX_FIELD_LENGTH)),
    motivation: null,
    pointA,
    perceivedObstacles: input.perceivedObstacles,
  };
}

// ---------------------------------------------------------------------------
// 5. Public entry point.
// ---------------------------------------------------------------------------

export interface SituationSummaryEnvironment {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_BASE_URL?: string;
  SITUATION_SUMMARY_AI_MODEL?: string;
  P01_AI_MODEL?: string;
}

export async function generateSituationSummary(
  answers: Record<string, string>,
  environment: SituationSummaryEnvironment,
  sessionId: string,
): Promise<SituationSummary> {
  const input = buildSituationConfirmationInput(answers);
  const hasAnyData =
    Boolean(
      input.pointB.goalIncome ||
        input.pointB.deadline ||
        input.pointB.goalModel ||
        input.pointB.additionalTargets.length ||
        input.pointA.currentIncome ||
        input.pointA.currentModel ||
        input.pointA.currentFacts.length ||
        input.perceivedObstacles.length,
    );
  if (!hasAnyData) {
    throw new SituationSummaryGenerationError("Нет данных для формирования сверки");
  }

  try {
    const apiKey = environment.OPENROUTER_API_KEY?.trim();
    const model = environment.SITUATION_SUMMARY_AI_MODEL?.trim() || environment.P01_AI_MODEL?.trim();
    if (!apiKey) throw new SituationSummaryConfigurationError("OPENROUTER_API_KEY is not configured");
    if (!model) throw new SituationSummaryConfigurationError("SITUATION_SUMMARY_AI_MODEL is not configured");

    // Wrapped with the same withCallLogging instrumentation as P01-P04 so
    // this real OpenRouter spend lands in ai_call_log (and therefore in the
    // architect-facing cost total) instead of being silently uncounted. No
    // analysisRunId exists yet at this point in the flow -- the row is
    // logged against sessionId and reconciled to a real run later if/when
    // the client submits (see reconcileSituationSummaryCallLogs).
    const baseUrl = environment.OPENROUTER_BASE_URL;
    const rawProvider: GenericProvider = {
      provider: "openrouter",
      model,
      complete: (request) =>
        completeOpenRouterJson({
          apiKey,
          model,
          baseUrl,
          appUrl: null,
          appTitle: "7K Business Diagnostic",
          structuredOutput: true,
          schemaName: request.schemaName ?? "situation_confirmation_v1",
          outputSchema: request.outputSchema,
          systemPrompt: request.systemPrompt,
          timeoutMs: 45_000,
        }),
    };
    const provider = withCallLogging(rawProvider, {
      module: "situation_summary",
      analysisRunId: null,
      situationSessionId: sessionId,
    });

    const response = await provider.complete({
      systemPrompt: `${SYSTEM_PROMPT}\n\nВходные данные:\n${JSON.stringify(input)}`,
      outputSchema: OUTPUT_SCHEMA,
      correction: null,
      schemaName: "situation_confirmation_v1",
    });

    const shortened = parseShortenedSituation(response.text);
    return { text: assembleSituationText(shortened), source: "ai" };
  } catch {
    // Any AI failure (misconfiguration, timeout, network error, invalid
    // JSON) falls back to the deterministic whitelist-only text rather than
    // surfacing a broken confirmation screen or reusing a stale result.
    return { text: assembleSituationText(buildFallbackShortenedSituation(input)), source: "fallback" };
  }
}
