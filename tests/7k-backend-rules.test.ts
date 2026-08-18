import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ARCHETYPES_RESOURCE_VERSION,
  BASE_MODEL_PROFILES,
  CAPABILITY_FLOORS,
  MONEY_NOW_CAPACITY_MODEL_FIT_RULES,
  MONEY_NOW_CAUSE_CODES,
  MONEY_NOW_INTERVENTION_RULES,
  MONEY_NOW_RESOURCE_VERSION,
  MONEY_NOW_SCENARIOS,
  MONEY_NOW_STOP_RULES,
  SEVEN_K_ELEMENT_IDS,
  SEVEN_K_RESOURCE_VERSIONS,
  TARGET_MODIFIER_FLOORS,
  TRANSITIONS_70,
  TRANSITIONS_70_INTEGRITY,
  TRANSITIONS_70_RESOURCE,
  SevenKValidationError,
  calculateBusinessArchetype,
  calculateTargetConfiguration,
  getCandidateArchetypeByTotal,
  resolveTransitionSequence,
  selectMoneyNowCandidate,
  validateTransitionRegistry,
  type SevenKScores,
} from "../server/7k/index";

function scores(overrides: Partial<SevenKScores> = {}): SevenKScores {
  return {
    authenticity: 0,
    audience: 0,
    product_method: 0,
    sales_technology: 0,
    funnel: 0,
    blog: 0,
    team: 0,
    ...overrides,
  };
}

test("declares the exact versioned 7K server resources", () => {
  assert.deepEqual(SEVEN_K_RESOURCE_VERSIONS, {
    elements: "elements.v1",
    transitions: "transitions-70.v1",
    archetypes: "archetypes.v1",
    targetRules: "target-rules.v2.1",
    moneyNow: "money-now.v2.2",
  });
  assert.equal(ARCHETYPES_RESOURCE_VERSION, "archetypes.v1");
  assert.equal(MONEY_NOW_RESOURCE_VERSION, "money-now.v2.2");
});

test("server registries contain every approved model, capability, modifier and Money Now rule", () => {
  assert.equal(Object.keys(BASE_MODEL_PROFILES).length, 10);
  assert.equal(Object.keys(CAPABILITY_FLOORS).length, 57);
  assert.equal(Object.keys(TARGET_MODIFIER_FLOORS).length, 16);
  assert.equal(MONEY_NOW_SCENARIOS.length, 16);
  assert.equal(new Set(MONEY_NOW_SCENARIOS.map((scenario) => scenario.id)).size, 16);
  assert.equal(Object.keys(MONEY_NOW_CAUSE_CODES).length, 14);
  assert.equal(Object.keys(MONEY_NOW_INTERVENTION_RULES).length, 14);
  assert.ok(MONEY_NOW_STOP_RULES.some((rule) => rule.id === "REPEATED_SOLUTION_WITHOUT_NEW_CONDITION"));
  assert.deepEqual(
    MONEY_NOW_CAPACITY_MODEL_FIT_RULES.map((rule) => rule.id),
    ["CAPACITY_OVERLOADED", "MODEL_FIT_REQUIRED"],
  );
});

test("imports exactly 70 unique sequential transitions with complete 0→10 coverage", () => {
  assert.equal(TRANSITIONS_70.length, 70);
  assert.deepEqual(TRANSITIONS_70_INTEGRITY, {
    count: 70,
    uniqueTaskIds: 70,
    transitionsPerElement: Object.fromEntries(SEVEN_K_ELEMENT_IDS.map((id) => [id, 10])),
  });
  assert.equal(TRANSITIONS_70_RESOURCE.source.sheet, "Переходы_70");
  assert.equal(TRANSITIONS_70_RESOURCE.source.sourceVersion, "7K-2026-08-v2");

  const content = JSON.stringify(
    TRANSITIONS_70.map(
      ({ task_id, element_id, from_score, to_score, current_state, task, done_when, version }) => ({
        task_id,
        element_id,
        from_score,
        to_score,
        current_state,
        task,
        done_when,
        version,
      }),
    ),
  );
  assert.equal(
    createHash("sha256").update(content).digest("hex"),
    TRANSITIONS_70_RESOURCE.source.contentSha256,
  );
});

