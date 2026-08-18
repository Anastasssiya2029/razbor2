import {
  BASE_MODEL_FAMILIES,
  BASE_MODEL_PROFILES,
  CAPABILITY_FLOORS,
  DESIRED_OWNER_ROLES,
  MODEL_FAMILIES,
  OWNER_ROLE_MODIFIER,
  PERSONAL_DELIVERY_MODEL_FAMILIES,
  TARGET_MODIFIER_FLOORS,
  TARGET_RULES_RESOURCE_VERSION,
  type BaseModelFamily,
  type CapabilityCode,
  type DesiredOwnerRole,
  type ModelFamily,
  type TargetDelegationCode,
  type TargetModifierCode,
} from "./config/target-rules.v2.1";
import {
  SEVEN_K_ELEMENT_IDS,
  SevenKValidationError,
  type SevenKElementId,
  type SevenKScores,
  type SevenKValidationIssue,
  validateSevenKScores,
  zeroSevenKScores,
} from "./types";

export type TargetConfigurationInput = {
  currentScores: SevenKScores;
  modelFamily: ModelFamily;
  hybridComponents?: readonly BaseModelFamily[];
  activatedCapabilities?: readonly CapabilityCode[];
  targetModifiers?: readonly TargetModifierCode[];
  targetDelegation?: readonly TargetDelegationCode[];
  desiredOwnerRole?: DesiredOwnerRole | null;
  currentWeeklyHours?: number | null;
  desiredSystemWeeklyHours: number | null;
  estimatedTargetWeeklyHours?: number | null;
};

export type TargetModelFitWarning = {
  code:
    | "CURRENT_CAPACITY_EXCEEDED"
    | "DESIRED_CAPACITY_EXCEEDED"
    | "PERSONAL_MODEL_TIME_FREEDOM_CONFLICT"
    | "AUTONOMOUS_ROLE_PERSONAL_MODEL_CONFLICT";
  message: string;
};

export type TargetConfigurationResult = {
  resourceVersion: typeof TARGET_RULES_RESOURCE_VERSION;
  modelFamily: ModelFamily;
  modelComponents: readonly BaseModelFamily[];
  capabilities: readonly CapabilityCode[];
  appliedModifiers: readonly TargetModifierCode[];
  desiredOwnerRole: DesiredOwnerRole | null;
  requiredMinimum: SevenKScores;
  targetScores: SevenKScores;
  gap: SevenKScores;
  requirementReasons: Record<SevenKElementId, string[]>;
  modelFitWarnings: TargetModelFitWarning[];
  validation: {
    valid: true;
    modelFamilyValid: true;
    capabilitiesValid: true;
  };
};

function isIn<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function validateOptionalHours(value: number | null | undefined, path: string): void {
  if (value == null) return;
  if (!Number.isFinite(value) || value < 0) {
    throw new SevenKValidationError([
      { path, code: "invalid_hours", message: "Ожидается неотрицательное конечное число или null." },
    ]);
  }
}

function resolveModelComponents(input: TargetConfigurationInput): BaseModelFamily[] {
  if (!isIn(MODEL_FAMILIES, input.modelFamily)) {
    throw new SevenKValidationError([
      { path: "/modelFamily", code: "unknown_model_family", message: "Неизвестный model_family." },
    ]);
  }
  if (input.modelFamily !== "hybrid") return [input.modelFamily];

  const components = [...new Set(input.hybridComponents ?? [])];
  const issues: SevenKValidationIssue[] = [];
  if (components.length < 2) {
    issues.push({
      path: "/hybridComponents",
      code: "invalid_hybrid",
      message: "Для hybrid нужны как минимум две разные базовые модели.",
    });
  }
  components.forEach((component, index) => {
    if (!isIn(BASE_MODEL_FAMILIES, component)) {
      issues.push({
        path: `/hybridComponents/${index}`,
        code: "unknown_model_family",
        message: "Hybrid может состоять только из базовых model_family.",
      });
    }
  });
  if (issues.length > 0) throw new SevenKValidationError(issues);
  return components as BaseModelFamily[];
}

function emptyReasons(): Record<SevenKElementId, string[]> {
  return {
    authenticity: [],
    audience: [],
    product_method: [],
    sales_technology: [],
    funnel: [],
    blog: [],
    team: [],
  };
}

function applyFloor(
  required: SevenKScores,
  reasons: Record<SevenKElementId, string[]>,
  elementId: SevenKElementId,
  floor: number,
  reason: string,
): void {
  if (floor > required[elementId]) required[elementId] = floor;
  if (!reasons[elementId].includes(reason)) reasons[elementId].push(reason);
}

function hasDelegationForPersonalDelivery(modifiers: ReadonlySet<TargetModifierCode>): boolean {
  return [
    "delegate_product_delivery",
    "delegate_individual_sales",
    "exit_sales_management",
    "manage_only_through_heads",
    "autonomous_business",
  ].some((modifier) => modifiers.has(modifier as TargetModifierCode));
}

