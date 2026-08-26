import { ALINA_GOLDEN_CASE, ANNA_GOLDEN_CASE } from "../tests/fixtures/anna-alina-golden";
import { SEVEN_K_ELEMENT_IDS } from "../server/7k/types";
import { createConfiguredP01Provider } from "../server/p01/provider";
import { runP01EvidenceScorer } from "../server/p01/runner";

if (process.env.ALLOW_PAID_AI_EVAL !== "true") {
  throw new Error(
    "Paid golden evaluation is locked. Set ALLOW_PAID_AI_EVAL=true only after explicit user approval.",
  );
}

const requestedCase = (process.env.GOLDEN_CASE ?? "all").trim().toLowerCase();
const cases = [ANNA_GOLDEN_CASE, ALINA_GOLDEN_CASE].filter(
  (item) => requestedCase === "all" || item.id === requestedCase,
);
if (cases.length === 0) {
  throw new Error("GOLDEN_CASE must be anna, alina, or all.");
}

const provider = createConfiguredP01Provider(process.env);
const reports: Array<Record<string, unknown>> = [];
let failed = false;

for (const goldenCase of cases) {
  const outcome = await runP01EvidenceScorer(goldenCase.input, {
    provider,
    moneyNowEnabled: false,
  });
  const actual = Object.fromEntries(
    SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, outcome.result.current7k[elementId].score]),
  );
  const differences = SEVEN_K_ELEMENT_IDS.flatMap((elementId) => {
    const expected = goldenCase.currentScores[elementId];
    const score = outcome.result.current7k[elementId].score;
    return score === expected ? [] : [{ elementId, expected, actual: score }];
  });
  if (outcome.kind !== "success" || differences.length > 0) failed = true;
  reports.push({
    case: goldenCase.id,
    outcome: outcome.kind,
    expected: goldenCase.currentScores,
    actual,
    differences,
    latencyMs: outcome.metadata.latencyMs,
    retryCount: outcome.metadata.retryCount,
    usage: outcome.metadata.usage,
  });
}

console.log(JSON.stringify({ model: provider.model, reports }, null, 2));
if (failed) process.exitCode = 1;
