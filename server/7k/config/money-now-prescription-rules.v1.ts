import rawPrescriptionRules from "./money-now-prescription-rules.v1.json";
import type { MoneyNowScenarioId } from "./money-now.v2.2";
import { MONEY_NOW_SCENARIO_IDS } from "./money-now.v2.2";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId } from "../types";

export const MONEY_NOW_PRESCRIPTION_RULES_VERSION =
  "money-now-prescription-rules.v1" as const;
export const MONEY_NOW_PRESCRIPTION_METHODOLOGY_VERSION = "money-now.v2.3" as const;

export type MoneyNowPrescriptionCauseCode = keyof typeof rawPrescriptionRules.causeCodes;
export type MoneyNowInterventionCode = keyof typeof rawPrescriptionRules.interventions;

export type MoneyNowCauseDefinition = {
  title: string;
  definition: string;
  defaultElements: SevenKElementId[];
};

export type MoneyNowInterventionDefinition = {
  title: string;
  description: string;
  supportingElements: SevenKElementId[];
  historyMatchTags: string[];
};

export type MoneyNowScenarioPrescriptionRule = {
  causePrecedence: MoneyNowPrescriptionCauseCode[];
  allowedPrimaryCauses: MoneyNowPrescriptionCauseCode[];
  allowedContributingCauses: MoneyNowPrescriptionCauseCode[];
  anchorAnyOf: MoneyNowInterventionCode[];
};

export type MoneyNowPrescriptionRegistry = {
  version: typeof MONEY_NOW_PRESCRIPTION_RULES_VERSION;
  businessMethodologyVersion: typeof MONEY_NOW_PRESCRIPTION_METHODOLOGY_VERSION;
  causeCodes: Record<MoneyNowPrescriptionCauseCode, MoneyNowCauseDefinition>;
  interventions: Record<MoneyNowInterventionCode, MoneyNowInterventionDefinition>;
  scenarioRules: Record<MoneyNowScenarioId, MoneyNowScenarioPrescriptionRule>;
  scenarioCauseInterventions: Record<
    MoneyNowScenarioId,
    Partial<Record<MoneyNowPrescriptionCauseCode, MoneyNowInterventionCode[]>>
  >;
  selectionRules: {
    primaryCause: string;
    contributingCauses: string;
    precedence: string;
    interventions: string;
    anchor: string;
    maxInterventions: number;
  };
  supportingElementsRule: string;
  historyGuard: {
    interventionMatch: string;
    repeatWithoutNewCondition: string;
  };
  changeFromV2_2: string;
};

export const MONEY_NOW_PRESCRIPTION_REGISTRY =
  rawPrescriptionRules as unknown as MoneyNowPrescriptionRegistry;

export const MONEY_NOW_PRESCRIPTION_CAUSE_CODES = Object.freeze(
  Object.keys(MONEY_NOW_PRESCRIPTION_REGISTRY.causeCodes) as MoneyNowPrescriptionCauseCode[],
);

function selectableInterventionCodes(): MoneyNowInterventionCode[] {
  const codes = MONEY_NOW_SCENARIO_IDS.flatMap((scenarioId) =>
    Object.values(MONEY_NOW_PRESCRIPTION_REGISTRY.scenarioCauseInterventions[scenarioId])
      .flatMap((values) => values ?? []),
  );
  return [...new Set(codes)].sort((left, right) => left.localeCompare(right, "en"));
}

/**
 * Canonical intervention codes reachable by a scenario+cause rule.
 * The source JSON also keeps INT_FREE_CAPACITY as a reserved definition, but it
 * is intentionally not selectable by P-03 because no scenario matrix allows it.
 */
export const MONEY_NOW_SELECTABLE_INTERVENTION_CODES = Object.freeze(
  selectableInterventionCodes(),
);

export const MONEY_NOW_RESERVED_INTERVENTION_CODES = Object.freeze(
  (Object.keys(MONEY_NOW_PRESCRIPTION_REGISTRY.interventions) as MoneyNowInterventionCode[])
    .filter((code) => !MONEY_NOW_SELECTABLE_INTERVENTION_CODES.includes(code)),
);

