import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ANALYSIS_STATUSES,
  DiagnosticContractError,
  normalizeDiagnosticSubmission,
  validateDiagnosticInput,
  type DiagnosticInputV1_2,
} from "../lib/diagnostic-input";
import { DIAGNOSTIC_FORM_FIELDS } from "../lib/diagnostic-field-map";

const flatAnswers = {
  expertName: "Екатерина",
  niche: "Психология",
  currentIncome: "50 000 ₽, доход неровный по запускам",
  clientsCount: "6",
  weeklyTime: "35 часов",
  products: "Консультации и пакет из четырёх встреч",
  bestSeller: "Разовая консультация",
  freeProducts: "Бесплатная диагностика",
  goalIncome: "300 000 ₽",
  goalModel: "Пакеты и длительное сопровождение",
  delegate: "Оставить метод и клиентов, передать администрирование",
  systemTime: "20",
  clients: "Женщины-предприниматели",
  result: "Переход к устойчивой рабочей модели",
  sources: "Рекомендации",
  clientPath: "Контент → разговор → оплата",
  sales: "Личные разговоры",
  socialAssets: "Бывшие клиенты и партнёры",
  team: "Ассистент",
  uniqueness: "Сочетание терапии и бизнес-практики",
  struggles: "Нет повторяемой системы продаж",
  bestPeriod: "После серии личных приглашений",
  failures: "Пробовала рекламу без подтверждённого оффера",
  personality: "introvert",
  growthTime: "10",
};

function normalizeFlat(overrides: Record<string, unknown> = {}) {
  return normalizeDiagnosticSubmission({
    sourceSchemaVersion: "diagnostic-flat-form.v1.2",
    rawAnswers: {
      values: { ...flatAnswers, ...overrides },
      deadline: "6 месяцев",
      clientsCountPeriod: "month",
      desiredSystemWeeklyHoursApplicable: false,
    },
  });
}

test("normalizes the flat form to the exact DiagnosticInput v1.2 shape", () => {
  const normalized = normalizeFlat();
  const { input } = normalized;

  assert.equal(input.schemaVersion, "1.2");
  assert.equal(input.current.monthlyRevenueRub, 50_000);
  assert.equal(input.current.monthlyRevenueContext, "50 000 ₽, доход неровный по запускам");
  assert.equal(input.current.payingClientsCount, 6);
  assert.equal(input.current.clientsCountPeriod, "month");
  assert.equal(input.current.weeklyHours, 35);
  assert.equal(input.target.monthlyRevenueRub, 300_000);
  assert.equal(input.target.deadlineMonths, 6);
  assert.equal(input.target.desiredSystemWeeklyHours, null);
  assert.equal(Object.hasOwn(input.target, "desiredSystemWeeklyHours"), true);
  assert.match(JSON.stringify(input), /"desiredSystemWeeklyHours":null/u);
  assert.equal(input.experience.struggles, flatAnswers.struggles);
  assert.equal(input.experience.bestPeriod, flatAnswers.bestPeriod);
  assert.equal(input.experience.failures, flatAnswers.failures);
  assert.equal("personality" in input.project, false);
  assert.equal("growthWeeklyHours" in input.target, false);
  assert.equal(
    (normalized.rawPayload as { rawAnswers: { values: Record<string, unknown> } }).rawAnswers.values.personality,
    "introvert",
  );
  assert.equal(
    (normalized.rawPayload as { rawAnswers: { values: Record<string, unknown> } }).rawAnswers.values.growthTime,
    "10",
  );
});

test("keeps desiredSystemWeeklyHours only when time freedom is explicitly applicable", () => {
  const result = normalizeDiagnosticSubmission({
    rawAnswers: {
      values: { ...flatAnswers, delegate: "Хочу выйти из операционки", systemTime: "12" },
      deadline: "1 год",
      clientsCountPeriod: "launch",
      desiredSystemWeeklyHoursApplicable: true,
    },
  });

  assert.equal(result.input.target.desiredSystemWeeklyHours, 12);
  assert.equal(result.input.target.deadlineMonths, 12);
  assert.equal(result.input.current.clientsCountPeriod, "launch");
});

test("preserves explicit zero and converts empty values to null", () => {
  const { input } = normalizeFlat({ currentIncome: "0", clientsCount: "", weeklyTime: "0" });

  assert.equal(input.current.monthlyRevenueRub, 0);
  assert.equal(input.current.payingClientsCount, null);
  assert.equal(input.current.clientsCountPeriod, null);
  assert.equal(input.current.weeklyHours, 0);
});

test("rejects an income phrase whose first number is a period rather than money", () => {
  assert.throws(
    () => normalizeFlat({ currentIncome: "Средняя выручка за последние 6 месяцев, достаточно ровная." }),
    (error: unknown) =>
      error instanceof DiagnosticContractError
      && error.issues.some((item) => item.path === "/current/monthlyRevenueRub" && item.code === "ambiguous_money"),
  );
  assert.equal(
    normalizeFlat({ currentIncome: "70 000 ₽, средняя за последние 6 месяцев" }).input.current.monthlyRevenueRub,
    70_000,
  );
});

