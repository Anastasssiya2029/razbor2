import {
  calculateBusinessArchetype,
  calculateTargetConfiguration,
  getSevenKResourceVersions,
  validateSevenKScores,
} from "@/server/7k";
import {
  BASE_MODEL_FAMILIES,
  BASE_MODEL_PROFILES,
  CAPABILITY_FLOORS,
  OWNER_ROLE_MODIFIER,
  TARGET_MODIFIER_FLOORS,
  type BaseModelFamily,
  type CapabilityCode,
  type DesiredOwnerRole,
  type ModelFamily,
  type TargetModifierCode,
} from "@/server/7k/config/target-rules.v2.2";
import { SEVEN_K_ELEMENT_IDS, type SevenKScores } from "@/server/7k/types";
import { getTargetArchetypeResourceVersions } from "@/server/7k/methodology-registry";
import { validateP01Invariants, validateP01Schema } from "@/server/p01/validation";
import { Stage4Error } from "./errors";
import type {
  Stage4Source,
  TargetArchetypeComputation,
  TargetArchetypeResourceVersions,
  TargetInputAudit,
} from "./types";

const CAPABILITY_CODES = new Set<string>(Object.keys(CAPABILITY_FLOORS));
const TARGET_MODIFIER_CODES = new Set<string>(Object.keys(TARGET_MODIFIER_FLOORS));
const BASE_MODELS = new Set<string>(BASE_MODEL_FAMILIES);

const ROLE_BY_MODIFIER = new Map<string, DesiredOwnerRole>(
  Object.entries(OWNER_ROLE_MODIFIER)
    .filter((entry): entry is [DesiredOwnerRole, TargetModifierCode] => entry[1] !== null)
    .map(([role, modifier]) => [modifier, role]),
);

function extractCurrentScores(source: Stage4Source): SevenKScores {
  const current7k = source.p01Result?.current7k;
  if (!current7k) {
    throw new Stage4Error(
      "STAGE4_P01_RESULT_MISSING",
      "Persisted validated P-01 result is required.",
      "upstream_blocked",
    );
  }
  const scores = {
    authenticity: current7k.authenticity.score,
    audience: current7k.audience.score,
    product_method: current7k.product_method.score,
    sales_technology: current7k.sales_technology.score,
    funnel: current7k.funnel.score,
    blog: current7k.blog.score,
    team: current7k.team.score,
  };
  const missing = SEVEN_K_ELEMENT_IDS.filter((elementId) => !Number.isInteger(scores[elementId]));
  if (missing.length > 0) {
    throw new Stage4Error(
      "STAGE4_CURRENT_SCORES_INCOMPLETE",
      `P-01 current scores are incomplete: ${missing.join(", ")}.`,
      "upstream_blocked",
      { missing },
    );
  }
  return validateSevenKScores(scores as SevenKScores, "/p01/current7k");
}

function resolveModel(
  source: Stage4Source,
): { modelFamily: ModelFamily; hybridComponents: BaseModelFamily[] } {
  const target = source.p01Result?.targetIntent;
  const modelFamily = target?.normalizedModelFamily;
  if (!modelFamily) {
    throw new Stage4Error(
      "STAGE4_TARGET_MODEL_MISSING",
      "P-01 did not normalize target model family.",
      "upstream_blocked",
    );
  }
  if (modelFamily !== "hybrid") {
    if (target.primaryModelFamily !== null && target.primaryModelFamily !== modelFamily) {
      throw new Stage4Error(
        "STAGE4_TARGET_MODEL_INCONSISTENT",
        "P-01 normalized and primary model families contradict each other.",
        "validation",
      );
    }
    return { modelFamily, hybridComponents: [] };
  }
  const components = [target.primaryModelFamily, ...target.secondaryModelFamilies].filter(
    (value): value is BaseModelFamily => value !== null && BASE_MODELS.has(value),
  );
  return { modelFamily, hybridComponents: [...new Set(components)] };
}

