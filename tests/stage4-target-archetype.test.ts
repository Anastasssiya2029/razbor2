import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { unknownMoneyNowFacts } from "./helpers/p01-v1.4";
import type { DiagnosticInputV1_2 } from "../lib/diagnostic-input";
import { MONEY_NOW_SCENARIO_IDS } from "../server/7k/config/money-now.v2.2";
import { SEVEN_K_ELEMENT_IDS, type SevenKScores } from "../server/7k/types";
import { computeTargetAndArchetype } from "../server/stage4/compute";
import { Stage4Error } from "../server/stage4/errors";
import { runTargetAndArchetypeStage } from "../server/stage4/runner";
import type {
  Stage4Source,
  StoredTargetArchetypeResult,
  TargetArchetypeRepository,
} from "../server/stage4/types";
import type { P01ResultV1_4_2 } from "../server/p01/types";

function diagnosticInput(): DiagnosticInputV1_2 {
  return {
    schemaVersion: "1.2",
    identity: { expertName: "Мария", niche: "Бизнес-консультант" },
    current: {
      monthlyRevenueRub: 120_000,
      monthlyRevenueContext: null,
      payingClientsCount: 4,
      clientsCountPeriod: "month",
      weeklyHours: 30,
      products: "Пакет консультаций",
      bestSeller: "Пакет консультаций",
      freeProducts: null,
    },
    target: {
      monthlyRevenueRub: 300_000,
      businessModel: "Пакетная работа",
      deadlineMonths: 6,
      delegation: "Передать продажи менеджеру",
      desiredSystemWeeklyHours: null,
    },
    project: {
      clients: "Эксперты",
      result: "Система продаж",
      sources: "Рекомендации",
      clientPath: "Рекомендация → встреча → пакет",
      sales: "Диагностическая встреча",
      socialAssets: "Telegram",
      team: "Работаю одна",
      uniqueness: "Стратегия и бережная работа",
    },
    experience: {
      struggles: "Нет повторяемого потока",
      bestPeriod: "Личные приглашения давали продажи",
      failures: "Реклама дала заявки без оплат",
    },
  };
}

function distributeTotal(total: number): SevenKScores {
  const result = Object.fromEntries(SEVEN_K_ELEMENT_IDS.map((id) => [id, 0])) as SevenKScores;
  let remainder = total;
  for (const id of SEVEN_K_ELEMENT_IDS) {
    result[id] = Math.min(10, remainder);
    remainder -= result[id];
  }
  return result;
}

