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
const editableChecklist = readFileSync(join(
  process.cwd(),
  "app",
  "_components",
  "editable-plan-checklist.tsx",
), "utf8");
const checklistModel = readFileSync(join(process.cwd(), "lib", "analysis-checklist.ts"), "utf8");
const savedResultPage = readFileSync(join(
  process.cwd(),
  "app",
  "analysis",
  "[analysisRunId]",
  "page.tsx",
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
  assert.match(page, /Мягкие элементы системы/u);
  assert.match(page, /Твёрдые элементы системы/u);
  assert.match(page, /buildCurrentSystemSummary/u);
  assert.doesNotMatch(page, /systemElementDefinitions\[argument\.id\]\.name/u);
  assert.match(page, /currentModelGroups\.soft/u);
  assert.match(page, /currentModelGroups\.hard/u);
  assert.match(page, /<p>\{currentModelGroups\.soft\}<\/p>/u);
  assert.match(page, /<p>\{currentModelGroups\.hard\}<\/p>/u);
  assert.doesNotMatch(page, /<strong>\{currentModelGroups\.(?:soft|hard)\}<\/strong>/u);
  assert.doesNotMatch(page, /current-score-argument-grid/u);
  assert.doesNotMatch(page, /Почему не выше:/u);
  assert.match(page, /Итоговый балл:/u);
  assert.match(page, /currentTotal/u);
  assert.doesNotMatch(page, /Проанализировано ответов:/u);
});

test("Step 2 adds one shared key and supporting bundle and keeps Money Now hidden for MVP", () => {
  assert.match(page, /result && <AnalysisStrategySummary result=\{result\} \/>/u);
  assert.match(strategySummary, /Связка для перехода к денежной цели/u);
  assert.match(strategySummary, /Почему именно эта связка/u);
  assert.match(strategySummary, /Ключевая связка/u);
  assert.match(strategySummary, /Поддерживающие элементы/u);
  assert.doesNotMatch(strategySummary, /Главный элемент/u);
  assert.match(strategySummary, /Продукты и метод/u);
  assert.match(strategySummary, /Воронка и связки/u);
  assert.match(strategySummary, /<h4>\{compactElementName\(elementId\)\}<\/h4>/u);
  assert.doesNotMatch(strategySummary, /Поддерживающие изменения/u);
  assert.match(strategySummary, /Пока не трогаем как отдельное направление/u);
  assert.doesNotMatch(strategySummary, /Где деньги сейчас/u);
});

test("Step 3 expands every target gap into printable canonical transition tasks", () => {
  assert.match(checklistModel, /resolveTransitionSequence/u);
  assert.match(resultView, /resolveGrowthPriorityPlan/u);
  assert.match(editableChecklist, /growthRole/u);
  assert.match(editableChecklist, /card\.tasks\.map/u);
  assert.match(editableChecklist, /route-task-check/u);
  assert.match(editableChecklist, /Готово, когда/u);
  assert.doesNotMatch(editableChecklist, />\s*Редактировать чек-лист\s*</u);
  assert.match(editableChecklist, /manager-card-edit/u);
  assert.match(editableChecklist, /editingCardIndex === cardIndex/u);
  assert.match(editableChecklist, /Сохранить версию/u);
  assert.match(checklistModel, /flatMap\(splitCanonicalTransitionTask\)/u);
  assert.doesNotMatch(resultView, /plan-identity-summary/u);
  assert.doesNotMatch(resultView, /Нейромаркетологи для реализации/u);
  assert.doesNotMatch(resultView, /Где деньги сейчас/u);
  assert.doesNotMatch(resultView, /prototypePlanTasks|prototypePlanCriteria/u);
});

test("saved result restores the step navigation and separates review from plan", () => {
  assert.match(savedResultPage, /const \[activeStage, setActiveStage\]/u);
  assert.match(savedResultPage, /view=\{activeStage === 1 \? "analysis" : "plan"\}/u);
  assert.match(savedResultPage, /saved-result-journey/u);
  assert.match(savedResultPage, />Разбор</u);
  assert.match(savedResultPage, />План перехода</u);
  assert.match(savedResultPage, /<GiftWheel analysisRunId=\{analysisRunId\}/u);
  assert.match(savedResultPage, /activeStage === 1 && <header/u);
});

test("client-facing progress copy does not expose internal pipeline names or raw failure codes", () => {
  assert.doesNotMatch(page, /AI-конвейер продолжает работу/u);
  assert.doesNotMatch(page, /status\.errorCode \?/u);
  assert.match(page, /План продолжает собираться/u);
});