test("transition registry rejects duplicate task IDs", () => {
  const duplicate = [...TRANSITIONS_70, { ...TRANSITIONS_70[0] }];
  assert.throws(
    () => validateTransitionRegistry(duplicate),
    (error: unknown) =>
      error instanceof SevenKValidationError &&
      error.issues.some((issue) => issue.code === "duplicate_task_id"),
  );
});

test("transition registry rejects a missing task_id", () => {
  const missingTaskId = TRANSITIONS_70.map((transition, index) =>
    index === 0 ? { ...transition, task_id: "" } : transition,
  );
  assert.throws(
    () => validateTransitionRegistry(missingTaskId),
    (error: unknown) =>
      error instanceof SevenKValidationError &&
      error.issues.some((issue) => issue.code === "missing_task_id"),
  );
});

test("resolves audience 2→5 and full 0→10 only through matrix tasks", () => {
  const audience = resolveTransitionSequence([
    { element_id: "audience", from_score: 2, to_score: 5 },
  ]);
  assert.deepEqual(
    audience.tasks.map((item) => item.task_id),
    ["audience_2_3", "audience_3_4", "audience_4_5"],
  );

  const full = resolveTransitionSequence([
    { element_id: "authenticity", from_score: 0, to_score: 10 },
  ]);
  assert.equal(full.tasks.length, 10);
  assert.equal(full.tasks[0].task_id, "authenticity_0_1");
  assert.equal(full.tasks[9].task_id, "authenticity_9_10");
});

test("transition resolver rejects a non-existent score", () => {
  assert.throws(
    () =>
      resolveTransitionSequence([
        { element_id: "audience", from_score: 2, to_score: 11 },
      ]),
    (error: unknown) =>
      error instanceof SevenKValidationError &&
      error.issues.some((issue) => issue.code === "invalid_score"),
  );
});

test("maps every archetype range boundary exactly", () => {
  const boundaries = [
    [0, "altruist"], [10, "altruist"],
    [11, "explorer"], [20, "explorer"],
    [21, "creator"], [30, "creator"],
    [31, "hero"], [43, "hero"],
    [44, "magician"], [55, "magician"],
    [56, "ruler"], [70, "ruler"],
  ] as const;
  for (const [total, expected] of boundaries) {
    assert.equal(getCandidateArchetypeByTotal(total), expected);
  }
});

test("downgrades Hero, Magician and Ruler to the nearest confirmed gate", () => {
  const hero = calculateBusinessArchetype(
    scores({ authenticity: 10, audience: 10, product_method: 3, sales_technology: 4, funnel: 3, blog: 5 }),
  );
  assert.equal(hero.candidateArchetype, "hero");
  assert.equal(hero.finalArchetype, "creator");
  assert.equal(hero.gates.hero.passed, false);

  const magician = calculateBusinessArchetype(
    scores({ authenticity: 8, audience: 8, product_method: 5, sales_technology: 6, funnel: 6, blog: 8, team: 4 }),
  );
  assert.equal(magician.candidateArchetype, "magician");
  assert.equal(magician.finalArchetype, "hero");
  assert.equal(magician.gates.magician.passed, false);
  assert.equal(magician.gates.hero.passed, true);

  const ruler = calculateBusinessArchetype(
    scores({ authenticity: 10, audience: 10, product_method: 7, sales_technology: 8, funnel: 8, blog: 10, team: 7 }),
  );
  assert.equal(ruler.candidateArchetype, "ruler");
  assert.equal(ruler.finalArchetype, "magician");
  assert.equal(ruler.gates.ruler.passed, false);
  assert.equal(ruler.gates.magician.passed, true);
  assert.ok(ruler.downgradeReason);
});

