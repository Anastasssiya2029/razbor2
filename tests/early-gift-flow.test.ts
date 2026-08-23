import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("the first form block is persisted as a draft before opening project info", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /saveStartAndOpenProject/u);
  assert.match(page, /diagnosticPayload\(rawValues, "draft"\)/u);
  assert.match(page, /\/api\/diagnostics\/\$\{reusableDiagnostic\.diagnosticId\}\/submit/u);
  assert.match(page, /\{ label: "", accessibleLabel: "Бонусный этап" \}/u);
  assert.doesNotMatch(page, /label: "Колесо возможностей"/u);
  assert.match(page, /currentStage === 3 && submittedDiagnostic/u);
  assert.match(page, /index === 3 \? !submittedDiagnostic : index > maxUnlockedStage/u);
});

test("an owned draft can draw a gift without waiting for AI analysis", () => {
  const route = readFileSync("app/api/analysis-runs/[analysisRunId]/gift/route.ts", "utf8");
  assert.match(route, /ownerOnly: true/u);
  assert.doesNotMatch(route, /ANALYSIS_NOT_READY|status\s*===\s*"ready"|async function ready/u);
});

test("the wheel retains the Replit client-number guard and remains excluded from print", () => {
  const wheel = readFileSync("app/_components/gift-wheel.tsx", "utf8");
  assert.match(wheel, /Number\.isInteger\(spinCount\)/u);
  assert.match(wheel, /spinCount <= 10/u);
  assert.match(wheel, /gift-section no-print/u);
});

test("the printable result uses the shared name declension and no wheel", () => {
  const resultView = readFileSync("app/_components/analysis-result-view.tsx", "utf8");
  const detailPage = readFileSync("app/analysis/[analysisRunId]/page.tsx", "utf8");
  assert.match(resultView, /declineRussianNameGenitive/u);
  assert.match(resultView, /ResultSystemModel/u);
  assert.doesNotMatch(detailPage, /GiftWheel/u);
});
