import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ANALYSIS_EXPORT_HEADERS } from "../server/exports/analysis-row";
import {
  buildClientQuestionnaireRows,
  clientQuestionnaireFilename,
  createClientQuestionnaireSpreadsheetXml,
} from "../server/exports/client-questionnaire";
import { createSpreadsheetXml } from "../server/exports/spreadsheet-xml";
import { ANNA_GOLDEN_CASE } from "./fixtures/anna-alina-golden";

test("analysis export has one stable 65-column contract without manager, gift, status or result link", () => {
  assert.equal(ANALYSIS_EXPORT_HEADERS.length, 65);
  assert.equal(new Set(ANALYSIS_EXPORT_HEADERS).size, 65);
  const joined = ANALYSIS_EXPORT_HEADERS.join("|").toLowerCase();
  assert.doesNotMatch(joined, /менеджер|подарок|статус|ссылк/u);
  assert.match(joined, /ниша/u);
  assert.equal(ANALYSIS_EXPORT_HEADERS.filter((header) => header === "ID разбора").length, 1);
  assert.equal(ANALYSIS_EXPORT_HEADERS.filter((header) => header === "Анкета · Клиент").length, 1);
});

test("SpreadsheetML export escapes formulas and unsafe XML as literal cell content", () => {
  const xml = createSpreadsheetXml(["A", "B"], [["=HYPERLINK(\"bad\")", "<client>&"]]);
  assert.match(xml, /ss:Type="String">=HYPERLINK/u);
  assert.match(xml, /&lt;client&gt;&amp;/u);
  assert.doesNotMatch(xml, /<client>/u);
});

test("per-client workbook contains the exact questionnaire answers and safe branded SpreadsheetML", () => {
  const source = {
    analysisRunId: "run-anna",
    createdAt: "2026-08-28T12:00:00.000Z",
    clientName: "Анна / тест",
    input: ANNA_GOLDEN_CASE.input,
    rawPayload: {
      rawAnswers: {
        values: {
          expertName: "=2+2",
          clientsCount: "10",
          uniqueness: "Формула <смыслов> & метода",
        },
        clientsCountPeriod: "month",
      },
    },
  };

  const rows = buildClientQuestionnaireRows(source);
  assert.equal(rows.length, 24);
  assert.equal(rows.find((row) => row.question === "Имя эксперта")?.answer, "=2+2");
  assert.equal(rows.find((row) => row.question === "Количество клиентов")?.answer, "10 (за месяц)");
  assert.equal(rows.find((row) => row.question === "Уникальность")?.answer, "Формула <смыслов> & метода");

  const xml = createClientQuestionnaireSpreadsheetXml(source);
  assert.match(xml, /ss:Name="Ответы клиента"/u);
  assert.match(xml, /ss:Type="String">=2\+2</u);
  assert.match(xml, /Формула &lt;смыслов&gt; &amp; метода/u);
  assert.match(xml, /#5D1975/u);
  assert.equal(clientQuestionnaireFilename(source.clientName), "Ответы_диагностики_7К_Анна тест.xls");
});

test("cabinet exposes the individual answers download next to each saved analysis", () => {
  const cabinet = readFileSync("app/cabinet/page.tsx", "utf8");
  assert.match(cabinet, /\/api\/analysis-runs\/\$\{item\.analysisRunId\}\/answers\.xls/u);
  assert.match(cabinet, />Excel</u);
});