test("target configuration never lowers a mature current element", () => {
  const currentScores = scores({
    authenticity: 9,
    audience: 8,
    product_method: 7,
    sales_technology: 8,
    funnel: 7,
    blog: 9,
    team: 6,
  });
  const result = calculateTargetConfiguration({
    currentScores,
    modelFamily: "single_service",
    desiredSystemWeeklyHours: null,
  });
  for (const elementId of SEVEN_K_ELEMENT_IDS) {
    assert.ok(result.targetScores[elementId] >= currentScores[elementId]);
    assert.equal(result.gap[elementId], result.targetScores[elementId] - currentScores[elementId]);
  }
});

test("applies capability and delegation floors exactly", () => {
  const result = calculateTargetConfiguration({
    currentScores: scores(),
    modelFamily: "single_service",
    activatedCapabilities: ["delegated_sales"],
    targetDelegation: ["delegate_individual_sales"],
    desiredSystemWeeklyHours: null,
  });
  assert.equal(CAPABILITY_FLOORS.delegated_sales.floor, 9);
  assert.equal(result.requiredMinimum.sales_technology, 9);
  assert.equal(result.requiredMinimum.team, 5);
});

test("hybrid model combines profiles and multiple capability floors by max", () => {
  const result = calculateTargetConfiguration({
    currentScores: scores(),
    modelFamily: "hybrid",
    hybridComponents: ["autoproduct", "agency"],
    activatedCapabilities: ["team_managed_acquisition", "media_system"],
    targetModifiers: ["team_finds_qualifies_audience"],
    desiredSystemWeeklyHours: null,
  });
  assert.equal(result.requiredMinimum.authenticity, 5);
  assert.equal(result.requiredMinimum.audience, 10);
  assert.equal(result.requiredMinimum.product_method, 8);
  assert.equal(result.requiredMinimum.sales_technology, 7);
  assert.equal(result.requiredMinimum.funnel, 10);
  assert.equal(result.requiredMinimum.blog, 10);
  assert.equal(result.requiredMinimum.team, 8);
});

test("target calculator rejects an unknown model, capability and incomplete hybrid", () => {
  assert.throws(
    () =>
      calculateTargetConfiguration({
        currentScores: scores(),
        modelFamily: "unknown_model" as never,
        desiredSystemWeeklyHours: null,
      }),
    SevenKValidationError,
  );
  assert.throws(
    () =>
      calculateTargetConfiguration({
        currentScores: scores(),
        modelFamily: "single_service",
        activatedCapabilities: ["unknown_capability" as never],
        desiredSystemWeeklyHours: null,
      }),
    SevenKValidationError,
  );
  assert.throws(
    () =>
      calculateTargetConfiguration({
        currentScores: scores(),
        modelFamily: "hybrid",
        hybridComponents: ["agency"],
        desiredSystemWeeklyHours: null,
      }),
    SevenKValidationError,
  );
});

test("desiredSystemWeeklyHours is optional for rules and never creates a score floor", () => {
  const baseInput = {
    currentScores: scores(),
    modelFamily: "package_1to1" as const,
    currentWeeklyHours: 40,
  };
  const withoutGoal = calculateTargetConfiguration({
    ...baseInput,
    desiredSystemWeeklyHours: null,
  });
  const withGoal = calculateTargetConfiguration({
    ...baseInput,
    desiredSystemWeeklyHours: 12,
  });
  assert.deepEqual(withGoal.requiredMinimum, withoutGoal.requiredMinimum);
  assert.deepEqual(withGoal.targetScores, withoutGoal.targetScores);
  assert.equal(withoutGoal.modelFitWarnings.length, 0);
  assert.ok(
    withGoal.modelFitWarnings.some(
      (warning) => warning.code === "PERSONAL_MODEL_TIME_FREEDOM_CONFLICT",
    ),
  );
});

test("Money Now applies stop rules and never selects a stopped scenario", () => {
  const result = selectMoneyNowCandidate({
    signals: {
      has_current_clients: true,
      has_logical_continuation: true,
      current_result_confirmed: false,
      continuation_objectively_needed: true,
    },
  });
  assert.equal(result.selectedScenarioId, null);
  assert.equal(result.status, "no_fit");
  assert.ok(
    result.excludedCandidates.some(
      (item) =>
        item.scenarioId === "MN01" &&
        item.reason === "stop_rule" &&
        item.codes.includes("CONTINUATION_RESULT_OR_NEED_NOT_CONFIRMED"),
    ),
  );
});

