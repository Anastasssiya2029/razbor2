import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const page = readFileSync(join(process.cwd(), "app", "page.tsx"), "utf8");
const runRoute = readFileSync(join(
  process.cwd(),
  "app",
  "api",
  "analysis-runs",
  "[analysisRunId]",
  "run",
  "route.ts",
), "utf8");
const strategySummary = readFileSync(join(
  process.cwd(),
  "app",
  "_components",
  "analysis-strategy-summary.tsx",
), "utf8");
const resultView = readFileSync(join(
  process.cwd(),
  "app",
  "_components",
  "analysis-result-view.tsx",
), "utf8");

test("interactive Step 2 opens from the persisted overview before the full report is ready", () => {
  assert.match(runRoute, /overview,\s*\n\s*result: execution\.result/u);
  assert.match(page, /analysisResponse\.ok && analysis\?\.overview/u);
  assert.match(page, /setCurrentStage\(1\);[\s\S]*setMaxUnlockedStage\(\(current\) => Math\.max\(current, 1\)\);[\s\S]*setLoadingTarget\(null\)/u);

  const interactiveBranch = page.indexOf(") : currentStage === 1 ? (");
  const fullResultBranch = page.indexOf(") : realAnalysisResult ? (", interactiveBranch);
  assert.ok(interactiveBranch >= 0 && fullResultBranch > interactiveBranch);
});

test("restored result keeps the agreed carousel, archetype card, and evolution map without prototype recommendations", () => {
  assert.match(page, /Шаг 2 · Разбор/u);
  assert.match(page, /Бизнес-модель под вашу цель/u);
  assert.match(page, /<ArchetypeDialog/u);
  assert.match(page, /<EvolutionMap currentArchetypeId=\{analysis\.archetype\.id\} \/>/u);
  assert.doesNotMatch(page, /<BusinessAnalysis analysis=\{analysis\}/u);
  assert.doesNotMatch(page, /setLoadingTarget\("plan"\)/u);
  assert.match(page, /Почему сейчас такие баллы/u);
  assert.match(page, /analysis\.currentScoreArguments\.map/u);
  assert.match(page, /Почему не выше:/u);
  assert.match(page, /Мягкие элементы системы/u);
  assert.match(page, /Твёрдые элементы системы/u);
  assert.match(page, /currentModelGroups\.soft\.facts/u);
  assert.match(page, /currentModelGroups\.hard\.facts/u);
});

test("Step 2 adds the key money bundle and Money Now only after the final result is available", () => {
  assert.match(page, /result && <AnalysisStrategySummary result=\{result\} \/>/u);
  assert.match(strategySummary, /Связка для перехода к денежной цели/u);
  assert.match(strategySummary, /Почему именно эта связка/u);
  assert.match(strategySummary, /Почему не другие элементы/u);
  assert.match(strategySummary, /Где деньги сейчас/u);
  for (const status of [
    "available",
    "no_eligible_scenario",
    "blocked_insufficient_evidence",
    "blocked_inconsistency",
  ]) {
    assert.match(strategySummary, new RegExp(`case "${status}"`, "u"));
  }
});

test("Step 3 uses resolved route tasks and only neuromarketers for routed elements", () => {
  assert.match(resultView, /result\.route\.cards\.map/u);
  assert.match(resultView, /card\.tasks\.map/u);
  assert.match(resultView, /const routeElementIds = result\.route\.cards/u);
  assert.match(resultView, /ELEMENT_NEUROMARKETERS\[element\.id\]/u);
  assert.doesNotMatch(resultView, /prototypePlanTasks|prototypePlanCriteria/u);
});

test("client-facing progress copy does not expose internal pipeline names or raw failure codes", () => {
  assert.doesNotMatch(page, /AI-конвейер продолжает работу/u);
  assert.doesNotMatch(page, /status\.errorCode \?/u);
  assert.match(page, /План продолжает собираться/u);
});
