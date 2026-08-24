import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pdfView = readFileSync("app/_components/analysis-pdf-view.tsx", "utf8");
const resultView = readFileSync("app/_components/analysis-result-view.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");

test("approved PDF plan is embedded once and receives the persisted analysis context", () => {
  assert.match(resultView, /<AnalysisPdfView/u);
  assert.match(resultView, /result=\{result\}/u);
  assert.match(resultView, /currentRevenueRub=\{currentRevenueRub\}/u);
  assert.match(resultView, /targetRevenueRub=\{targetRevenueRub\}/u);
  assert.match(resultView, /deadlineLabel=\{deadlineLabel\}/u);
});

test("print template uses the approved 7K cover and footer contract", () => {
  assert.match(pdfView, /kurs-neuro\.ru/u);
  assert.match(pdfView, /ПЕРСОНАЛЬНАЯ СТРАТЕГИЯ 7К/u);
  assert.match(pdfView, /ПЕРЕХОД К ДЕНЕЖНОЙ ЦЕЛИ/u);
  assert.match(pdfView, /number:\s*1,\s*label:\s*"Аутентичность"/u);
  assert.match(pdfView, /Кто я\?/u);
  assert.match(pdfView, /number:\s*7,\s*label:\s*"Команда"/u);
  assert.match(pdfView, /Как сделать бизнес автономным\?/u);
  assert.doesNotMatch(pdfView, /business-system-diagnostic\.suhareva-anastasiya\.chatgpt\.site/u);
});

test("target model and checklist are generated from canonical result data", () => {
  assert.match(pdfView, /result\.current\.scores\[element\.id\]/u);
  assert.match(pdfView, /result\.target\.targetScores\[element\.id\]/u);
  assert.match(pdfView, /resolveGrowthPriorityPlan\(result\)/u);
  assert.match(pdfView, /resolveTransitionSequence/u);
  assert.match(pdfView, /card\.transitions\.map/u);
  assert.match(pdfView, /Готово, когда:/u);
  assert.match(pdfView, /result\.report\.growthPoint\.coach_explanation/u);
  assert.doesNotMatch(pdfView, /70 000|200 000|Анн[аы]/u);
});

test("each growing element carries its mapped neuromarketer without changing analysis data", () => {
  assert.match(pdfView, /ELEMENT_NEUROMARKETERS\[card\.elementId\]/u);
  assert.match(pdfView, /NEUROMARKETERS\[specialistId\]/u);
  assert.match(pdfView, /Нейропомощник создан по авторской технологии/u);
});

test("print cascade replaces the interactive result with full-bleed A4 pages", () => {
  assert.match(styles, /@page\s*\{[\s\S]*size:\s*A4 portrait;[\s\S]*margin:\s*0;/u);
  assert.match(styles, /\.result-view > :not\(\.analysis-pdf\)/u);
  assert.match(styles, /\.analysis-pdf-page\s*\{[\s\S]*width:\s*210mm;[\s\S]*height:\s*297mm;/u);
  assert.match(styles, /print-color-adjust:\s*exact/u);
});