function p01Fixture(
  scores: SevenKScores = {
    authenticity: 4,
    audience: 4,
    product_method: 4,
    sales_technology: 4,
    funnel: 3,
    blog: 3,
    team: 2,
  },
): P01ResultV1_4_2 {
  const evidenceLedger = SEVEN_K_ELEMENT_IDS.map((elementId, index) => ({
    id: `E${String(index + 1).padStart(2, "0")}`,
    source_field: `project.${elementId}`,
    fact: `Текущий факт ${elementId}.`,
    evidence_type: "current_example" as const,
    time_scope: "current" as const,
    valence: "neutral" as const,
    elements: [elementId],
    derived_from: [],
  }));
  const current7k = Object.fromEntries(
    SEVEN_K_ELEMENT_IDS.map((elementId, index) => [
      elementId,
      {
        score: scores[elementId],
        confidence: "medium",
        evidence_cap: 10,
        cap_reason: "Тестовый доказательный cap.",
        matched_level_rule_id: `SR2-${elementId.toUpperCase()}-${String(scores[elementId]).padStart(2, "0")}`,
        next_level_rule_id:
          scores[elementId] < 10
            ? `SR2-${elementId.toUpperCase()}-${String(scores[elementId] + 1).padStart(2, "0")}`
            : null,
        evidence_ids: [`E${String(index + 1).padStart(2, "0")}`],
        counterevidence_ids: [],
        why_not_higher: scores[elementId] < 10 ? "Следующий уровень не доказан." : null,
        contradiction: null,
        historical_asset: null,
        missing_evidence: [],
      },
    ]),
  ) as P01ResultV1_4_2["current7k"];
  const history = Object.fromEntries(
    MONEY_NOW_SCENARIO_IDS.map((scenarioId) => [
      scenarioId,
      {
        history_status: "not_reported",
        new_material_condition: "not_applicable",
        condition_codes: [],
        summary: null,
        evidence_ids: [],
        new_condition_evidence_ids: [],
        confidence: "low",
      },
    ]),
  ) as P01ResultV1_4_2["moneyNowHistory"];
  return {
    promptVersion: "P-01.v1.4.2", schemaVersion: "1.4",
    analysisStatus: "ok",
    evidenceLedger,
    current7k,
    businessMap: {
      economics: "120 000 ₽ в месяц.",
      products: "Пакет консультаций.",
      audienceResult: "Эксперты и система продаж.",
      acquisition: "Рекомендации.",
      sales: "Диагностическая встреча.",
      assets: "Telegram.",
      operations: "Владелец работает лично.",
      uniqueness: "Стратегия и бережная работа.",
      experience: {
        strugglesSummary: "Нет повторяемого потока.",
        bestPeriodSummary: "Личные приглашения давали продажи.",
        failuresSummary: "Реклама не дала оплат.",
        attempts: [],
      },
      capacity: "30 часов в неделю.",
    },
    moneyChainFacts: [],
    moneyNowSignals: [],
    moneyNowFacts: unknownMoneyNowFacts(),
    moneyNowHistory: history,
    targetIntent: {
      rawBusinessModel: "Пакетная работа",
      normalizedModelFamily: "package_1to1",
      primaryModelFamily: "package_1to1",
      secondaryModelFamilies: [],
      activatedCapabilities: [],
      desiredRoleSummary: "Передать продажи менеджеру.",
      desiredSystemWeeklyHours: null,
      confidence: "medium",
      missing_evidence: [],
    },
    sanityChecks: [],
  };
}

function source(p01 = p01Fixture()): Stage4Source {
  return {
    analysisRunId: "run-1",
    diagnosticId: "diagnostic-1",
    runStatus: "targeting",
    normalizedInput: diagnosticInput(),
    p01AnalysisResultId: "p01-1",
    p01PromptVersion: "P-01.v1.4.2",
    p01OutputSchemaVersion: "1.4",
    p01InputHash: "p01-input-hash",
    p01Result: p01,
    p01FailureCode: null,
    p01FailureMessage: null,
  };
}

class MemoryRepository implements TargetArchetypeRepository {
  stored: StoredTargetArchetypeResult | null = null;
  updates: Array<{ status: "strategizing" | "analysis_failed"; errorCode: string | null }> = [];
  source: Stage4Source;

  constructor(source: Stage4Source) {
    this.source = source;
  }

  async loadSource() {
    return this.source;
  }

  async loadResult() {
    return this.stored;
  }

  async createResult(result: StoredTargetArchetypeResult) {
    if (this.stored) return false;
    this.stored = structuredClone(result);
    return true;
  }

  async updateRun(
    _analysisRunId: string,
    update: {
      status: "strategizing" | "analysis_failed";
      errorCode: string | null;
      errorMessage: string | null;
      methodologyMetadata: Record<string, unknown>;
    },
  ) {
    this.source.runStatus = update.status;
    this.updates.push({ status: update.status, errorCode: update.errorCode });
  }
}

test("preflight reuses stage-2 pure functions and forbids legacy ID in stage-4 pipeline", () => {
  const files = [
    "server/stage4/compute.ts",
    "server/stage4/runner.ts",
    "app/api/analysis-runs/[analysisRunId]/target-archetype/route.ts",
  ];
  const code = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.match(code, /calculateTargetConfiguration/u);
  assert.match(code, /calculateBusinessArchetype/u);
  assert.match(code, /validateSevenKScores/u);
  assert.match(code, /getSevenKResourceVersions/u);
  assert.doesNotMatch(code, /currentScore\s*=\s*Math\.max/u);
  assert.doesNotMatch(code, /products_method/u);
  assert.doesNotMatch(code, /OpenRouter|P01Provider|runP02|moneyNowSelector|resolveTransitions/u);
});

