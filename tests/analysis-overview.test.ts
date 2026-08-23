import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalysisOverview } from "../lib/analysis-overview";
import type { BusinessArchetypeResult, TargetConfigurationResult } from "../server/7k";
import type { SevenKScores } from "../server/7k/types";

const currentScores: SevenKScores = {
  authenticity: 4,
  audience: 3,
  product_method: 2,
  sales_technology: 3,
  funnel: 1,
  blog: 2,
  team: 1,
};

const targetScores: SevenKScores = {
  authenticity: 5,
  audience: 5,
  product_method: 5,
  sales_technology: 5,
  funnel: 3,
  blog: 2,
  team: 2,
};

test("analysis overview exposes persisted 7K scores and canonical archetype for the interactive result", () => {
  const overview = buildAnalysisOverview({
    currentScores,
    target: { targetScores } as TargetConfigurationResult,
    archetype: { finalArchetype: "creator" } as BusinessArchetypeResult,
  });

  assert.equal(overview.archetype.id, "creator");
  assert.deepEqual(
    overview.systemScores.map(({ id, currentScore, targetScore }) => ({ id, currentScore, targetScore })),
    [
      { id: "authenticity", currentScore: 4, targetScore: 5 },
      { id: "audience", currentScore: 3, targetScore: 5 },
      { id: "products_method", currentScore: 2, targetScore: 5 },
      { id: "sales_technology", currentScore: 3, targetScore: 5 },
      { id: "funnel", currentScore: 1, targetScore: 3 },
      { id: "blog", currentScore: 2, targetScore: 2 },
      { id: "team", currentScore: 1, targetScore: 2 },
    ],
  );
});