export function calculateTargetConfiguration(
  input: TargetConfigurationInput,
): TargetConfigurationResult {
  validateSevenKScores(input.currentScores);
  validateOptionalHours(input.currentWeeklyHours, "/currentWeeklyHours");
  validateOptionalHours(input.desiredSystemWeeklyHours, "/desiredSystemWeeklyHours");
  validateOptionalHours(input.estimatedTargetWeeklyHours, "/estimatedTargetWeeklyHours");

  const modelComponents = resolveModelComponents(input);
  const capabilities = [...new Set(input.activatedCapabilities ?? [])];
  const unknownCapabilities = capabilities.filter(
    (capability) => !(capability in CAPABILITY_FLOORS),
  );
  if (unknownCapabilities.length > 0) {
    throw new SevenKValidationError(
      unknownCapabilities.map((capability, index) => ({
        path: `/activatedCapabilities/${index}`,
        code: "unknown_capability",
        message: `Неизвестная capability: ${String(capability)}.`,
      })),
    );
  }

  const desiredOwnerRole = input.desiredOwnerRole ?? null;
  if (desiredOwnerRole !== null && !isIn(DESIRED_OWNER_ROLES, desiredOwnerRole)) {
    throw new SevenKValidationError([
      { path: "/desiredOwnerRole", code: "unknown_owner_role", message: "Неизвестная роль владельца." },
    ]);
  }

  const modifiers = new Set<TargetModifierCode>([
    ...(input.targetModifiers ?? []),
    ...(input.targetDelegation ?? []),
  ]);
  const roleModifier = desiredOwnerRole === null ? null : OWNER_ROLE_MODIFIER[desiredOwnerRole];
  if (roleModifier) modifiers.add(roleModifier);
  const unknownModifiers = [...modifiers].filter(
    (modifier) => !(modifier in TARGET_MODIFIER_FLOORS),
  );
  if (unknownModifiers.length > 0) {
    throw new SevenKValidationError(
      unknownModifiers.map((modifier, index) => ({
        path: `/targetModifiers/${index}`,
        code: "unknown_target_modifier",
        message: `Неизвестный target modifier: ${String(modifier)}.`,
      })),
    );
  }

  const requiredMinimum = zeroSevenKScores();
  const requirementReasons = emptyReasons();

  for (const model of modelComponents) {
    for (const elementId of SEVEN_K_ELEMENT_IDS) {
      applyFloor(
        requiredMinimum,
        requirementReasons,
        elementId,
        BASE_MODEL_PROFILES[model][elementId],
        `base_profile:${model}`,
      );
    }
  }

  for (const capability of capabilities) {
    const definition = CAPABILITY_FLOORS[capability];
    applyFloor(
      requiredMinimum,
      requirementReasons,
      definition.elementId,
      definition.floor,
      `capability:${capability}`,
    );
  }

  for (const modifier of modifiers) {
    const definition = TARGET_MODIFIER_FLOORS[modifier];
    for (const elementId of SEVEN_K_ELEMENT_IDS) {
      const floor = definition.floors[elementId];
      if (floor !== undefined) {
        applyFloor(
          requiredMinimum,
          requirementReasons,
          elementId,
          floor,
          `target_modifier:${modifier}`,
        );
      }
    }
  }

  const targetScores = zeroSevenKScores();
  const gap = zeroSevenKScores();
  for (const elementId of SEVEN_K_ELEMENT_IDS) {
    targetScores[elementId] = Math.max(input.currentScores[elementId], requiredMinimum[elementId]);
    gap[elementId] = Math.max(0, targetScores[elementId] - input.currentScores[elementId]);
  }

  const modelFitWarnings: TargetModelFitWarning[] = [];
  if (
    input.currentWeeklyHours != null &&
    input.estimatedTargetWeeklyHours != null &&
    input.estimatedTargetWeeklyHours > input.currentWeeklyHours
  ) {
    modelFitWarnings.push({
      code: "CURRENT_CAPACITY_EXCEEDED",
      message: `Оценочная нагрузка целевой модели (${input.estimatedTargetWeeklyHours} ч/нед.) превышает текущую ёмкость владельца (${input.currentWeeklyHours} ч/нед.).`,
    });
  }
  if (
    input.desiredSystemWeeklyHours != null &&
    input.estimatedTargetWeeklyHours != null &&
    input.estimatedTargetWeeklyHours > input.desiredSystemWeeklyHours
  ) {
    modelFitWarnings.push({
      code: "DESIRED_CAPACITY_EXCEEDED",
      message: `Оценочная нагрузка целевой модели (${input.estimatedTargetWeeklyHours} ч/нед.) не помещается в желаемые ${input.desiredSystemWeeklyHours} ч/нед.`,
    });
  }

  const hasPersonalDeliveryModel = modelComponents.some((model) =>
    (PERSONAL_DELIVERY_MODEL_FAMILIES as readonly BaseModelFamily[]).includes(model),
  );
  if (
    input.desiredSystemWeeklyHours != null &&
    input.currentWeeklyHours != null &&
    input.desiredSystemWeeklyHours < input.currentWeeklyHours &&
    hasPersonalDeliveryModel &&
    !hasDelegationForPersonalDelivery(modifiers)
  ) {
    modelFitWarnings.push({
      code: "PERSONAL_MODEL_TIME_FREEDOM_CONFLICT",
      message: "Цель по сокращению личного участия конфликтует с персональной delivery-моделью без явной стандартизации, автоматизации или делегирования.",
    });
  }
  if (desiredOwnerRole === "autonomous_owner" && hasPersonalDeliveryModel) {
    modelFitWarnings.push({
      code: "AUTONOMOUS_ROLE_PERSONAL_MODEL_CONFLICT",
      message: "Роль автономного владельца конфликтует с моделью, в которой результат по умолчанию создаётся личным участием эксперта; требуется смена delivery_mode.",
    });
  }

  return {
    resourceVersion: TARGET_RULES_RESOURCE_VERSION,
    modelFamily: input.modelFamily,
    modelComponents,
    capabilities,
    appliedModifiers: [...modifiers],
    desiredOwnerRole,
    requiredMinimum,
    targetScores,
    gap,
    requirementReasons,
    modelFitWarnings,
    validation: {
      valid: true,
      modelFamilyValid: true,
      capabilitiesValid: true,
    },
  };
}
