import assert from "node:assert/strict";
import { test } from "node:test";
import { SCORING_RULES, SCORING_RULES_RESOURCE_VERSION } from "@/server/7k/config/scoring-rules.v3.0";
import { EVIDENCE_ROUTING_RESOURCE_VERSION } from "@/server/7k/config/evidence-routing.v3.0";
import { TARGET_RULES_RESOURCE_VERSION } from "@/server/7k/config/target-rules.v2.2";
import { TRANSITIONS_V2_RESOURCE_VERSION, TRANSITIONS_70_V2 } from "@/server/7k/config/transitions-70.v2";
import { P01_PROMPT_VERSION } from "@/server/7k/prompts/p01.v1.4";

/**
 * Confirms the runtime rule versions match the four "current" methodology
 * packages the business team maintains (scoring-rules, evidence-routing,
 * target-rules, transitions-70) and the overall 7K methodology version.
 * Prevents the resource-version constants silently drifting behind the
 * content they describe (task: "Fix 7K scoring methodology drift").
 */
test("SCORING_RULES resource version matches the current methodology package", () => {
  assert.equal(SCORING_RULES_RESOURCE_VERSION, "scoring-rules.v3.5");
  assert.equal(SCORING_RULES.methodologyVersion, "7K-2026-08-v5.7");
});

test("EVIDENCE_ROUTING resource version matches the current methodology package", () => {
  assert.equal(EVIDENCE_ROUTING_RESOURCE_VERSION, "evidence-routing.v3.1");
});

test("TARGET_RULES resource version matches the current methodology package", () => {
  assert.equal(TARGET_RULES_RESOURCE_VERSION, "target-rules.v2.3");
});

test("TRANSITIONS_70 resource version and stamped methodology version are current", () => {
  assert.equal(TRANSITIONS_V2_RESOURCE_VERSION, "transitions-70.v2");
  assert.ok(TRANSITIONS_70_V2.length > 0);
  for (const transition of TRANSITIONS_70_V2) {
    assert.equal(transition.version, "7K-2026-08-v5.7");
  }
});

test("P01 prompt version is declared", () => {
  assert.ok(typeof P01_PROMPT_VERSION === "string" && P01_PROMPT_VERSION.length > 0);
});
