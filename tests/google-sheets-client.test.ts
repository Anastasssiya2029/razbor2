import assert from "node:assert/strict";
import test from "node:test";
import { ANALYSIS_EXPORT_HEADERS } from "../server/exports/analysis-row";

test("Google Sheets contract fits exact A:BM 65-column range", () => {
  assert.equal(ANALYSIS_EXPORT_HEADERS.length, 65);
  assert.equal(ANALYSIS_EXPORT_HEADERS[0], "ID разбора");
  assert.equal(ANALYSIS_EXPORT_HEADERS.at(-1), "Первое действие");
});
