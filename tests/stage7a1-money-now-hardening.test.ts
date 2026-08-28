import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MONEY_NOW_FACT_CODES,
  MONEY_NOW_FACT_EVIDENCE_POLICIES,
  MONEY_NOW_FACT_EXTRACTION_DICTIONARY,
} from "../server/7k/config/money-now-fact-extraction.v1";
import {
  MONEY_NOW_CAPACITY_MODES,
  MONEY_NOW_PROOF_LEVEL_BY_CONFIDENCE,
  MONEY_NOW_SELECTOR_CONTRACT,
  MONEY_NOW_SELECTOR_CONTRACT_VERSION,
  assertMoneyNowSelectorContractIntegrity,
  evaluateMoneyNowCapacityFit,
  type MoneyNowCapacityMode,
  type MoneyNowSelectorContract,
} from "../server/7k/config/money-now-selector-contract.v1";
import { MONEY_NOW_SCENARIO_IDS } from "../server/7k/config/money-now.v2.2";
import { unknownMoneyNowFacts } from "./helpers/p01-v1.4";

test("all 44 facts have exactly one evidencePolicy", () => {
  assert.equal(MONEY_NOW_FACT_CODES.length, 44);
  assert.deepEqual(
    Object.keys(MONEY_NOW_FACT_EVIDENCE_POLICIES).sort(),
    [...MONEY_NOW_FACT_CODES].sort(),
  );
  const policies = Object.values(MONEY_NOW_FACT_EVIDENCE_POLICIES);
  assert.equal(policies.filter((policy) => policy === "historical_allowed").length, 5);
  assert.equal(
    policies.filter((policy) => policy === "current_or_historical_repeatable").length,
    5,
  );
  assert.equal(policies.filter((policy) => policy === "current_required").length, 34);
});

test("P-01 extraction dictionary contains no selector rules", () => {
  const serialized = JSON.stringify(MONEY_NOW_FACT_EXTRACTION_DICTIONARY);
  assert.match(serialized, /money-now-fact-extraction\.v1/u);
  assert.match(serialized, /evidencePolicy/u);
  assert.match(serialized, /triStateSemantics/u);
  assert.doesNotMatch(serialized, /scenarioRequiredFacts/u);
  assert.doesNotMatch(serialized, /capacityModes/u);
  assert.doesNotMatch(serialized, /materialConditionPrimaryCodesByScenario/u);
  assert.doesNotMatch(serialized, /ranking|modelFitRule|eligibilityRule/u);
});

test("runtime proof mapping is derived from the raw selector contract", () => {
  assert.equal(MONEY_NOW_SELECTOR_CONTRACT_VERSION, "money-now-selector-contract.v1.2");
  assert.deepEqual(
    MONEY_NOW_PROOF_LEVEL_BY_CONFIDENCE,
    MONEY_NOW_SELECTOR_CONTRACT.proofLevelMapping,
  );
  const source = readFileSync(
    "server/7k/config/money-now-selector-contract.v1.ts",
    "utf8",
  );
  assert.match(source, /\.\.\.rawContract\.proofLevelMapping/u);
  assert.doesNotMatch(source, /Object\.freeze\(\{\s*high:\s*3/u);
});

function expectedCapacityFit(
  mode: MoneyNowCapacityMode,
  unusedCapacity: "confirmed_true" | "confirmed_false" | "unknown",
  overload: "confirmed_true" | "confirmed_false" | "unknown",
): "fit" | "risk" | "no_fit" {
  if (mode === "capacity_neutral") return "fit";
  if (mode === "uses_existing_flow") {
    return overload === "confirmed_true" ? "risk" : "fit";
  }
  if (overload === "confirmed_true") return "no_fit";
  if (unusedCapacity === "confirmed_true") return "fit";
  if (unusedCapacity === "confirmed_false") return "no_fit";
  return "risk";
}

test("capacity evaluator executes ordered config for every capacity/overload combination", () => {
  const stateValues = ["confirmed_true", "confirmed_false", "unknown"] as const;
  const scenarioByMode = Object.fromEntries(
    (["requires_additional_delivery", "uses_existing_flow", "capacity_neutral"] as const).map(
      (mode) => [
        mode,
        MONEY_NOW_SCENARIO_IDS.find(
          (scenarioId) => MONEY_NOW_CAPACITY_MODES[scenarioId] === mode,
        ),
      ],
    ),
  ) as Record<MoneyNowCapacityMode, (typeof MONEY_NOW_SCENARIO_IDS)[number]>;

  for (const mode of Object.keys(scenarioByMode) as MoneyNowCapacityMode[]) {
    assert.ok(scenarioByMode[mode]);
    for (const unusedCapacity of stateValues) {
      for (const overload of stateValues) {
        const facts = unknownMoneyNowFacts({
          HAS_UNUSED_CAPACITY: { state: unusedCapacity },
          CURRENT_OVERLOAD: { state: overload },
        });
        assert.equal(
          evaluateMoneyNowCapacityFit(scenarioByMode[mode], facts),
          expectedCapacityFit(mode, unusedCapacity, overload),
          `${mode}: unused=${unusedCapacity}, overload=${overload}`,
        );
      }
    }
  }
});

test("contract integrity rejects an unknown prerequisite fact", () => {
  const invalid = structuredClone(
    MONEY_NOW_SELECTOR_CONTRACT,
  ) as MoneyNowSelectorContract;
  invalid.scenarioRequiredFacts.MN01[0] = "UNKNOWN_FACT" as never;
  assert.throws(
    () => assertMoneyNowSelectorContractIntegrity(invalid),
    /Unknown prerequisite fact UNKNOWN_FACT/u,
  );
});

test("Stage 4, P-02 and Task Resolver accept only the hardened P-01 prompt version", () => {
  const files = [
    "server/stage4/compute.ts",
    "server/p02/projections.ts",
    "server/task-resolver/preflight.ts",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /P-01\.v1\.4\.2/u, file);
    assert.doesNotMatch(source, /P-01\.v1\.4(?!\.2)/u, file);
  }
});

test("P-02 projection still excludes the entire Money Now branch", () => {
  const source = readFileSync("server/p02/projections.ts", "utf8");
  const projection =
    source.match(/const strategyContext: P01StrategyContext = \{([\s\S]*?)\n  \};/u)?.[1] ?? "";
  assert.doesNotMatch(
    projection,
    /moneyNowFacts|moneyNowSignals|moneyNowHistory|MONEY_NOW/u,
  );
});

test("Stage 7A.1 does not call Selector, P-03 or P-04", () => {
  const files = [
    "server/p01/request.ts",
    "server/p01/runner.ts",
    "server/p01/validation.ts",
    "server/p01/money-now-history-adapter.ts",
    "server/stage4/compute.ts",
    "server/p02/projections.ts",
    "server/task-resolver/preflight.ts",
  ];
  const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /selectMoneyNowCandidate\s*\(/u);
  assert.doesNotMatch(source, /P-03|P-04/u);
});
