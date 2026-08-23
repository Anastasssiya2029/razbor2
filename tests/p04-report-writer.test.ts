import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { P04_PROMPT_SHA256, P04_PROMPT_VERSION, P04_SYSTEM_PROMPT } from "../server/7k/prompts/p04.v1.2";
import { P04Error } from "../server/p04/errors";
import { prepareP04Input, P04_RULE_VERSIONS } from "../server/p04/projections";
import { authorizeP04PublicRequest, P04_ORCHESTRATOR_HEADER } from "../server/p04/public-guard";
import { runP04ReportWriter, P04RunExecutionError } from "../server/p04/runner";
import { runP04Stage } from "../server/p04/stage-runner";
import type {
  P04PreparedInput,
  P04Repository,
  P04Source,
  StoredP04Result,
} from "../server/p04/stage-types";
import type {
  P04Provider,
  P04ProviderRequest,
  P04ProviderResponse,
  P04ResultV1_2,
} from "../server/p04/types";
import {
  finalizeAndValidateP04Output,
  P04InvariantError,
} from "../server/p04/validation";
import {
  makeP04Source,
  makeValidP04Output,
  type P04FixtureMoneyStatus,
} from "./helpers/p04-fixture";

class QueueProvider implements P04Provider {
  readonly provider = "fixture";
  readonly model = "fixture-p04";
  readonly requests: P04ProviderRequest[] = [];
  constructor(private readonly queue: Array<unknown | Error>) {}
  async complete(request: P04ProviderRequest): Promise<P04ProviderResponse> {
    this.requests.push(request);
    const value = this.queue.shift();
    if (value instanceof Error) throw value;
    return {
      text: typeof value === "string" ? value : JSON.stringify(value),
      rawResponse: { attempt: this.requests.length, private: "server-only" },
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, costUsd: 0.001 },
    };
  }
}

class MemoryRepository implements P04Repository {
  stored: StoredP04Result | null = null;
  updates: Array<{ status: "ready" | "analysis_failed"; errorCode: string | null }> = [];
  constructor(readonly source: P04Source) {}
  async loadSource() { return this.source; }
  async loadResult() { return this.stored; }
  async createResult(value: StoredP04Result) {
    if (this.stored) return false;
    this.stored = structuredClone(value);
    return true;
  }
  async updateRun(
    _analysisRunId: string,
    update: {
      status: "ready" | "analysis_failed";
      errorCode: string | null;
      errorMessage: string | null;
      promptVersion: "P-04.v1.2";
      metadata: Record<string, unknown>;
    },
  ) {
    this.source.runStatus = update.status;
    this.updates.push({ status: update.status, errorCode: update.errorCode });
  }
}

async function prepared(status: P04FixtureMoneyStatus = "available"): Promise<P04PreparedInput> {
  return prepareP04Input(await makeP04Source(status));
}

async function valid(status: P04FixtureMoneyStatus = "available"): Promise<{
  input: P04PreparedInput;
  output: P04ResultV1_2;
}> {
  const input = await prepared(status);
  return { input, output: makeValidP04Output(input) };
}

async function expectInvariant(
  mutate: (output: P04ResultV1_2, input: P04PreparedInput) => void,
  status: P04FixtureMoneyStatus = "available",
): Promise<void> {
  const { input, output } = await valid(status);
  mutate(output, input);
  assert.throws(() => finalizeAndValidateP04Output(output, input), P04InvariantError);
}

test("1. preflight accepts only the writing_report lifecycle entry point", async () => {
  const source = await makeP04Source();
  source.runStatus = "money_now";
  await assert.rejects(
    () => runP04Stage("run-1", { repository: new MemoryRepository(source) }),
    (error: unknown) => error instanceof P04Error && error.code === "P04_NOT_READY",
  );
});

test("2. preflight requires exact persisted upstream versions", async () => {
  const source = await makeP04Source();
  source.p03!.promptVersion = "P-03.v1.4" as "P-03.v1.5";
  await assert.rejects(
    () => prepareP04Input(source),
    (error: unknown) => error instanceof P04Error && error.code === "P04_P03_VERSION_UNSUPPORTED",
  );
});

