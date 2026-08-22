import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MONEY_NOW_CAPACITY_MODES,
  MONEY_NOW_FACT_CODES,
  MONEY_NOW_MODEL_FIT_DEFAULT,
  MONEY_NOW_PROOF_LEVEL_BY_CONFIDENCE,
  MONEY_NOW_SCENARIO_REQUIRED_FACTS,
  evaluateMoneyNowCapacityFit,
  moneyNowProofLevel,
} from "../server/7k/config/money-now-selector-contract.v1";
import { MONEY_NOW_SCENARIO_IDS } from "../server/7k/config/money-now.v2.2";
import { unknownMoneyNowFacts } from "./helpers/p01-v1.4";

test("Stage 7A registry contains exactly 44 facts and all 16 prerequisite sets", () => {
  assert.equal(MONEY_NOW_FACT_CODES.length, 44);
  assert.equal(new Set(MONEY_NOW_FACT_CODES).size, 44);
  assert.deepEqual(Object.keys(MONEY_NOW_SCENARIO_REQUIRED_FACTS).sort(), [...MONEY_NOW_SCENARIO_IDS].sort());
  for (const scenarioId of MONEY_NOW_SCENARIO_IDS) {
    assert.ok(MONEY_NOW_SCENARIO_REQUIRED_FACTS[scenarioId].length > 0);
    for (const factCode of MONEY_NOW_SCENARIO_REQUIRED_FACTS[scenarioId]) {
      assert.ok(MONEY_NOW_FACT_CODES.includes(factCode));
    }
  }
});

test("proof mapping is exact and deterministic", () => {
  assert.deepEqual(MONEY_NOW_PROOF_LEVEL_BY_CONFIDENCE, { high: 3, medium: 2, low: 1 });
  assert.equal(moneyNowProofLevel("high"), 3);
  assert.equal(moneyNowProofLevel("medium"), 2);
  assert.equal(moneyNowProofLevel("low"), 1);
});

test("all 16 capacity modes exist and capacity rules follow the contract", () => {
  assert.deepEqual(Object.keys(MONEY_NOW_CAPACITY_MODES).sort(), [...MONEY_NOW_SCENARIO_IDS].sort());
  const facts = unknownMoneyNowFacts();
  const additional = MONEY_NOW_SCENARIO_IDS.find((id) => MONEY_NOW_CAPACITY_MODES[id] === "requires_additional_delivery");
  const existing = MONEY_NOW_SCENARIO_IDS.find((id) => MONEY_NOW_CAPACITY_MODES[id] === "uses_existing_flow");
  const neutral = MONEY_NOW_SCENARIO_IDS.find((id) => MONEY_NOW_CAPACITY_MODES[id] === "capacity_neutral");
  assert.ok(additional && existing && neutral);
  assert.equal(evaluateMoneyNowCapacityFit(additional, facts), "risk");
  facts.HAS_UNUSED_CAPACITY.state = "confirmed_true";
  assert.equal(evaluateMoneyNowCapacityFit(additional, facts), "fit");
  facts.CURRENT_OVERLOAD.state = "confirmed_true";
  assert.equal(evaluateMoneyNowCapacityFit(additional, facts), "no_fit");
  assert.equal(evaluateMoneyNowCapacityFit(existing, facts), "risk");
  assert.equal(evaluateMoneyNowCapacityFit(neutral, facts), "fit");
});

test("model fit defaults to fit and has no target-model ranking input", () => {
  assert.equal(MONEY_NOW_MODEL_FIT_DEFAULT, "fit");
  const contractSource = readFileSync("server/7k/config/money-now-selector-contract.v1.ts", "utf8");
  assert.doesNotMatch(contractSource, /targetModel|modelFamily|rankingWeight/u);
});

test("P-02 projection excludes moneyNowFacts from hardened P-01 v1.4.2", () => {
  const source = readFileSync("server/p02/projections.ts", "utf8");
  const projection = source.match(/const strategyContext: P01StrategyContext = \{([\s\S]*?)\n  \};/u)?.[1] ?? "";
  assert.match(projection, /evidenceLedger/u);
  assert.match(projection, /current7k/u);
  assert.doesNotMatch(projection, /moneyNowFacts|moneyNowSignals|moneyNowHistory/u);
});

test("Stage 4, P-02 and Task Resolver pin P-01 v1.4.2 and keep their own algorithms unchanged", () => {
  const stage4 = readFileSync("server/stage4/compute.ts", "utf8");
  const p02 = readFileSync("server/p02/projections.ts", "utf8");
  const resolver = readFileSync("server/task-resolver/preflight.ts", "utf8");
  assert.match(stage4, /P-01\.v1\.4\.2/u);
  assert.match(p02, /P-01\.v1\.4\.2/u);
  assert.match(resolver, /P-01\.v1\.4\.2/u);
  assert.match(stage4, /calculateTargetConfiguration/u);
  assert.match(p02, /products_method is forbidden/u);
  assert.doesNotMatch(`${stage4}\n${p02}\n${resolver}`, /current7k\.products_method|element_id:\s*"products_method"/u);
});

test("Stage 7A does not call selector, P-03 or P-04", () => {
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
