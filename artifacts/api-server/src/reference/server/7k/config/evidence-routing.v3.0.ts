import type { SevenKElementId } from "../types";

export const EVIDENCE_ROUTING_RESOURCE_VERSION = "evidence-routing.v3.1" as const;

export type EvidenceRoutingRule = {
  readonly currentSources: readonly string[];
  readonly crossCheckSources: readonly string[];
  readonly restrictions: readonly string[];
};

export const EVIDENCE_ROUTING = {
  authenticity: {
    currentSources: [
      "project.uniqueness",
      "project.clients",
      "project.result",
      "current.products",
      "current.bestSeller",
      "project.sales",
      "project.socialAssets",
      "project.team",
      "experience.bestPeriod",
    ],
    crossCheckSources: ["experience.struggles"],
    restrictions: [
      "experience.struggles разрешён только как отрицательный cross-check о самоценности, праве на цену, уверенности или страхе проявляться.",
      "Техническое сомнение в канале или рекламе не относится к authenticity.",
      "Для уровня 7 объединяй повторяющиеся отзывы из project.uniqueness и project.result с причинами выбора из project.clients, current.bestSeller, project.sales и project.socialAssets. Совпадающие сигналы из разных полей являются одним связанным доказательством рынка, а не разрозненными упоминаниями.",
      "Единичный комплимент, самоописание или одноразовая похвала без подтверждённой причины выбора не доказывают уровень 7.",
    ],
  },
  audience: {
    currentSources: [
      "project.clients",
      "project.result",
      "project.sources",
      "project.socialAssets",
      "project.clientPath",
      "project.sales",
      "project.team",
      "experience.failures",
    ],
    crossCheckSources: [],
    restrictions: ["Поля target не повышают current score."],
  },
  product_method: {
    currentSources: [
      "project.uniqueness",
      "current.products",
      "current.bestSeller",
      "current.freeProducts",
      "project.result",
      "project.clientPath",
      "project.sales",
      "project.team",
      "experience.bestPeriod",
    ],
    crossCheckSources: [],
    restrictions: [
      "Поля target не повышают current score.",
      "Для уровня 5 объединяй разрозненные упоминания флагманского продукта: цену и формат из current.products/current.bestSeller, документированный до/после результат клиента из project.result и продающий сценарий из project.clientPath/project.sales. Совпадающие факты из разных полей об одном флагмане формируют один связанный путь А→Б, этапы и результат, а не отдельные упоминания.",
      "Для уровня 7 связная линейка и авторский метод могут подтверждаться совместно current.products (даунсел/апсел между тарифами одного флагмана) и project.uniqueness (описанный автором способ), даже если каждый факт по отдельности лежит в своём поле.",
    ],
  },
  sales_technology: {
    currentSources: [
      "project.sales",
      "project.clientPath",
      "current.products",
      "project.result",
      "project.sources",
      "project.team",
      "experience.bestPeriod",
      "experience.failures",
    ],
    crossCheckSources: [],
    restrictions: ["Поля target не повышают current score."],
  },
  funnel: {
    currentSources: [
      "project.sources",
      "project.clientPath",
      "current.freeProducts",
      "project.sales",
      "project.socialAssets",
      "project.team",
      "experience.bestPeriod",
      "experience.failures",
    ],
    crossCheckSources: [],
    restrictions: ["Поля target не повышают current score."],
  },
  blog: {
    currentSources: [
      "project.socialAssets",
      "project.sources",
      "project.clientPath",
      "project.sales",
      "current.products",
      "project.team",
      "experience.bestPeriod",
      "experience.failures",
    ],
    crossCheckSources: [],
    restrictions: ["Поля target не повышают current score."],
  },
  team: {
    currentSources: [
      "project.team",
      "project.sales",
      "project.clientPath",
      "project.socialAssets",
      "current.products",
      "current.weeklyHours",
    ],
    crossCheckSources: [],
    restrictions: [
      "Желаемое делегирование и будущая нагрузка относятся только к target.",
      "Текущая команда включает людей и фактическое использование AI.",
      "AI учитывается только как поддерживающий факт, если он регулярно выполняет функцию и заметно снимает нагрузку; само наличие AI не повышает уровень команды.",
    ],
  },
} as const satisfies Record<SevenKElementId, EvidenceRoutingRule>;

export const EVIDENCE_ROUTING_GLOBAL_CONTEXT = {
  contextOnly: ["identity.niche"],
  consistencyChecks: [
    "current.monthlyRevenueRub",
    "current.monthlyRevenueContext",
    "current.payingClientsCount",
    "current.clientsCountPeriod",
  ],
  historicalAssets: ["experience.bestPeriod", "experience.failures"],
  targetOnlyPrefix: "target.",
} as const;