test("3. P04_CONTEXT excludes raw diagnostic input", async () => {
  const input = await prepared();
  assert.doesNotMatch(JSON.stringify(input.context), /rawAnswers|rawPayload|normalizedInput/u);
});

test("4. P04_CONTEXT excludes all provider raw responses", async () => {
  const input = await prepared();
  assert.doesNotMatch(JSON.stringify(input.context), /providerRawResponse|providerRawResponseJson/u);
});

test("5. P04_CONTEXT excludes P-02 candidate audit and Money Now alternative ranking", async () => {
  const input = await prepared();
  assert.doesNotMatch(JSON.stringify(input.context), /candidateAudit|candidateTrace|rankingTrace|selectorInput/u);
});

test("6. REPORT_POLICY is derived on backend with exact immutable identities", async () => {
  const input = await prepared();
  assert.equal(input.reportPolicy.version, "p04-report-policy.v1");
  assert.deepEqual(input.reportPolicy.routeCardIdentities[0].task_ids, [
    "audience_2_3", "audience_3_4", "audience_4_5",
  ]);
  assert.equal(input.reportPolicy.firstTask.task, "Собрать первый аватар типичного клиента.");
});

test("7. low-confidence upstream cannot be upgraded by P-04", async () => {
  await expectInvariant((output) => { output.analysisStatus = "ok"; }, "blocked_insufficient_evidence");
});

test("8. target shifts must exactly echo deterministic Target Configuration", async () => {
  await expectInvariant((output) => { output.targetConfiguration.key_shifts[0].to_score += 1; });
});

test("9. P-04 cannot add a target shift", async () => {
  await expectInvariant((output) => {
    output.targetConfiguration.key_shifts.push({
      element_id: "team",
      from_score: 2,
      to_score: 3,
      shift: "Команда получает дополнительный уровень, которого нет в deterministic target.",
      source_refs: ["TARGET:team"],
    });
  });
});

test("10. deterministic business archetype cannot be renamed", async () => {
  await expectInvariant((output) => { output.archetype.archetype_name = "Волшебник"; });
});

test("11. P-02 priority and build bundle cannot be changed", async () => {
  await expectInvariant((output) => { output.growthPoint.priority_element = "sales_technology"; });
});

test("12. whyNotNow preserves element, status and return trigger", async () => {
  await expectInvariant((output) => { output.whyNotNow[0].status = "later"; });
});

test("13. whyNotNow cannot lose or add an element", async () => {
  await expectInvariant((output) => { output.whyNotNow.pop(); });
});

test("14. route cards preserve exact count, order and milestone identity", async () => {
  await expectInvariant((output) => { output.routeCards[0].from_score = 1; });
});

test("15. route task IDs are exact and remain in resolver order", async () => {
  await expectInvariant((output) => { output.routeCards[0].task_ids.reverse(); });
});

test("16. businessValidation fields are immutable except explanation", async () => {
  await expectInvariant((output) => { output.businessValidation.timeframe_days = 30; });
});

test("17. finalFocus.first_task_id must be the first resolver task ID", async () => {
  await expectInvariant((output) => { output.finalFocus.first_task_id = "audience_3_4"; });
});

test("18. finalFocus.first_action must be the first fixed task verbatim", async () => {
  await expectInvariant((output) => { output.finalFocus.first_action = "Собрать другой аватар клиента."; });
});

test("19. finalFocus.wait_for_signal must exactly echo the validation rule", async () => {
  await expectInvariant((output) => { output.finalFocus.wait_for_signal = "Ждать роста выручки."; });
});

test("20. source_refs reject every ID absent from backend SOURCE_REGISTRY", async () => {
  await expectInvariant((output) => { output.opening.source_refs.push("P01:E999"); });
});

test("21. every major report block requires at least one canonical source_ref", async () => {
  const { input, output } = await valid();
  output.opening.source_refs = [];
  assert.throws(() => finalizeAndValidateP04Output(output, input), P04InvariantError);
});

