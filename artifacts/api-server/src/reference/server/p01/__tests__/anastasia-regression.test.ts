import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assertDiagnosticInputForAi } from "@/lib/diagnostic-input";
import { runP01EvidenceScorer } from "@/server/p01/runner";
import { createConfiguredP01Provider } from "@/server/p01/provider";

/**
 * Named regression fixture for the "Анастасия" case that exposed the 7K
 * scoring drift: `current.products` and `project.team` are long, messy,
 * single-field answers, and the buggy prompt/config used to collapse them
 * into a single fact instead of extracting every documented step. This test
 * runs the REAL production pipeline (real LLM call, no mocked provider) so
 * it validates the whole prompt + evidence-routing + guard chain, not just
 * schema shape. It requires AI_INTEGRATIONS_OPENAI_API_KEY and is skipped
 * without it; run manually before any further change to the 7K scoring
 * config, prompts, or the upper-level contradiction guard.
 *
 * Scores are asserted as bounds, not exact equality: the provider is a real
 * LLM and sampling introduces run-to-run variance (observed during
 * investigation: product_method 4-5, team 5-6, authenticity 6-7 across
 * otherwise-identical runs). The bounds encode the methodologically
 * confirmed floor for each element; a run that drops below the floor is a
 * regression worth investigating even if it doesn't reproduce every run.
 */

const hasProviderCredentials = Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY);

test(
  "Анастасия: real end-to-end 7K recompute stays at or above the methodologically confirmed floor",
  { skip: !hasProviderCredentials && "AI_INTEGRATIONS_OPENAI_API_KEY is not set" },
  async () => {
    const fixturePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "fixtures/anastasia-diagnostic-input.json",
    );
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    const input = assertDiagnosticInputForAi(raw);

    const outcome = await runP01EvidenceScorer(input, {
      provider: createConfiguredP01Provider(process.env),
      moneyNowEnabled: false,
    });

    assert.equal(outcome.kind, "success", `expected a scored result, got ${outcome.kind}`);
    if (outcome.kind !== "success") return;

    const scores = outcome.result.current7k;
    const floor: Record<string, number> = {
      authenticity: 6,
      audience: 6,
      product_method: 4,
      sales_technology: 8,
      funnel: 6,
      blog: 6,
      team: 5,
    };
    for (const [elementId, minScore] of Object.entries(floor)) {
      const score = scores[elementId as keyof typeof scores].score;
      assert.ok(
        typeof score === "number" && score >= minScore,
        `${elementId}: expected score >= ${minScore}, got ${score}`,
      );
    }

    // The specific facts the brief flagged as missing must survive extraction,
    // even split across "current.products" and "project.team" long-answer
    // fields, tagged to the right elements.
    const ledgerFacts = outcome.result.evidenceLedger.map((item) => item.fact).join(" \n ");
    assert.match(ledgerFacts, /36[ .]?800/, "самостоятельный тариф за 36 800 должен быть извлечён");
    assert.match(ledgerFacts, /15\b.*(человек|сотрудник)|(человек|сотрудник).*15\b/iu, "команда из ~15 человек должна быть извлечена");
  },
);
