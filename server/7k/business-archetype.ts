import {
  ARCHETYPES_RESOURCE_VERSION,
  BUSINESS_ARCHETYPES,
  BUSINESS_ARCHETYPE_BY_ID,
  type ArchetypeGateRequirement,
  type BusinessArchetypeId,
} from "./config/archetypes.v2";
import { SEVEN_K_ELEMENT_IDS, type SevenKScores, validateSevenKScores } from "./types";

export type ArchetypeGateCheck = {
  archetypeId: "hero" | "magician" | "ruler";
  passed: boolean;
  requirements: Array<
    ArchetypeGateRequirement & {
      actualScore: number;
      passed: boolean;
    }
  >;
};

export type BusinessArchetypeResult = {
  resourceVersion: typeof ARCHETYPES_RESOURCE_VERSION;
  totalScore: number;
  candidateArchetype: BusinessArchetypeId;
  finalArchetype: BusinessArchetypeId;
  gates: Record<"hero" | "magician" | "ruler", ArchetypeGateCheck>;
  downgradeReason: string | null;
};

type GatedArchetypeId = "hero" | "magician" | "ruler";
const FALLBACK_ORDER: Record<BusinessArchetypeId, readonly BusinessArchetypeId[]> = {
  altruist: ["altruist"],
  explorer: ["explorer", "altruist"],
  creator: ["creator", "explorer", "altruist"],
  hero: ["hero", "creator", "explorer", "altruist"],
  magician: ["magician", "hero", "creator", "explorer", "altruist"],
  ruler: ["ruler", "magician", "hero", "creator", "explorer", "altruist"],
};

export function getCandidateArchetypeByTotal(totalScore: number): BusinessArchetypeId {
  if (!Number.isInteger(totalScore) || totalScore < 0 || totalScore > 70) {
    throw new RangeError("totalScore must be an integer from 0 to 70");
  }
  const archetype = BUSINESS_ARCHETYPES.find(
    (item) => totalScore >= item.minTotal && totalScore <= item.maxTotal,
  );
  if (!archetype) throw new RangeError(`No archetype range for totalScore=${totalScore}`);
  return archetype.id;
}

function evaluateGate(
  archetypeId: GatedArchetypeId,
  scores: SevenKScores,
): ArchetypeGateCheck {
  const requirements = BUSINESS_ARCHETYPE_BY_ID[archetypeId].gate.map((requirement) => ({
    ...requirement,
    actualScore: scores[requirement.elementId],
    passed: scores[requirement.elementId] >= requirement.minimumScore,
  }));
  return {
    archetypeId,
    passed: requirements.every((requirement) => requirement.passed),
    requirements,
  };
}

function passesArchetypeGate(archetypeId: BusinessArchetypeId, scores: SevenKScores): boolean {
  const definition = BUSINESS_ARCHETYPE_BY_ID[archetypeId];
  const mandatoryPassed = definition.gate.every(
    (requirement) => scores[requirement.elementId] >= requirement.minimumScore,
  );
  if (!mandatoryPassed) return false;
  if (!("gateAny" in definition) || !definition.gateAny) {
    return true;
  }
  return definition.gateAny.some((group) =>
    group.every((requirement) => scores[requirement.elementId] >= requirement.minimumScore),
  );
}

export function calculateBusinessArchetype(scores: SevenKScores): BusinessArchetypeResult {
  validateSevenKScores(scores);
  const totalScore = SEVEN_K_ELEMENT_IDS.reduce((total, elementId) => total + scores[elementId], 0);
  const candidateArchetype = getCandidateArchetypeByTotal(totalScore);
  const gates = {
    hero: evaluateGate("hero", scores),
    magician: evaluateGate("magician", scores),
    ruler: evaluateGate("ruler", scores),
  };

  const finalArchetype = FALLBACK_ORDER[candidateArchetype].find((archetypeId) => {
    return passesArchetypeGate(archetypeId, scores);
  });
  if (!finalArchetype) throw new Error("Archetype fallback chain is empty");

  const downgradeReason =
    candidateArchetype === finalArchetype
      ? null
      : (() => {
          const candidateGate =
            candidateArchetype === "hero" ||
            candidateArchetype === "magician" ||
            candidateArchetype === "ruler"
              ? gates[candidateArchetype]
              : null;
          const failed = candidateGate?.requirements
            .filter((requirement) => !requirement.passed)
            .map(
              (requirement) =>
                `${requirement.elementId}: ${requirement.actualScore} < ${requirement.minimumScore}`,
            )
            .join(", ");
          return `Кандидат ${BUSINESS_ARCHETYPE_BY_ID[candidateArchetype].name} не прошёл критерии системной зрелости${failed ? ` (${failed})` : ""}; итоговый архетип — ${BUSINESS_ARCHETYPE_BY_ID[finalArchetype].name}.`;
        })();

  return {
    resourceVersion: ARCHETYPES_RESOURCE_VERSION,
    totalScore,
    candidateArchetype,
    finalArchetype,
    gates,
    downgradeReason,
  };
}
