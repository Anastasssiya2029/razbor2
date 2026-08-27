import baseScoringRules from "./scoring-rules.v2.0.json";
import { RESILIENCE_RULES_RESOURCE_VERSION, getResilienceFrame, type ResilienceFrame } from "./resilience-rules.v1";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId } from "../types";

export const SCORING_RULES_RESOURCE_VERSION = "scoring-rules.v3.0" as const;

export type ScoringLevelRuleV3 = {
  score: number;
  ruleId: string;
  criterion: string;
  mandatoryCore: readonly string[];
  alternativeEvidencePaths: readonly string[];
  supportingSignals: readonly string[];
  blockers: readonly string[];
  resilience: ResilienceFrame | null;
  nextLevelGate: string | null;
  nextLevelRuleId: string | null;
};

export type ElementScoringRulesV3 = {
  elementId: SevenKElementId;
  evidenceDimensions: string[];
  falseFriends: string[];
  managerQuestions?: string[];
  levels: ScoringLevelRuleV3[];
};

const legacy = baseScoringRules as {
  source: { document: string; sha256: string; importPolicy: string };
  algorithm: "highest_fully_supported_cumulative";
  elements: Record<SevenKElementId, {
    elementId: SevenKElementId;
    evidenceDimensions: string[];
    falseFriends: string[];
    managerQuestions?: string[];
    levels: Array<{ score: number; ruleId: string; criterion: string; nextLevelGate: string | null; nextLevelRuleId: string | null }>;
  }>;
};

const LEVEL_CRITERION_OVERRIDES: Partial<Record<SevenKElementId, Record<number, string>>> = {
  authenticity: {
    8: "Повторяющиеся причины выбора превращены в зафиксированный код бренда: понятны ключевые смыслы, голос, образы и ограничения, которые усиливают доверие и выбор.",
    9: "Команда воспроизводит код бренда на разных площадках и в разных форматах без полного переписывания владельцем; узнаваемость не зависит от одного исполнителя.",
    10: "Команда самостоятельно поддерживает и развивает узнаваемый бренд на нескольких площадках, управляя его качеством и влиянием на выбор без ежедневного участия владельца.",
  },
  audience: {
    8: "Есть минимум два подтверждённых покупками и результатами сегмента, подсегмента или клиентских сценария; для каждого понятны различия, подходящий продукт и обещаемый результат.",
    9: "Для подтверждённых сегментов работают разные продукты, офферы и воронки; вклад, конверсия и концентрация выручки измеряются отдельно.",
    10: "Команда самостоятельно исследует, развивает и балансирует портфель сегментов, продуктов, офферов и воронок на основе данных.",
  },
  product_method: {
    7: "Авторский метод, технология или система сформулированы и встроены во флагман; продуктовая линейка последовательно ведёт клиента к ключевому результату.",
    8: "Минимум два продукта реально продаются, а переходы, повторные покупки, cross-sell или up-sell подтверждены фактами и повторяемыми результатами.",
    9: "Продуктовый портфель приносит распределённую выручку, а другие специалисты воспроизводят авторский метод без потери результата; владелец управляет качеством и развитием.",
    10: "Команда самостоятельно управляет продуктовым портфелем, качеством, переходами, повторными продажами и развитием метода; владелец сохраняет стратегическую и методологическую роль.",
  },
  sales_technology: {
    8: "Стандартная первая продажа до оплаты воспроизводится менеджером; есть контроль качества, понятные случаи подключения владельца и рабочая замена или подготовленный резерв.",
    9: "Работают первая и повторная продажи, продления, допродажи и реактивация; несколько сотрудников воспроизводят технологию, а повторная выручка и LTV измеряются.",
    10: "Руководитель продаж самостоятельно управляет командой, планом, первой и повторной выручкой, обучением, аналитикой и развитием технологии без операционного участия владельца.",
  },
  funnel: {
    6: "Есть одна доказанная воронка с повторяемыми оплатами: контакты сохраняются в собственной базе, часть пути автоматизирована, известны основные конверсии и места потери.",
    7: "Одна доказанная воронка получает трафик минимум из двух независимых источников; по каждому видны лиды, оплаты и экономика, поэтому просадка одного источника не останавливает продажи.",
    8: "Работают минимум две различающиеся воронки с распределёнными источниками; каждая имеет своё предложение или механику и даёт измеримые оплаты.",
    9: "Портфель воронок работает до и после оплаты: измеряются CAC, LTV, повторная выручка и концентрация по источникам, продуктам и путям.",
    10: "Команда автономно управляет портфелем источников и воронок до и после оплаты, перераспределяет ресурсы и заменяет просевшие связки без ежедневного участия владельца.",
  },
  blog: {
    7: "Минимум две самостоятельные медиаплощадки имеют реальную целевую аудиторию и дают измеримые обращения или продажи; бизнес не зависит от одного аккаунта или платформы.",
    8: "Несколько каналов выполняют разные роли, связаны между собой и ведут в продукты и воронки; у бизнеса есть собственная база контактов и измеримый коммерческий вклад каналов.",
    9: "Производство и распространение контента делегированы, ключевые роли имеют резерв, а ритм, качество, аудитория и продажи сохраняются без ежедневной работы эксперта.",
    10: "Команда автономно управляет многоплощадочной медиасистемой, её аудиторией, производством, распространением, аналитикой и коммерческим результатом.",
  },
  team: {
    8: "Критические функции имеют владельцев измеримого результата, полномочия, описанный процесс и рабочий резерв; отсутствие отдельного сотрудника не останавливает функцию.",
    9: "Работает управленческий слой: руководители самостоятельно управляют функциями, людьми, бюджетами и показателями; есть преемственность и сценарии непрерывности.",
    10: "Бизнес автономно работает, достигает показателей, улучшает процессы и адаптируется; руководители управляют людьми, функциями и изменениями без ежедневного участия владельца.",
  },
};