test("P-01 ok is persisted and moves targeting to strategizing without P-02", async () => {
  const repository = new MemoryRepository(source());
  const result = await runTargetAndArchetypeStage("run-1", {
    repository,
    now: () => new Date("2026-08-18T12:00:00.000Z"),
    createId: () => "stage4-1",
  });
  assert.equal(result.status, "strategizing");
  assert.equal(result.result.p01AnalysisResultId, "p01-1");
  assert.ok(result.result.target);
  assert.ok(result.result.archetype);
  assert.deepEqual(repository.updates, [{ status: "strategizing", errorCode: null }]);
});

test("P-01 low_confidence with complete scores is allowed", () => {
  const p01 = p01Fixture();
  p01.analysisStatus = "low_confidence";
  assert.doesNotThrow(() => computeTargetAndArchetype(source(p01)));
});

test("target mapping uses only P-01 current7k and targetIntent plus current capacity", () => {
  const p01 = p01Fixture({
    authenticity: 9,
    audience: 1,
    product_method: 1,
    sales_technology: 1,
    funnel: 1,
    blog: 1,
    team: 1,
  });
  p01.targetIntent.activatedCapabilities = [
    { code: "delegated_sales", reason: "Нужны продажи менеджером.", source_fields: ["target.delegation"] },
    { code: "delegate_individual_sales", reason: "Передать продажи.", source_fields: ["target.delegation"] },
  ];
  const computed = computeTargetAndArchetype(source(p01));
  assert.equal(computed.currentScores.authenticity, 9);
  assert.equal(computed.target.targetScores.authenticity, 9, "mature current score cannot decrease");
  assert.equal(computed.target.requiredMinimum.sales_technology, 9);
  assert.equal(computed.target.requiredMinimum.team, 5);
  assert.deepEqual(computed.target.capabilities, ["delegated_sales"]);
  assert.deepEqual(computed.target.appliedModifiers, ["delegate_individual_sales"]);
  assert.equal(computed.target.desiredOwnerRole, "delegate_sales");
});

test("hybrid model combines primary and secondary models with multiple target codes", () => {
  const p01 = p01Fixture(distributeTotal(7));
  p01.targetIntent.normalizedModelFamily = "hybrid";
  p01.targetIntent.primaryModelFamily = "autoproduct";
  p01.targetIntent.secondaryModelFamilies = ["agency"];
  p01.targetIntent.activatedCapabilities = [
    { code: "team_managed_acquisition", reason: "Нужна команда.", source_fields: ["target.businessModel"] },
    { code: "media_system", reason: "Нужно медиа.", source_fields: ["target.businessModel"] },
    { code: "team_finds_qualifies_audience", reason: "Команда ищет ЦА.", source_fields: ["target.delegation"] },
  ];
  const target = computeTargetAndArchetype(source(p01)).target;
  assert.deepEqual(target.modelComponents, ["autoproduct", "agency"]);
  assert.equal(target.requiredMinimum.audience, 10);
  assert.equal(target.requiredMinimum.funnel, 10);
  assert.equal(target.requiredMinimum.blog, 10);
  assert.equal(target.requiredMinimum.team, 8);
});

test("desiredSystemWeeklyHours null is neutral; numeric goal triggers existing model-fit rule", () => {
  const withoutGoal = computeTargetAndArchetype(source()).target;
  assert.equal(withoutGoal.modelFitWarnings.length, 0);
  const p01 = p01Fixture();
  p01.targetIntent.desiredSystemWeeklyHours = 10;
  const withGoal = computeTargetAndArchetype(source(p01)).target;
  assert.ok(withGoal.modelFitWarnings.some((warning) => warning.code === "PERSONAL_MODEL_TIME_FREEDOM_CONFLICT"));
});

test("distant role wording alone does not activate autonomy or inflate the next-level target", () => {
  const p01 = p01Fixture({
    authenticity: 4,
    audience: 4,
    product_method: 3,
    sales_technology: 4,
    funnel: 3,
    blog: 1,
    team: 1,
  });
  p01.targetIntent.desiredRoleSummary =
    "В дальнем будущем владелец хочет полностью автономный бизнес.";
  p01.targetIntent.activatedCapabilities = [];

  const target = computeTargetAndArchetype(source(p01)).target;
  assert.equal(target.targetScores.team, 1);
  assert.equal(target.desiredOwnerRole, null);
  assert.deepEqual(target.appliedModifiers, []);
});

