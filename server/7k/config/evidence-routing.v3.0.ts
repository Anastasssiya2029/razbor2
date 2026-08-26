import type { SevenKElementId } from "../types";

export const EVIDENCE_ROUTING_RESOURCE_VERSION = "evidence-routing.v3.0" as const;

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
    restrictions: ["Поля target не повышают current score."],
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
      "current.products",
      "project.team",
      "experience.bestPeriod",
      "experience.failures",
    ],
    crossCheckSources: [],
    restrictions: ["Поля target не повышают current score."],
  },
  team: {
    currentSources: ["project.team", "current.weeklyHours"],
    crossCheckSources: [],
    restrictions: [
      "Желаемое делегирование и будущая нагрузка относятся только к target.",
      "Текущая команда включает людей и фактическое использование AI.",
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