test("Money Now returns no_fit when no scenario is eligible", () => {
  const result = selectMoneyNowCandidate({ signals: {} });
  assert.equal(result.status, "no_fit");
  assert.equal(result.selectedScenarioId, null);
  assert.equal(result.rankedCandidates.length, 0);
});

test("Money Now ranking is lexicographic: proximity before proof, then proof within a tier", () => {
  const proximity = selectMoneyNowCandidate({
    signals: {
      has_warm_leads: true,
      refusal_reason_compatible: true,
      has_warm_network: true,
      clear_relevant_offer: true,
    },
    scenarioFacts: {
      MN05: { proofLevel: 1 },
      MN07: { proofLevel: 3 },
    },
  });
  assert.equal(proximity.selectedScenarioId, "MN05");

  const proof = selectMoneyNowCandidate({
    signals: {
      has_current_clients: true,
      has_logical_continuation: true,
      current_result_confirmed: true,
      continuation_objectively_needed: true,
      has_next_product_or_additional_task: true,
      next_offer_relevant: true,
    },
    scenarioFacts: {
      MN01: { proofLevel: 1 },
      MN02: { proofLevel: 3 },
    },
  });
  assert.equal(proof.selectedScenarioId, "MN02");
});

test("Money Now history guard blocks repetition without a new material condition", () => {
  const input = {
    signals: { has_warm_leads: true, refusal_reason_compatible: true },
    previousAttempts: [
      { historyKey: "follow_up_warm_leads", sustainableResult: false },
    ],
  } as const;
  const blocked = selectMoneyNowCandidate(input);
  assert.equal(blocked.status, "no_fit");
  assert.ok(
    blocked.excludedCandidates.some(
      (item) => item.scenarioId === "MN05" && item.reason === "history_guard",
    ),
  );

  const allowed = selectMoneyNowCandidate({
    ...input,
    scenarioFacts: {
      MN05: {
        proofLevel: 2,
        newMaterialCondition: "Теперь есть квалификация и уточнённый оффер.",
      },
    },
  });
  assert.equal(allowed.selectedScenarioId, "MN05");
});

test("Money Now blocks model/capacity no-fit candidates", () => {
  const result = selectMoneyNowCandidate({
    signals: {
      has_warm_leads: true,
      refusal_reason_compatible: true,
      owner_or_team_overloaded: true,
    },
    scenarioFacts: { MN05: { proofLevel: 3, modelFit: false } },
  });
  assert.equal(result.status, "no_fit");
  assert.ok(
    result.excludedCandidates.some(
      (item) => item.scenarioId === "MN05" && item.reason === "capacity_or_model_fit",
    ),
  );
});

test("all Stage 2 pure functions are deterministic for identical input", () => {
  const targetInput = {
    currentScores: scores({ authenticity: 4, audience: 3 }),
    modelFamily: "group_live" as const,
    activatedCapabilities: ["author_method", "content_system"] as const,
    desiredSystemWeeklyHours: null,
  };
  assert.deepEqual(
    calculateTargetConfiguration(targetInput),
    calculateTargetConfiguration(targetInput),
  );

  const archetypeInput = scores({
    authenticity: 6,
    audience: 6,
    product_method: 6,
    sales_technology: 6,
    funnel: 6,
    blog: 6,
    team: 4,
  });
  assert.deepEqual(
    calculateBusinessArchetype(archetypeInput),
    calculateBusinessArchetype(archetypeInput),
  );

  const transitionInput = [{ element_id: "team", from_score: 1, to_score: 4 }] as const;
  assert.deepEqual(
    resolveTransitionSequence(transitionInput),
    resolveTransitionSequence(transitionInput),
  );

  const moneyInput = {
    signals: { has_warm_network: true, clear_relevant_offer: true },
    scenarioFacts: { MN07: { proofLevel: 2 as const } },
  };
  assert.deepEqual(selectMoneyNowCandidate(moneyInput), selectMoneyNowCandidate(moneyInput));
});
