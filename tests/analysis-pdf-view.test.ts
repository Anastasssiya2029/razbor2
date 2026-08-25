import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pdfView = readFileSync("app/_components/analysis-pdf-view.tsx", "utf8");
const resultView = readFileSync("app/_components/analysis-result-view.tsx", "utf8");
const checklist = readFileSync("lib/analysis-checklist.ts", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const downloadButton = readFileSync("app/_components/pdf-download-button.tsx", "utf8");

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
  assert.match(pdfView, /БИЗНЕС-МОДЕЛЬ 7К — семь ключевых вопросов/u);
  assert.match(pdfView, /на которые нужно ответить бизнесу, чтобы понять, что ограничивает рост и как увеличить доход\./u);
  assert.match(pdfView, /ПЕРЕХОД К ДЕНЕЖНОЙ ЦЕЛИ/u);
  assert.match(pdfView, /number:\s*1,\s*label:\s*"Аутентичность"/u);
  assert.match(pdfView, /Кто я\?/u);
  assert.match(pdfView, /number:\s*7,\s*label:\s*"Команда"/u);
  assert.match(pdfView, /Как сделать бизнес автономным\?/u);
  assert.match(pdfView, /<PdfBrand page=\{1\} \/>/u);
  assert.doesNotMatch(pdfView, /totalPages/u);
  assert.doesNotMatch(pdfView, /business-system-diagnostic\.suhareva-anastasiya\.chatgpt\.site/u);
});

test("target model and checklist are generated from canonical result data", () => {
  assert.match(pdfView, /result\.current\.scores\[element\.id\]/u);
  assert.match(pdfView, /result\.target\.targetScores\[element\.id\]/u);
  assert.match(pdfView, /resolveGrowthPriorityPlan\(result\)/u);
  assert.match(checklist, /resolveTransitionSequence/u);
  assert.match(pdfView, /buildCanonicalChecklist\(result\)/u);
  assert.match(pdfView, /applyManagerPlan/u);
  assert.match(pdfView, /card\.tasks\.map/u);
  assert.match(pdfView, /Готово, когда:/u);
  assert.match(pdfView, /result\.report\.growthPoint\.coach_explanation/u);
  assert.match(pdfView, /orderedGrowthElements\(growthPlan\)/u);
  assert.match(pdfView, /Чтобы выйти на денежную цель, нужно усилить ключевые, на текущий момент, элементы бизнес-модели/u);
  assert.doesNotMatch(pdfView, /targetConfiguration\.summary/u);
  assert.match(pdfView, /Рабочий путь клиента/u);
  assert.match(pdfView, /Балл: \{card\.fromScore\} → \{card\.toScore\}/u);
  assert.match(pdfView, /localizeWhyNotNow\(item\.text\)/u);
  assert.doesNotMatch(pdfView, /70 000|200 000|Анн[аы]/u);
});

test("archetype and checklist pages preserve the approved reference layout", () => {
  assert.match(pdfView, /Бизнес-архетип текущей модели/u);
  assert.match(pdfView, /Архетип показывает способ находить решения на текущем уровне, а не описывает характер человека\./u);
  assert.match(pdfView, /Что поможет<br \/>перейти дальше/u);
  assert.match(pdfView, /className="analysis-pdf-checklist-title"/u);
  assert.match(pdfView, /String\(checklistCards\.length\)\.padStart\(2, "0"\)/u);
  assert.match(pdfView, /className="analysis-pdf-checklist-card"/u);
  assert.match(pdfView, /className="analysis-pdf-checklist-main"/u);
  assert.match(pdfView, /<aside className="analysis-pdf-neuro-card">/u);
  assert.match(styles, /\.analysis-pdf-archetype-grid\s*\{[\s\S]*grid-template-columns:\s*1fr 1fr;/u);
  assert.match(styles, /\.analysis-pdf-checklist-card\s*\{[\s\S]*height:\s*209mm;[\s\S]*grid-template-columns:/u);
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

test("plan PDF is downloaded as a real multi-page file instead of only opening the print dialog", () => {
  assert.match(resultView, /<PdfDownloadButton/u);
  assert.doesNotMatch(resultView, /window\.print\(\)/u);
  assert.match(downloadButton, /import\("html-to-image"\)/u);
  assert.match(downloadButton, /import\("jspdf"\)/u);
  assert.match(downloadButton, /querySelectorAll<HTMLElement>\("\.analysis-pdf-page"\)/u);
  assert.match(downloadButton, /image\.loading = "eager"/u);
  assert.match(downloadButton, /list\.scrollHeight > list\.clientHeight \+ 1/u);
  assert.match(downloadButton, /lastItem\.getBoundingClientRect\(\)\.bottom > card\.getBoundingClientRect\(\)\.bottom - 1/u);
  assert.match(downloadButton, /classList\.add\("is-overflowing"\)/u);
  assert.match(downloadButton, /resetChecklistLayout\(\)/u);
  assert.match(styles, /\.analysis-pdf-task-list\.is-overflowing\s*\{[\s\S]*justify-content:\s*flex-start;/u);
  assert.match(downloadButton, /Promise\.race/u);
  assert.match(downloadButton, /skipFonts:\s*true/u);
  assert.match(downloadButton, /PDF_IMAGE_PAGE_PIXEL_RATIO\s*=\s*4\.5/u);
  assert.match(downloadButton, /containsImages \? PDF_IMAGE_PAGE_PIXEL_RATIO : PDF_TEXT_PAGE_PIXEL_RATIO/u);
  assert.match(downloadButton, /quality:\s*0\.98/u);
  assert.match(downloadButton, /pdf\.save/u);
});