function resolveNearTermModel(
  vision: { modelFamily: ModelFamily; hybridComponents: BaseModelFamily[] },
  currentScores: SevenKScores,
): {
  modelFamily: ModelFamily;
  hybridComponents: BaseModelFamily[];
  modelTransitionNote: string | null;
} {
  if (vision.modelFamily === "hybrid") {
    return { ...vision, modelTransitionNote: null };
  }

  const productScore = currentScores.product_method;
  const packageFirstModels = new Set<ModelFamily>([
    "group_live",
    "membership",
    "autoproduct",
    "retreat_event",
    "school_licensing",
    "product_company",
  ]);
  if (packageFirstModels.has(vision.modelFamily) && productScore < 5) {
    return {
      modelFamily: "package_1to1",
      hybridComponents: [],
      modelTransitionNote:
        "Выбранная модель требует более зрелой продуктовой системы. Ближайшая конфигурация показывает первый обязательный этап: собрать, продать и подтвердить результат флагманского продукта, а затем переводить его в более автономный формат.",
    };
  }

  return { ...vision, modelTransitionNote: null };
}

function splitTargetCodes(source: Stage4Source): {
  capabilities: CapabilityCode[];
  modifiers: TargetModifierCode[];
} {
  const capabilities: CapabilityCode[] = [];
  const modifiers: TargetModifierCode[] = [];
  for (const item of source.p01Result?.targetIntent.activatedCapabilities ?? []) {
    const isCapability = CAPABILITY_CODES.has(item.code);
    const isModifier = TARGET_MODIFIER_CODES.has(item.code);
    if (isCapability === isModifier) {
      throw new Stage4Error(
        "STAGE4_UNKNOWN_OR_AMBIGUOUS_TARGET_CODE",
        `Target code ${item.code} is unknown or ambiguous.`,
        "validation",
        { code: item.code },
      );
    }
    if (isCapability) capabilities.push(item.code as CapabilityCode);
    if (isModifier) modifiers.push(item.code as TargetModifierCode);
  }
  return {
    capabilities: [...new Set(capabilities)],
    modifiers: [...new Set(modifiers)],
  };
}

function keepCapabilitiesForNearTermModel(
  capabilities: readonly CapabilityCode[],
  nearTermModel: ModelFamily,
  visionModel: ModelFamily,
): CapabilityCode[] {
  if (nearTermModel === visionModel || nearTermModel === "hybrid") {
    return [...capabilities];
  }

  const nearTermProfile = BASE_MODEL_PROFILES[nearTermModel];
  return capabilities.filter((code) => {
    const capability = CAPABILITY_FLOORS[code];
    return capability.floor <= nearTermProfile[capability.elementId];
  });
}

function deriveDesiredOwnerRole(modifiers: readonly TargetModifierCode[]): {
  role: DesiredOwnerRole | null;
  derivedFrom: string | null;
} {
  const matches = modifiers
    .map((modifier) => ({ modifier, role: ROLE_BY_MODIFIER.get(modifier) ?? null }))
    .filter((match): match is { modifier: TargetModifierCode; role: DesiredOwnerRole } =>
      match.role !== null,
    );
  const uniqueRoles = [...new Set(matches.map((match) => match.role))];
  if (uniqueRoles.length > 1) {
    throw new Stage4Error(
      "STAGE4_CONFLICTING_OWNER_ROLES",
      "P-01 activated target modifiers imply conflicting desired owner roles.",
      "validation",
      { matches },
    );
  }
  return {
    role: uniqueRoles[0] ?? null,
    derivedFrom: uniqueRoles.length === 1 ? matches.find((match) => match.role === uniqueRoles[0])!.modifier : null,
  };
}