export const MONEY_NOW_HISTORY_MATCH_TAGS = Object.freeze(
  [...new Set(
    MONEY_NOW_SELECTABLE_INTERVENTION_CODES.flatMap(
      (code) => MONEY_NOW_PRESCRIPTION_REGISTRY.interventions[code].historyMatchTags,
    ),
  )].sort((left, right) => left.localeCompare(right, "en")),
);

export type MoneyNowPrescriptionIntegrity = {
  causeCount: number;
  selectableInterventionCount: number;
  interventionDefinitionCount: number;
  reservedInterventionCodes: MoneyNowInterventionCode[];
  scenarioCount: number;
  matrixEntryCount: number;
  maxInterventions: number;
};

export function assertMoneyNowPrescriptionRegistryIntegrity(): MoneyNowPrescriptionIntegrity {
  const registry = MONEY_NOW_PRESCRIPTION_REGISTRY;
  if (registry.version !== MONEY_NOW_PRESCRIPTION_RULES_VERSION) {
    throw new Error(`Prescription registry version mismatch: ${registry.version}`);
  }
  if (registry.businessMethodologyVersion !== MONEY_NOW_PRESCRIPTION_METHODOLOGY_VERSION) {
    throw new Error(`Prescription methodology version mismatch: ${registry.businessMethodologyVersion}`);
  }
  const causeCodes = new Set(MONEY_NOW_PRESCRIPTION_CAUSE_CODES);
  const interventionCodes = new Set(
    Object.keys(registry.interventions) as MoneyNowInterventionCode[],
  );
  const elementCodes = new Set<string>(SEVEN_K_ELEMENT_IDS);
  let matrixEntryCount = 0;

  for (const scenarioId of MONEY_NOW_SCENARIO_IDS) {
    const rule = registry.scenarioRules[scenarioId];
    const matrix = registry.scenarioCauseInterventions[scenarioId];
    if (!rule || !matrix) throw new Error(`Missing prescription rule/matrix for ${scenarioId}`);
    for (const causeCode of [
      ...rule.causePrecedence,
      ...rule.allowedPrimaryCauses,
      ...rule.allowedContributingCauses,
    ]) {
      if (!causeCodes.has(causeCode)) throw new Error(`${scenarioId} references unknown cause ${causeCode}`);
    }
    for (const causeCode of rule.allowedPrimaryCauses) {
      if (!matrix[causeCode]?.length) {
        throw new Error(`${scenarioId}/${causeCode} has no intervention matrix entry`);
      }
    }
    for (const anchor of rule.anchorAnyOf) {
      if (!interventionCodes.has(anchor)) throw new Error(`${scenarioId} references unknown anchor ${anchor}`);
    }
    for (const [causeCode, codes] of Object.entries(matrix)) {
      matrixEntryCount += 1;
      if (!causeCodes.has(causeCode as MoneyNowPrescriptionCauseCode)) {
        throw new Error(`${scenarioId} matrix references unknown cause ${causeCode}`);
      }
      for (const interventionCode of codes ?? []) {
        if (!interventionCodes.has(interventionCode)) {
          throw new Error(`${scenarioId}/${causeCode} references unknown intervention ${interventionCode}`);
        }
      }
    }
  }

  for (const [code, definition] of Object.entries(registry.interventions)) {
    if (definition.historyMatchTags.length === 0) throw new Error(`${code} has no history tags`);
    if (definition.supportingElements.some((elementId) => !elementCodes.has(elementId))) {
      throw new Error(`${code} references an unknown 7K element`);
    }
  }
  if (registry.selectionRules.maxInterventions !== 4) {
    throw new Error("Prescription maxInterventions must equal 4");
  }
  if (MONEY_NOW_PRESCRIPTION_CAUSE_CODES.length !== 15) {
    throw new Error(`Expected 15 cause codes, got ${MONEY_NOW_PRESCRIPTION_CAUSE_CODES.length}`);
  }
  if (MONEY_NOW_SELECTABLE_INTERVENTION_CODES.length !== 21) {
    throw new Error(`Expected 21 selectable intervention codes, got ${MONEY_NOW_SELECTABLE_INTERVENTION_CODES.length}`);
  }
  if (Object.keys(registry.scenarioRules).length !== 16) {
    throw new Error(`Expected 16 scenario rules, got ${Object.keys(registry.scenarioRules).length}`);
  }
  return {
    causeCount: MONEY_NOW_PRESCRIPTION_CAUSE_CODES.length,
    selectableInterventionCount: MONEY_NOW_SELECTABLE_INTERVENTION_CODES.length,
    interventionDefinitionCount: interventionCodes.size,
    reservedInterventionCodes: [...MONEY_NOW_RESERVED_INTERVENTION_CODES],
    scenarioCount: MONEY_NOW_SCENARIO_IDS.length,
    matrixEntryCount,
    maxInterventions: registry.selectionRules.maxInterventions,
  };
}