function criterionFor(elementId: SevenKElementId, score: number): string {
  return LEVEL_CRITERION_OVERRIDES[elementId]?.[score]
    ?? legacy.elements[elementId].levels[score]?.criterion
    ?? "";
}

export const SCORING_RULES = {
  version: SCORING_RULES_RESOURCE_VERSION,
  methodologyVersion: "7K-2026-08-v5.2",
  source: {
    document: "Справочник_7К_v5_2_ОБЪЕДИНЕННЫЙ_УСТОЙЧИВОСТЬ_DRAFT.xlsx",
    sha256: "2D421B60862F0FA4D89B4EACA39055B5F26AF1AF8ACE6A2A13BD281FDABD3DE4",
    importPolicy: "Сохранена согласованная шкала v5; добавлены машинные поля ядра, альтернатив, supporting, blockers и устойчивости v5.2.",
  },
  algorithm: legacy.algorithm,
  evaluationPolicy: {
    mode: "cumulative_capability" as const,
    criterionRole: "mandatory_core" as const,
    alternativePathPolicy: "one_confirmed_path_is_sufficient" as const,
    supportingCoveragePolicy: "confidence_only_not_a_score_gate" as const,
    directHigherEvidence: "Прямой факт высокого уровня подтверждает нижние способности только когда они логически из него следуют.",
    blockerPolicy: "Прямое противоречие обязательному ядру или resilience-gate блокирует уровень; отсутствие упоминания является missing_evidence.",
    artifactPolicy: "Артефакт оценивается только по выполняемой бизнес-функции и наблюдаемому результату.",
    resiliencePolicy: RESILIENCE_RULES_RESOURCE_VERSION,
  },
  globalRules: [
    { ruleId: "SR3-GLOBAL-CURRENT-ONLY", rule: "Оценивай текущий бизнес по всем ответам клиента; target, планы и идеи не повышают current score." },
    { ruleId: "SR3-GLOBAL-ZERO", rule: "0 ставится только при подтверждённом отсутствии способности; недостаток данных не равен 0." },
    { ruleId: "SR3-GLOBAL-CUMULATIVE", rule: "Уровень накопительный: обязательно ядро выбранной ступени и существенные способности нижних ступеней." },
    { ruleId: "SR3-GLOBAL-MANDATORY-CORE", rule: "Обязательное ядро подтверждается полностью. Если перечислены alternativeEvidencePaths, достаточно одного подтверждённого пути. Supporting signals повышают confidence, но не заменяют ядро и не образуют процентный порог." },
    { ruleId: "SR3-GLOBAL-RESILIENCE", rule: "На уровнях с resilience-полем отдельно проверь единственные точки отказа. Работающая способность и её устойчивость — разные измерения; обязательный resilience requirement является частью верхнего уровня." },
    { ruleId: "SR3-GLOBAL-DIRECT-HIGHER-EVIDENCE", rule: "Не требуй буквального упоминания промежуточного инструмента, если более сильный current-факт логически подтверждает способность." },
    { ruleId: "SR3-GLOBAL-BLOCKER", rule: "Прямой blocker запрещает уровень. Отсутствие упоминания записывается в missing_evidence, а не в counterevidence." },
    { ruleId: "SR3-GLOBAL-ARTIFACTS-NOT-SCORES", rule: "CRM, бот, AI, сотрудники, реклама и должности без работающей функции и результата не повышают score." },
    { ruleId: "SR3-GLOBAL-CAP-2", rule: "Без конкретного current-примера evidence_cap не выше 2." },
    { ruleId: "SR3-GLOBAL-CAP-3", rule: "Только один случай или только исторический опыт: evidence_cap не выше 3." },
    { ruleId: "SR3-GLOBAL-HIGH-LEVEL", rule: "Уровни 8–10 требуют повторяемости, результата, управляемости и отсутствия указанной единственной точки отказа." },
    { ruleId: "SR3-GLOBAL-INDEPENDENT", rule: "Каждый элемент оценивается отдельно, но использует все релевантные ответы; один факт может доказывать несколько элементов." },
    { ruleId: "SR3-GLOBAL-NO-GUESSING", rule: "При неполных доказательствах выбирай нижний подтверждённый уровень и называй точное missing_evidence." },
  ],
  elements: Object.fromEntries(SEVEN_K_ELEMENT_IDS.map((elementId) => {
    const element = legacy.elements[elementId];
    return [elementId, {
      ...element,
      levels: element.levels.map((level) => ({
        ...level,
        criterion: criterionFor(elementId, level.score),
        nextLevelGate: level.score < 10 ? criterionFor(elementId, level.score + 1) : null,
        mandatoryCore: [criterionFor(elementId, level.score)],
        alternativeEvidencePaths: [],
        supportingSignals: element.evidenceDimensions,
        blockers: element.falseFriends,
        resilience: getResilienceFrame(elementId, level.score),
      })),
    }];
  })) as unknown as Record<SevenKElementId, ElementScoringRulesV3>,
} as const;

function validateScoringRules(): void {
  const ruleIds = new Set<string>();
  for (const elementId of SEVEN_K_ELEMENT_IDS) {
    const element = SCORING_RULES.elements[elementId];
    if (!element || element.elementId !== elementId || element.levels.length !== 11) {
      throw new Error(`Invalid scoring rule set for ${elementId}`);
    }
    element.levels.forEach((level, score) => {
      if (level.score !== score || level.mandatoryCore.length === 0 || ruleIds.has(level.ruleId)) {
        throw new Error(`Invalid scoring level ${elementId}:${score}`);
      }
      ruleIds.add(level.ruleId);
    });
  }
}

validateScoringRules();
