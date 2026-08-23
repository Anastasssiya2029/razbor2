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
});
