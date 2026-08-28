import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalysisOverview } from "../lib/analysis-overview";
import type { BusinessArchetypeResult, TargetConfigurationResult } from "../server/7k";
import type { SevenKScores } from "../server/7k/types";
import type { P01ResultV1_4_2 } from "../server/p01/types";

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
  const p01 = {
    evidenceLedger: [
      { id: "E1", fact: "Эксперт описывает сильные стороны, но пока не связал их в ясную систему." },
      { id: "E2", fact: "Есть общее описание аудитории без подтверждённых сегментов." },
    ],
    current7k: Object.fromEntries(Object.keys(currentScores).map((id) => [id, {
      evidence_ids: id === "authenticity" ? ["E1"] : id === "audience" ? ["E2"] : [],
      counterevidence_ids: [],
      why_not_higher: `Не подтверждён следующий уровень ${id}.`,
      cap_reason: null,
    }])),
  } as unknown as Pick<P01ResultV1_4_2, "current7k" | "evidenceLedger">;
  const overview = buildAnalysisOverview({
    currentScores,
    target: { targetScores } as TargetConfigurationResult,
    archetype: { finalArchetype: "creator" } as BusinessArchetypeResult,
    p01,
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
  assert.deepEqual(overview.currentScoreArguments[0], {
    id: "authenticity",
    score: 4,
    evidence: [],
    matchedCriterion: null,
    whyNotHigher: null,
    kind: "soft",
  });
  assert.equal(overview.currentScoreArguments[1].kind, "soft");
  assert.equal(overview.currentScoreArguments[2].kind, "hard");
});
