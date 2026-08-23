import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("the diagnostic form recovers a tab-local draft and starts a clean analysis explicitly", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /FORM_RECOVERY_STORAGE_KEY/u);
  assert.match(page, /window\.sessionStorage\.setItem/u);
  assert.match(page, /startNewDiagnostic/u);
  assert.match(page, /setValues\(emptyDiagnosticValues\(\)\)/u);
  assert.match(page, /Новый разбор/u);
  assert.match(page, /Мои разборы/u);
});

test("expired authentication redirects only after the draft has a recovery path", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const session = readFileSync("app/_components/app-session.tsx", "utf8");
  assert.match(page, /redirectToLoginAfterExpiredSession/u);
  assert.match(page, /credentials: "include"/u);
  assert.match(session, /window\.setInterval/u);
  assert.match(session, /window\.addEventListener\("focus"/u);
});

test("a recovered failed or stale analysis run is not reused for changed answers", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /submittedDiagnosticMatchesForm/u);
  assert.match(page, /status\?\.status === "analysis_failed"/u);
  assert.match(page, /reusableDiagnostic = null/u);
  assert.match(page, /setSubmittedDiagnostic\(null\)/u);
});

test("the situation summary is split into four paragraphs and rubles are formatted", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /situationParagraphs/u);
  assert.match(page, /formula-paragraphs/u);
  assert.match(page, /formatRubles\(values\.goalIncome\)/u);
  assert.match(page, /formatRubles\(values\.currentIncome\)/u);
});