test("22. available Money Now echoes selected scenario and locked teaser", async () => {
  const { input, output } = await valid("available");
  const result = finalizeAndValidateP04Output(output, input);
  assert.equal(result.moneyNow.status, "available");
  assert.equal(result.moneyNow.scenario_id, "MN14");
  assert.equal(result.moneyNow.locked_teaser, input.context.moneyNow.lockedTeaser);
});

test("23. P-04 output does not contain a P-03 diagnosis, interventions, test30d or metric copy", async () => {
  const { input, output } = await valid();
  const result = finalizeAndValidateP04Output(output, input) as unknown as Record<string, unknown>;
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /businessPrescription|interventionHistoryReview|test30d|targetMetric|primary_cause_code/u);
});

test("24. no_eligible_scenario returns no fallback scenario or recommendation", async () => {
  const { input, output } = await valid("no_eligible_scenario");
  assert.equal(finalizeAndValidateP04Output(output, input).moneyNow.scenario_id, null);
  output.moneyNow.narrative = "Вместо этого можно запустить новый продукт.";
  assert.throws(() => finalizeAndValidateP04Output(output, input), P04InvariantError);
});

test("25. blocked_insufficient_evidence cannot disclose an unproven cause", async () => {
  const { input, output } = await valid("blocked_insufficient_evidence");
  assert.equal(finalizeAndValidateP04Output(output, input).moneyNow.status, "blocked_insufficient_evidence");
  output.moneyNow.narrative = "Точная причина заключается в слабой квалификации.";
  assert.throws(() => finalizeAndValidateP04Output(output, input), P04InvariantError);
});

test("26. blocked_inconsistency cannot be rewritten as available", async () => {
  await expectInvariant((output) => { output.moneyNow.status = "available"; }, "blocked_inconsistency");
});

test("27. long dash in authored narrative triggers semantic retry", async () => {
  await expectInvariant((output) => { output.opening.summary += " Это новый вывод — без основания."; });
});

test("28. bureaucratic and AI-styled wording is rejected", async () => {
  await expectInvariant((output) => { output.opening.summary = "Анализ показывает, что текущая система требует более подробного последовательного разбора всех элементов."; });
});

test("29. invented client gender is rejected", async () => {
  await expectInvariant((output) => { output.opening.summary = "Она начала работу с системой, но подтверждённых фактов для изменения маршрута пока недостаточно."; });
});

test("30. income guarantees are rejected", async () => {
  await expectInvariant((output) => { output.opening.summary = "Этот маршрут точно принесёт доход и позволит получить нужную сумму после выполнения первого этапа."; });
});

test("31. P-04 cannot invent a new imperative action outside fixed tasks", async () => {
  await expectInvariant((output) => { output.finalFocus.text = "Запустите рекламу сразу после первой задачи, чтобы дополнительно ускорить движение к цели."; });
});

test("32. runner performs no more than one technical retry", async () => {
  const input = await prepared();
  const provider = new QueueProvider([new Error("transport"), makeValidP04Output(input)]);
  const result = await runP04ReportWriter(input, { provider });
  assert.equal(result.metadata.technicalRetryCount, 1);
  assert.equal(provider.requests.length, 2);
});

test("33. runner performs one semantic retry with invariant feedback", async () => {
  const input = await prepared();
  const invalid = makeValidP04Output(input);
  invalid.opening.summary += " Новый тезис — без основания.";
  const provider = new QueueProvider([invalid, makeValidP04Output(input)]);
  const result = await runP04ReportWriter(input, { provider });
  assert.equal(result.metadata.reevaluationRetryCount, 1);
  assert.match(provider.requests[1].correction ?? "", /long_dash_forbidden/u);
});

