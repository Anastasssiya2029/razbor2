import { DIAGNOSTIC_FORM_FIELDS } from "@/lib/diagnostic-field-map";
import type { DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import { BUSINESS_ARCHETYPE_BY_ID } from "@/server/7k/config/archetypes.v2";
import { SEVEN_K_ELEMENTS } from "@/server/7k/config/elements.v1";
import type { AnalysisResultV1 } from "@/server/analysis-result";

const META_HEADERS = ["ID разбора", "Дата разбора"] as const;
const NORMALIZED_HEADERS = ["Факт, ₽ (число)", "Цель, ₽ (число)", "Сумма текущих баллов", "Сумма целевых баллов", "Архетип"] as const;
const REPORT_HEADERS = ["Заключение", "Целевая конфигурация — заключение", "Главная связка роста", "Где деньги сейчас", "Финальный фокус", "Первое действие"] as const;

function fieldHeader(sourceKey: string, label: string): string {
  const sections: Record<string, string> = {
    expertName: "Клиент", niche: "Ниша", currentIncome: "Сейчас · Доход", clientsCount: "Сейчас · Клиенты",
    weeklyTime: "Сейчас · Время", products: "Сейчас · Продукты", bestSeller: "Сейчас · Бестселлер",
    freeProducts: "Сейчас · Бесплатные продукты", goalIncome: "Цель · Доход", goalModel: "Цель · Модель",
    deadline: "Цель · Срок", delegate: "Цель · Делегирование", systemTime: "Цель · Время в системе",
  };
  return `Анкета · ${sections[sourceKey] ?? label}`;
}

export const ANALYSIS_EXPORT_HEADERS = [
  ...META_HEADERS,
  ...DIAGNOSTIC_FORM_FIELDS.map((field) => fieldHeader(field.sourceKey, field.label)),
  ...NORMALIZED_HEADERS,
  ...SEVEN_K_ELEMENTS.flatMap((element) => [`${element.name} · текущий балл`, `${element.name} · целевой балл`]),
  ...SEVEN_K_ELEMENTS.map((element) => `${element.name} · комментарий AI`),
  ...SEVEN_K_ELEMENTS.map((element) => `${element.name} · рекомендации`),
  ...REPORT_HEADERS,
] as const;

export type AnalysisExportSource = {
  analysisRunId: string;
  createdAt: string;
  rawPayload: unknown;
  input: DiagnosticInputV1_2;
  result: AnalysisResultV1;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rawFieldValues(payload: unknown): Record<string, unknown> {
  const root = record(payload);
  const answers = record(root.rawAnswers);
  return Object.keys(record(answers.values)).length > 0 ? record(answers.values) : answers;
}

function rawField(source: AnalysisExportSource, sourceKey: string): string | number | boolean | null {
  const root = record(source.rawPayload);
  const answers = record(root.rawAnswers);
  const values = rawFieldValues(source.rawPayload);
  const value = sourceKey === "deadline" ? answers.deadline ?? values.deadline : values[sourceKey];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
}

function sumScores(scores: Record<string, number>): number {
  return Object.values(scores).reduce((total, score) => total + score, 0);
}

function aiComment(source: AnalysisExportSource, elementId: keyof AnalysisResultV1["current"]["current7k"]): string {
  const element = source.result.current.current7k[elementId];
  return [
    element.why_not_higher,
    element.historical_asset ? `Исторический актив: ${element.historical_asset}` : null,
    element.missing_evidence.length ? `Не хватает доказательств: ${element.missing_evidence.join("; ")}` : null,
  ].filter(Boolean).join(" | ");
}

function recommendations(source: AnalysisExportSource, elementId: keyof AnalysisResultV1["current"]["scores"]): string {
  const cards = source.result.route.cards.filter((card) => card.elementId === elementId);
  return cards.flatMap((card) => card.tasks.map((task, index) => `${index + 1}. ${task.task} — готово, когда: ${task.doneWhen}`)).join(" | ");
}

export function buildAnalysisExportRow(source: AnalysisExportSource): Array<string | number | boolean | null> {
  const archetype = BUSINESS_ARCHETYPE_BY_ID[source.result.archetype.finalArchetype].name;
  return [
    source.analysisRunId,
    source.createdAt,
    ...DIAGNOSTIC_FORM_FIELDS.map((field) => rawField(source, field.sourceKey)),
    source.input.current.monthlyRevenueRub,
    source.input.target.monthlyRevenueRub,
    sumScores(source.result.current.scores),
    sumScores(source.result.target.targetScores),
    archetype,
    ...SEVEN_K_ELEMENTS.flatMap((element) => [source.result.current.scores[element.id], source.result.target.targetScores[element.id]]),
    ...SEVEN_K_ELEMENTS.map((element) => aiComment(source, element.id)),
    ...SEVEN_K_ELEMENTS.map((element) => recommendations(source, element.id)),
    source.result.report.opening.summary,
    source.result.report.targetConfiguration.summary,
    source.result.report.growthPoint.coach_explanation,
    source.result.report.moneyNow.narrative ?? source.result.report.moneyNow.locked_teaser,
    source.result.finalFocus.text,
    source.result.finalFocus.first_action,
  ];
}

if (ANALYSIS_EXPORT_HEADERS.length !== 65) throw new Error("Analysis export contract must contain exactly 65 columns.");