function assertP01Ready(source: Stage4Source): void {
  if (source.p01PromptVersion !== "P-01.v1.4.2" || source.p01OutputSchemaVersion !== "1.4") {
    throw new Stage4Error(
      "STAGE4_UNSUPPORTED_P01_VERSION",
      "Stage 4 supports only persisted P-01.v1.4.2 / output schema 1.4.",
      "upstream_blocked",
      {
        promptVersion: source.p01PromptVersion,
        outputSchemaVersion: source.p01OutputSchemaVersion,
      },
    );
  }
  if (!source.p01Result) {
    throw new Stage4Error(
      "STAGE4_P01_RESULT_MISSING",
      source.p01FailureMessage ?? "Persisted P-01 result is missing.",
      "upstream_blocked",
      { upstreamFailureCode: source.p01FailureCode },
    );
  }
  try {
    validateP01Invariants(validateP01Schema(source.p01Result));
  } catch (error) {
    throw new Stage4Error(
      "STAGE4_P01_INVALID",
      error instanceof Error ? error.message : "Persisted P-01 result is invalid.",
      "validation",
    );
  }
  if (source.p01Result.analysisStatus !== "ok" && source.p01Result.analysisStatus !== "low_confidence") {
    throw new Stage4Error(
      "STAGE4_P01_BLOCKED",
      `P-01 analysisStatus=${source.p01Result.analysisStatus}; Target/Archetype calculation is forbidden.`,
      "upstream_blocked",
      { analysisStatus: source.p01Result.analysisStatus },
    );
  }
}

function resourceVersions(): TargetArchetypeResourceVersions {
  const allVersions = getSevenKResourceVersions();
  const stageVersions = getTargetArchetypeResourceVersions();
  return {
    ...stageVersions,
    elements: allVersions.elements,
    targetRules: allVersions.targetRules,
    archetypes: allVersions.archetypes,
  } as TargetArchetypeResourceVersions;
}

export function mapP01ToTargetConfigurationInput(source: Stage4Source): {
  currentScores: SevenKScores;
  targetInput: TargetArchetypeComputation["targetInput"];
  audit: TargetInputAudit;
} {
  assertP01Ready(source);
  const currentScores = extractCurrentScores(source);
  const visionModel = resolveModel(source);
  const { modelFamily, hybridComponents, modelTransitionNote } = resolveNearTermModel(
    visionModel,
    currentScores,
  );
  const targetCodes = splitTargetCodes(source);
  const capabilities = keepCapabilitiesForNearTermModel(
    targetCodes.capabilities,
    modelFamily,
    visionModel.modelFamily,
  );
  const { modifiers } = targetCodes;
  const ownerRole = deriveDesiredOwnerRole(modifiers);
  const targetInput: TargetArchetypeComputation["targetInput"] = {
    currentScores,
    modelFamily,
    ...(modelFamily === "hybrid" ? { hybridComponents } : {}),
    visionModelFamily: visionModel.modelFamily,
    visionModelComponents:
      visionModel.modelFamily === "hybrid"
        ? visionModel.hybridComponents
        : [visionModel.modelFamily],
    modelTransitionNote,
    activatedCapabilities: capabilities,
    targetModifiers: modifiers,
    desiredOwnerRole: ownerRole.role,
    currentWeeklyHours: source.normalizedInput.current.weeklyHours,
    desiredSystemWeeklyHours: source.p01Result!.targetIntent.desiredSystemWeeklyHours,
    estimatedTargetWeeklyHours: null,
  };
  return {
    currentScores,
    targetInput,
    audit: {
      currentScoresSource: "p01.current7k",
      modelSource: "p01.targetIntent",
      capabilitiesSource: "p01.targetIntent.activatedCapabilities",
      desiredHoursSource: "p01.targetIntent.desiredSystemWeeklyHours",
      currentHoursSource: "diagnostic.current.weeklyHours",
      capabilityCodes: capabilities,
      targetModifierCodes: modifiers,
      desiredOwnerRole: ownerRole.role,
      desiredOwnerRoleDerivedFrom: ownerRole.derivedFrom,
    },
  };
}

export function computeTargetAndArchetype(source: Stage4Source): TargetArchetypeComputation {
  const mapped = mapP01ToTargetConfigurationInput(source);
  const target = calculateTargetConfiguration(mapped.targetInput);
  const archetype = calculateBusinessArchetype(mapped.currentScores);
  return {
    currentScores: mapped.currentScores,
    targetInput: mapped.targetInput,
    targetInputAudit: mapped.audit,
    target,
    archetype,
    resourceVersions: resourceVersions(),
  };
}