test("validates current and desired weekly hours before an AI-ready diagnostic is created", () => {
  assert.throws(
    () => normalizeFlat({ weeklyTime: "последние 6 месяцев" }),
    (error: unknown) =>
      error instanceof DiagnosticContractError
      && error.issues.some((item) => item.path === "/current/weeklyHours" && item.code === "ambiguous_weekly_hours"),
  );
  assert.throws(
    () => normalizeFlat({ weeklyTime: "169" }),
    (error: unknown) =>
      error instanceof DiagnosticContractError
      && error.issues.some((item) => item.path === "/current/weeklyHours" && item.code === "invalid_weekly_hours"),
  );
  assert.throws(
    () => normalizeDiagnosticSubmission({
      rawAnswers: {
        values: { ...flatAnswers, systemTime: "" },
        deadline: "6 месяцев",
        clientsCountPeriod: "month",
        desiredSystemWeeklyHoursApplicable: true,
      },
    }),
    (error: unknown) =>
      error instanceof DiagnosticContractError
      && error.issues.some((item) => item.path === "/target/desiredSystemWeeklyHours" && item.code === "required_weekly_hours"),
  );
});

test("requires the clients period when a client count is present", () => {
  assert.throws(
    () =>
      normalizeDiagnosticSubmission({
        rawAnswers: {
          values: flatAnswers,
          deadline: "6 месяцев",
        },
      }),
    (error: unknown) =>
      error instanceof DiagnosticContractError &&
      error.issues.some((item) => item.path === "/current/clientsCountPeriod"),
  );
});

test("JSON Schema rejects unknown properties and structurally missing approved fields", () => {
  const input = normalizeFlat().input;
  const withUnknown = { ...input, personality: "introvert" };
  const withoutWeeklyHours = structuredClone(input) as Omit<DiagnosticInputV1_2, "current"> & {
    current: Omit<DiagnosticInputV1_2["current"], "weeklyHours">;
  };
  delete withoutWeeklyHours.current.weeklyHours;

  assert.throws(() => validateDiagnosticInput(withUnknown), DiagnosticContractError);
  assert.throws(() => validateDiagnosticInput(withoutWeeklyHours), DiagnosticContractError);
});

test("legacy nested records are adapted without mutating or rewriting raw answers", () => {
  const legacy = {
    schemaVersion: "1.1",
    identity: { expertName: "Анна", niche: "Маркетинг" },
    current: {
      monthlyRevenueRub: 100_000,
      monthlyRevenueContext: null,
      payingClientsCount: 4,
      clientsCountPeriod: "month",
      weeklyHours: 40,
      products: "Аудиты",
      bestSeller: "Стратегия",
      freeProducts: "нет",
    },
    target: {
      monthlyRevenueRub: 500_000,
      businessModel: "Агентство",
      deadlineMonths: 12,
      delegation: "Передать исполнение команде",
      growthWeeklyHours: 15,
      desiredSystemWeeklyHours: 10,
    },
    project: {
      clients: "Эксперты",
      result: "Маркетинговая система",
      sources: "Рекомендации",
      clientPath: "Знакомство → созвон",
      sales: "Созвоны",
      socialAssets: "Партнёры",
      team: "Два подрядчика",
      uniqueness: "Стратегия и внедрение",
      personality: "ambivert",
    },
    experience: {
      struggles: "Всё завязано на владельце",
      bestPeriod: "При работе с партнёром",
      failures: "Нанимала без регламентов",
    },
  };
  const snapshot = structuredClone(legacy);
  const normalized = normalizeDiagnosticSubmission(legacy);

  assert.deepEqual(legacy, snapshot);
  assert.equal(normalized.sourceSchemaVersion, "1.1");
  assert.equal(normalized.input.schemaVersion, "1.2");
  assert.equal(normalized.input.target.desiredSystemWeeklyHours, null);
  assert.equal("personality" in normalized.input.project, false);
  assert.equal("growthWeeklyHours" in normalized.input.target, false);
  assert.strictEqual(normalized.rawPayload, legacy);
});

test("declares only the approved analysis lifecycle statuses", () => {
  assert.deepEqual(ANALYSIS_STATUSES, [
    "draft",
    "queued",
    "scoring",
    "targeting",
    "strategizing",
    "money_now",
    "resolving_tasks",
    "writing_report",
    "ready",
    "analysis_failed",
  ]);
});

test("Data Dictionary mapping contains 24 manager-facing fields and no removed fields", () => {
  assert.equal(DIAGNOSTIC_FORM_FIELDS.length, 24);
  const keys = DIAGNOSTIC_FORM_FIELDS.map((field) => field.sourceKey);
  assert.equal(keys.includes("personality"), false);
  assert.equal(keys.includes("growthWeeklyHours"), false);
  assert.equal(keys.includes("growthTime"), false);
  assert.equal(
    DIAGNOSTIC_FORM_FIELDS.find((field) => field.sourceKey === "systemTime")?.conditional,
    "time_freedom_goal",
  );
});

test("status migration preserves old runs and renames failed to analysis_failed", () => {
  const migration = readFileSync(
    new URL("../drizzle/0001_demonic_thunderbolt_ross.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /WHEN "status" = 'failed' THEN 'analysis_failed'/u);
  assert.match(migration, /'draft','queued','scoring'/u);
  assert.doesNotMatch(migration, /,'failed'\)/u);
});
