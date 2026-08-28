import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CLIENT_PATH,
  emptyDiagnosticValues,
  formatMoneyInput,
  formatRubles,
  valuesForSubmission,
} from "../lib/diagnostic-form";

test("money fields group thousands while keeping a numeric stored value", () => {
  assert.equal(formatMoneyInput("100000"), "100 000");
  assert.equal(formatMoneyInput("1 250 000 ₽"), "1 250 000");
  assert.equal(formatMoneyInput(""), "");
  assert.equal(formatRubles("1250000"), "1 250 000 ₽");
  assert.equal(formatRubles("70 000"), "70 000 ₽");
});

test("a new form contains the editable client-path template but does not submit it as client evidence", () => {
  assert.equal(emptyDiagnosticValues().clientPath, DEFAULT_CLIENT_PATH);
  assert.equal(valuesForSubmission(emptyDiagnosticValues()).clientPath, "");
  assert.equal(
    valuesForSubmission({ clientPath: "Telegram → диагностика → консультация" }).clientPath,
    "Telegram → диагностика → консультация",
  );
});