test("unknown target code is rejected, never ignored", () => {
  const p01 = p01Fixture();
  p01.targetIntent.activatedCapabilities = [
    { code: "unknown_code", reason: "Неизвестно.", source_fields: ["target.businessModel"] },
  ];
  assert.throws(
    () => computeTargetAndArchetype(source(p01)),
    (error: unknown) => error instanceof Stage4Error && error.code === "STAGE4_P01_INVALID",
  );
});

test("unknown model family and a single missing current score block the stage", () => {
  const unknownModel = p01Fixture() as unknown as {
    targetIntent: { normalizedModelFamily: string };
  };
  unknownModel.targetIntent.normalizedModelFamily = "unknown_model";
  const unknownSource = source();
  unknownSource.p01Result = unknownModel as unknown as P01ResultV1_4_2;
  assert.throws(
    () => computeTargetAndArchetype(unknownSource),
    (error: unknown) => error instanceof Stage4Error && error.code === "STAGE4_P01_INVALID",
  );

  const incomplete = p01Fixture();
  incomplete.analysisStatus = "blocked_by_insufficient_data";
  incomplete.current7k.team.score = null;
  assert.throws(
    () => computeTargetAndArchetype(source(incomplete)),
    (error: unknown) => error instanceof Stage4Error && error.code === "STAGE4_P01_BLOCKED",
  );
});

test("stage-4 archetype candidates cover every range boundary from P-01 current scores", () => {
  const cases = [
    [0, "altruist"], [10, "altruist"], [11, "explorer"], [20, "explorer"],
    [21, "creator"], [30, "creator"], [31, "hero"], [43, "hero"],
    [44, "magician"], [55, "magician"], [56, "ruler"], [70, "ruler"],
  ] as const;
  for (const [total, expected] of cases) {
    const archetype = computeTargetAndArchetype(source(p01Fixture(distributeTotal(total)))).archetype;
    assert.equal(archetype.totalScore, total);
    assert.equal(archetype.candidateArchetype, expected);
  }
});

test("Hero, Magician and Ruler downgrade through existing gates", () => {
  const cases: Array<[SevenKScores, string, string]> = [
    [{ authenticity: 10, audience: 10, product_method: 3, sales_technology: 4, funnel: 3, blog: 5, team: 0 }, "hero", "creator"],
    [{ authenticity: 8, audience: 8, product_method: 5, sales_technology: 6, funnel: 6, blog: 8, team: 4 }, "magician", "hero"],
    [{ authenticity: 10, audience: 10, product_method: 7, sales_technology: 8, funnel: 8, blog: 10, team: 7 }, "ruler", "magician"],
  ];
  for (const [scores, candidate, final] of cases) {
    const result = computeTargetAndArchetype(source(p01Fixture(scores))).archetype;
    assert.equal(result.candidateArchetype, candidate);
    assert.equal(result.finalArchetype, final);
    assert.ok(result.downgradeReason);
  }
});

test("a distant product model is kept as vision while the scored target stays on the nearest sellable step", () => {
  const current = distributeTotal(11);
  const p01 = p01Fixture(current);
  p01.targetIntent.normalizedModelFamily = "school_licensing";
  p01.targetIntent.primaryModelFamily = "school_licensing";
  const result = computeTargetAndArchetype(source(p01));
  assert.equal(result.archetype.totalScore, 11);
  assert.equal(result.archetype.finalArchetype, "explorer");
  assert.equal(result.target.modelFamily, "package_1to1");
  assert.equal(result.target.visionModelFamily, "school_licensing");
  assert.deepEqual(result.target.visionModelComponents, ["school_licensing"]);
  assert.equal(result.target.targetScores.product_method, 3);
  assert.ok(result.target.modelTransitionNote);
});