test("runner normalizes presentation-only drift after the bounded semantic retry", async () => {
  const input = await prepared();
  const drifted = makeValidP04Output(input);
  drifted.businessValidation.explanation = "Когда клиентка готова — сигнал проверен.";
  drifted.targetConfiguration.key_shifts[0].shift = "Переход — без смены маршрута.";
  drifted.whyNotNow[0].text = "Вернитесь к этому, когда будете готова.";
  drifted.finalFocus.headline = "Запустите придуманную задачу";
  const provider = new QueueProvider([drifted, drifted]);

  const result = await runP04ReportWriter(input, { provider });

  assert.equal(provider.requests.length, 2);
  assert.equal(result.result.finalFocus.headline, "Первый шаг");
  assert.doesNotMatch(JSON.stringify(result.result), /[—–]/u);
  assert.doesNotMatch(JSON.stringify(result.result), /готова/u);
  assert.match(result.result.whyNotNow[0].text, /ближайшего маршрута/u);
  assert.match(result.result.businessValidation.explanation, /Контрольная точка/u);
  assert.equal(result.result.finalFocus.first_task_id, input.reportPolicy.firstTask.taskId);
  assert.equal(result.result.finalFocus.first_action, input.reportPolicy.firstTask.task);
});

test("runner replaces model-controlled immutable echoes with backend policy values", async () => {
  const input = await prepared();
  const output = makeValidP04Output(input);
  output.analysisStatus = "blocked_by_inconsistency";
  output.archetype.archetype_name = "Волшебник";
  output.growthPoint.priority_element = "sales_technology";
  output.businessValidation.timeframe_days = 30;
  output.finalFocus.first_task_id = "made-up-task";
  output.finalFocus.first_action = "Придуманное действие";
  output.finalFocus.wait_for_signal = "Придуманный сигнал";
  output.moneyNow.scenario_id = "MN01";
  output.moneyNow.locked_teaser = "Придуманный длинный тизер для проверки";
  output.opening.source_refs.push("P01:E999");
  const provider = new QueueProvider([output]);

  const result = await runP04ReportWriter(input, { provider });

  assert.equal(provider.requests.length, 1);
  assert.equal(result.result.analysisStatus, input.reportPolicy.analysisStatus);
  assert.equal(result.result.archetype.archetype_name, "Искатель");
  assert.equal(result.result.growthPoint.priority_element, input.context.strategy.bundle.priority_element);
  assert.equal(result.result.businessValidation.timeframe_days, input.context.strategy.businessValidation.timeframe_days);
  assert.equal(result.result.finalFocus.first_task_id, input.reportPolicy.firstTask.taskId);
  assert.equal(result.result.finalFocus.first_action, input.reportPolicy.firstTask.task);
  assert.equal(result.result.finalFocus.wait_for_signal, input.reportPolicy.validationSignal);
  assert.equal(result.result.moneyNow.scenario_id, input.context.moneyNow.selectedScenario?.scenario_id ?? null);
  assert.equal(result.result.moneyNow.locked_teaser, input.context.moneyNow.lockedTeaser);
  assert.doesNotMatch(JSON.stringify(result.result), /P01:E999/u);
});

test("34. a second semantic failure terminates without an unbounded retry", async () => {
  const input = await prepared();
  const invalid = makeValidP04Output(input);
  invalid.opening.summary += " Рекомендуется новый тезис без основания.";
  const provider = new QueueProvider([invalid, invalid]);
  await assert.rejects(
    () => runP04ReportWriter(input, { provider }),
    (error: unknown) => error instanceof P04RunExecutionError && error.failureCode === "P04_INVARIANT_FAILED",
  );
  assert.equal(provider.requests.length, 2);
});

test("35. stage storage is immutable and repeated execution is idempotent", async () => {
  const source = await makeP04Source();
  const input = await prepareP04Input(source);
  const provider = new QueueProvider([makeValidP04Output(input)]);
  const repository = new MemoryRepository(source);
  const first = await runP04Stage("run-1", { repository, provider, createId: () => "p04-1" });
  const second = await runP04Stage("run-1", { repository, provider, createId: () => "p04-2" });
  assert.equal(first.idempotentReplay, false);
  assert.equal(second.idempotentReplay, true);
  assert.equal(provider.requests.length, 1);
  assert.equal(repository.stored?.id, "p04-1");
});

