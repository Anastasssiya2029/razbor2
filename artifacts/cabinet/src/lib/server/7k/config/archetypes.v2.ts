import type { SevenKElementId } from "../types";

export const ARCHETYPES_RESOURCE_VERSION = "archetypes.v2" as const;

export const BUSINESS_ARCHETYPE_IDS = [
  "altruist",
  "explorer",
  "creator",
  "hero",
  "magician",
  "ruler",
] as const;

export type BusinessArchetypeId = (typeof BUSINESS_ARCHETYPE_IDS)[number];

export type ArchetypeGateRequirement = {
  elementId: SevenKElementId;
  minimumScore: number;
};

export type BusinessArchetypeDefinition = {
  id: BusinessArchetypeId;
  name: string;
  minTotal: number;
  maxTotal: number;
  /** Все требования обязательны. */
  gate: readonly ArchetypeGateRequirement[];
  /** Если задано, достаточно выполнить одну из альтернативных групп. */
  gateAny?: readonly (readonly ArchetypeGateRequirement[])[];
};

/**
 * Сумма определяет кандидата, а gates проверяют, действительно ли бизнес
 * обладает ключевой способностью архетипа. Это не позволяет высокой сумме
 * вторичных баллов маскировать отсутствие поиска, создания или системы.
 */
export const BUSINESS_ARCHETYPES = [
  { id: "altruist", name: "Альтруист", minTotal: 0, maxTotal: 10, gate: [] },
  {
    id: "explorer",
    name: "Искатель",
    minTotal: 11,
    maxTotal: 20,
    gate: [],
    gateAny: [
      [{ elementId: "funnel", minimumScore: 2 }],
      [{ elementId: "blog", minimumScore: 3 }],
    ],
  },
  {
    id: "creator",
    name: "Творец",
    minTotal: 21,
    maxTotal: 30,
    gate: [{ elementId: "product_method", minimumScore: 3 }],
    gateAny: [
      [{ elementId: "funnel", minimumScore: 3 }],
      [{ elementId: "blog", minimumScore: 3 }],
    ],
  },
  {
    id: "hero",
    name: "Герой",
    minTotal: 31,
    maxTotal: 43,
    gate: [
      { elementId: "product_method", minimumScore: 4 },
      { elementId: "sales_technology", minimumScore: 4 },
      { elementId: "funnel", minimumScore: 3 },
    ],
  },
  {
    id: "magician",
    name: "Волшебник",
    minTotal: 44,
    maxTotal: 55,
    gate: [
      { elementId: "product_method", minimumScore: 6 },
      { elementId: "sales_technology", minimumScore: 6 },
      { elementId: "funnel", minimumScore: 6 },
      { elementId: "team", minimumScore: 8 },
    ],
  },
  {
    id: "ruler",
    name: "Правитель",
    minTotal: 56,
    maxTotal: 70,
    gate: [
      { elementId: "product_method", minimumScore: 8 },
      { elementId: "sales_technology", minimumScore: 8 },
      { elementId: "funnel", minimumScore: 8 },
      { elementId: "team", minimumScore: 8 },
    ],
  },
] as const satisfies readonly BusinessArchetypeDefinition[];

export const BUSINESS_ARCHETYPE_BY_ID = Object.fromEntries(
  BUSINESS_ARCHETYPES.map((archetype) => [archetype.id, archetype]),
) as Record<BusinessArchetypeId, (typeof BUSINESS_ARCHETYPES)[number]>;

