import type { ArchetypeId } from "../business-analysis";
import type { SevenKElementId, SevenKScores } from "./7k/types";

/**
 * UI-facing narrowed subset of the canonical backend type in
 * .reference/razbor2/server/analysis-result/types.ts.
 */
export type TargetConfigurationResult = {
  targetScores: SevenKScores;
  modelTransitionNote?: string | null;
  [key: string]: unknown;
};

export type BusinessArchetypeResult = {
  finalArchetype: ArchetypeId;
  [key: string]: unknown;
};

export type P01ResultV1_4_2 = {
  current7k: Record<SevenKElementId, unknown>;
  evidenceLedger: unknown[];
};

export type ClientChecklistState =
  | "missing"
  | "partial"
  | "undocumented"
  | "unmeasured"
  | "unstable";

export type ClientChecklistItem = {
  task_id: string;
  state: ClientChecklistState;
  client_task: string;
  client_done_when: string;
  source_refs: string[];
};

export type AnalysisResultV1 = {
  clientContext: {
    expertName: string | null;
    niche?: string | null;
  };
  current: {
    scores: SevenKScores;
    current7k?: Record<SevenKElementId, unknown>;
    businessMap?: unknown;
  };
  target: TargetConfigurationResult;
  archetype: BusinessArchetypeResult;
  strategy: {
    bundle: {
      priority_element: SevenKElementId | null;
      build_elements: SevenKElementId[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  route: {
    cards: Array<{
      elementId: SevenKElementId;
      cardId: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  report: {
    opening: { headline: string };
    targetConfiguration: { summary: string };
    archetype: { summary: string };
    growthPoint: { title: string; coach_explanation: string };
    whyNotNow: Array<{
      element_id: SevenKElementId;
      text: string;
      return_trigger?: string | null;
      [key: string]: unknown;
    }>;
    routeCards: Array<{
      card_id: string;
      why_now?: string | null;
      client_presentation?: { items: ClientChecklistItem[] } | null;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  provenance: {
    assemblyInputHash: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};