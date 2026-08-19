import { BUSINESS_ARCHETYPES } from "./archetypes.v1";
import { SEVEN_K_ELEMENTS } from "./elements.v1";

export const REPORT_GLOSSARY_VERSION = "report-glossary.v1" as const;

export const REPORT_GLOSSARY = {
  version: REPORT_GLOSSARY_VERSION,
  modelName: "Бизнес-модель 7К",
  elements: Object.fromEntries(
    SEVEN_K_ELEMENTS.map((element) => [element.id, element.name]),
  ),
  archetypes: Object.fromEntries(
    BUSINESS_ARCHETYPES.map((archetype) => [archetype.id, archetype.name]),
  ),
  terminology: {
    currentConfiguration: "текущая конфигурация системы",
    targetConfiguration: "модель под цель",
    priority: "ключевой элемент",
    build: "поддерживающий элемент",
    maintain: "сохранять на текущем уровне",
    later: "вернуться после контрольного сигнала",
  },
} as const;