test("36. an existing report with another deterministic hash is a version conflict", async () => {
  const source = await makeP04Source();
  const input = await prepareP04Input(source);
  const repository = new MemoryRepository(source);
  await runP04Stage("run-1", {
    repository,
    provider: new QueueProvider([makeValidP04Output(input)]),
    createId: () => "p04-1",
  });
  repository.stored!.deterministicInputHash = "changed";
  await assert.rejects(
    () => runP04Stage("run-1", { repository }),
    (error: unknown) => error instanceof P04Error && error.code === "P04_VERSION_CONFLICT",
  );
});

test("37. full P-04 report remains server-side and public execution is fail-closed", async () => {
  const source = await makeP04Source();
  const input = await prepareP04Input(source);
  const repository = new MemoryRepository(source);
  const stage = await runP04Stage("run-1", {
    repository,
    provider: new QueueProvider([makeValidP04Output(input)]),
    createId: () => "p04-1",
  });
  assert.equal(stage.reportStoredServerSide, true);
  assert.ok(repository.stored?.result);
  assert.ok(!("result" in stage));
  const disabled = authorizeP04PublicRequest(new Request("https://example.test"), {});
  assert.deepEqual(disabled, {
    allowed: false,
    status: 503,
    code: "P04_PUBLIC_EXECUTION_DISABLED",
    message: "P-04 execution is not available through the public endpoint.",
  });
  const request = new Request("https://example.test", { headers: { [P04_ORCHESTRATOR_HEADER]: "secret" } });
  assert.deepEqual(authorizeP04PublicRequest(request, {
    P04_PUBLIC_EXECUTION_ENABLED: "true",
    P04_ORCHESTRATOR_TOKEN: "secret",
  }), { allowed: true });
});

test("38. prompt/schema/resource versions and exact prompt SHA are pinned", () => {
  assert.equal(P04_PROMPT_VERSION, "P-04.v1.2");
  assert.equal(P04_PROMPT_SHA256, "55e3956bd053c5daa525dc48ca0e6ec62a23972497a2ba725d4b8898a707a9b4");
  assert.equal(createHash("sha256").update(P04_SYSTEM_PROMPT).digest("hex"), P04_PROMPT_SHA256);
  assert.equal(P04_RULE_VERSIONS.p03Prompt, "P-03.v1.5");
  assert.equal(P04_RULE_VERSIONS.moneyNowSelectorContract, "money-now-selector-contract.v1.2");
});

test("39. all four Money Now statuses validate without changing their backend state", async () => {
  for (const status of [
    "available",
    "no_eligible_scenario",
    "blocked_insufficient_evidence",
    "blocked_inconsistency",
  ] as const) {
    const { input, output } = await valid(status);
    assert.equal(finalizeAndValidateP04Output(output, input).moneyNow.status, status);
  }
});

test("40. fixed task and done_when text remain byte-equal to the resolved plan context", async () => {
  const source = await makeP04Source();
  const input = await prepareP04Input(source);
  const sourceTasks = source.resolvedPlan!.plan!.cards.flatMap((card) => card.tasks);
  const contextTasks = input.context.resolvedPlan.cards.flatMap((card) => card.tasks);
  assert.deepEqual(contextTasks, sourceTasks);
  assert.equal(contextTasks[0].task, "Собрать первый аватар типичного клиента.");
  assert.ok(contextTasks[0].doneWhen.length > 0);
});

test("41. production route returns only stage metadata and never the full report", () => {
  const route = readFileSync("app/api/analysis-runs/[analysisRunId]/p04/route.ts", "utf8");
  assert.match(route, /idempotentReplay/u);
  assert.doesNotMatch(route, /stageResult\.result|stored\.result|fullReport/u);
});

test("42. P-04 imports deterministic upstream snapshots but no scoring or selector implementation", () => {
  const projection = readFileSync("server/p04/projections.ts", "utf8");
  assert.doesNotMatch(projection, /calculateTargetConfiguration|calculateBusinessArchetype|selectMoneyNowCandidate|resolveTransitionSequence/u);
  assert.doesNotMatch(projection, /products_method/u);
});