test("a mature product system keeps the selected autonomous product model as the scored target", () => {
  const p01 = p01Fixture({
    authenticity: 5,
    audience: 6,
    product_method: 6,
    sales_technology: 5,
    funnel: 5,
    blog: 4,
    team: 3,
  });
  p01.targetIntent.normalizedModelFamily = "autoproduct";
  p01.targetIntent.primaryModelFamily = "autoproduct";
  const target = computeTargetAndArchetype(source(p01)).target;
  assert.equal(target.modelFamily, "autoproduct");
  assert.equal(target.visionModelFamily, "autoproduct");
  assert.equal(target.targetScores.product_method, 8);
  assert.equal(target.modelTransitionNote, null);
});

test("blocked or incomplete P-01 never runs Target/Archetype calculators", async () => {
  const blocked = p01Fixture();
  blocked.analysisStatus = "blocked_by_insufficient_data";
  for (const elementId of SEVEN_K_ELEMENT_IDS) blocked.current7k[elementId].score = null;
  const repository = new MemoryRepository(source(blocked));
  repository.source.runStatus = "analysis_failed";
  let calls = 0;
  const result = await runTargetAndArchetypeStage("run-1", {
    repository,
    compute: (value) => {
      calls += 1;
      return computeTargetAndArchetype(value);
    },
  });
  assert.equal(calls, 1, "runner enters the stage once; deterministic calculators are gated inside compute");
  assert.equal(result.status, "analysis_failed");
  assert.equal(result.result.failureCode, "STAGE4_P01_BLOCKED");
  assert.equal(result.result.target, null);
  assert.equal(result.result.archetype, null);
});

test("legacy products_method cannot substitute canonical current score", () => {
  const malformed = p01Fixture() as unknown as Record<string, unknown>;
  const current7k = malformed.current7k as Record<string, unknown>;
  current7k.products_method = current7k.product_method;
  delete current7k.product_method;
  const invalidSource = source();
  invalidSource.p01Result = malformed as unknown as P01ResultV1_4_2;
  assert.throws(
    () => computeTargetAndArchetype(invalidSource),
    (error: unknown) => error instanceof Stage4Error && error.code === "STAGE4_P01_INVALID",
  );
});

test("same versioned input is idempotent; changed P-01 snapshot conflicts explicitly", async () => {
  const repository = new MemoryRepository(source());
  const first = await runTargetAndArchetypeStage("run-1", {
    repository,
    createId: () => "stage4-stable-id",
  });
  const second = await runTargetAndArchetypeStage("run-1", { repository });
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.result.id, first.result.id);
  repository.source.p01InputHash = "changed-p01-input";
  await assert.rejects(
    () => runTargetAndArchetypeStage("run-1", { repository }),
    (error: unknown) => error instanceof Stage4Error && error.code === "STAGE4_VERSION_CONFLICT",
  );
});

test("technical failure is persisted and moves targeting to analysis_failed", async () => {
  const repository = new MemoryRepository(source());
  const result = await runTargetAndArchetypeStage("run-1", {
    repository,
    compute: () => {
      throw new Error("synthetic technical failure");
    },
  });
  assert.equal(result.status, "analysis_failed");
  assert.equal(result.result.failureCode, "STAGE4_TECHNICAL_ERROR");
  assert.deepEqual(repository.updates, [
    { status: "analysis_failed", errorCode: "STAGE4_TECHNICAL_ERROR" },
  ]);
});

test("stage-4 storage is additive, versioned and uniquely keyed by analysis run", () => {
  const migration = readFileSync("drizzle/0003_left_pet_avengers.sql", "utf8");
  const registry = readFileSync("server/7k/methodology-registry.ts", "utf8");
  const route = readFileSync(
    "app/api/analysis-runs/[analysisRunId]/target-archetype/route.ts",
    "utf8",
  );
  assert.match(migration, /CREATE TABLE `target_archetype_results`/u);
  assert.match(migration, /UNIQUE INDEX `target_archetype_results_run_unique`/u);
  assert.match(migration, /p01_analysis_result_id/u);
  assert.match(registry, /target-archetype-stage\.v1/u);
  assert.doesNotMatch(route, /calculateTargetConfiguration|calculateBusinessArchetype/u);
  assert.doesNotMatch(route, /moneyNow|transitionResolver|runP02|executeP02/u);
});