export function getMoneyNowScenarioPrescriptionRule(
  scenarioId: MoneyNowScenarioId,
): MoneyNowScenarioPrescriptionRule {
  return MONEY_NOW_PRESCRIPTION_REGISTRY.scenarioRules[scenarioId];
}

export function allowedInterventionsForCauses(
  scenarioId: MoneyNowScenarioId,
  primaryCause: MoneyNowPrescriptionCauseCode,
  contributingCauses: readonly MoneyNowPrescriptionCauseCode[] = [],
): {
  primary: MoneyNowInterventionCode[];
  all: MoneyNowInterventionCode[];
} {
  const matrix = MONEY_NOW_PRESCRIPTION_REGISTRY.scenarioCauseInterventions[scenarioId];
  const primary = [...(matrix[primaryCause] ?? [])];
  const all = [...new Set([
    ...primary,
    ...contributingCauses.flatMap((causeCode) => matrix[causeCode] ?? []),
  ])];
  return { primary, all };
}

export function derivePrescriptionSupportingElements(
  interventionCodes: readonly MoneyNowInterventionCode[],
): SevenKElementId[] {
  const selected = new Set(
    interventionCodes.flatMap(
      (code) => MONEY_NOW_PRESCRIPTION_REGISTRY.interventions[code].supportingElements,
    ),
  );
  return SEVEN_K_ELEMENT_IDS.filter((elementId) => selected.has(elementId));
}

export function assertKnownPrescriptionHistoryTags(tags: readonly string[]): void {
  const known = new Set<string>(MONEY_NOW_HISTORY_MATCH_TAGS);
  const unknown = tags.filter((tag) => !known.has(tag));
  if (unknown.length) throw new Error(`Unknown prescription history tag(s): ${unknown.join(", ")}`);
}

export function getP03PrescriptionRulesProjection(scenarioId: MoneyNowScenarioId) {
  const scenarioRule = getMoneyNowScenarioPrescriptionRule(scenarioId);
  const relevantCauses = new Set([
    ...scenarioRule.allowedPrimaryCauses,
    ...scenarioRule.allowedContributingCauses,
  ]);
  const matrix = MONEY_NOW_PRESCRIPTION_REGISTRY.scenarioCauseInterventions[scenarioId];
  const interventionCodes = [...new Set(Object.values(matrix).flatMap((codes) => codes ?? []))];
  return {
    version: MONEY_NOW_PRESCRIPTION_RULES_VERSION,
    businessMethodologyVersion: MONEY_NOW_PRESCRIPTION_METHODOLOGY_VERSION,
    selectionRules: MONEY_NOW_PRESCRIPTION_REGISTRY.selectionRules,
    historyGuard: MONEY_NOW_PRESCRIPTION_REGISTRY.historyGuard,
    scenarioRule: structuredClone(scenarioRule),
    causeCodes: Object.fromEntries(
      [...relevantCauses].map((code) => [code, MONEY_NOW_PRESCRIPTION_REGISTRY.causeCodes[code]]),
    ),
    scenarioCauseInterventions: structuredClone(matrix),
    interventionLibrary: Object.fromEntries(
      interventionCodes.map((code) => [code, MONEY_NOW_PRESCRIPTION_REGISTRY.interventions[code]]),
    ),
  };
}

export const MONEY_NOW_PRESCRIPTION_INTEGRITY =
  assertMoneyNowPrescriptionRegistryIntegrity();
