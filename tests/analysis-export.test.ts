import assert from "node:assert/strict";
import test from "node:test";
import { ANALYSIS_EXPORT_HEADERS } from "../server/exports/analysis-row";
import { createSpreadsheetXml } from "../server/exports/spreadsheet-xml";

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
