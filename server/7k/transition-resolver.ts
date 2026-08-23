import transitionsResource from "./config/transitions-70.v1.json";
import {
  SEVEN_K_ELEMENT_IDS,
  SevenKValidationError,
  isSevenKElementId,
  type SevenKElementId,
  type SevenKValidationIssue,
} from "./types";

export const TRANSITIONS_RESOURCE_VERSION = "transitions-70.v1" as const;
export const TRANSITION_LEVERS_RESOURCE_VERSION = "transition-levers.v1" as const;

export type TransitionTask = {
  task_id: string;
  element_id: SevenKElementId;
  from_score: number;
  to_score: number;
  current_state: string;
  task: string;
  done_when: string;
  version: string;
  revenue_lever: string;
  revenue_mechanism: string;
};

type TransitionsResource = {
  resourceVersion: typeof TRANSITIONS_RESOURCE_VERSION;
  source: {
    file: string;
    sheet: string;
    sha256: string;
    contentSha256: string;
    sourceVersion: string;
  };
  transitions: TransitionTask[];
};

export const TRANSITIONS_70_RESOURCE = transitionsResource as unknown as TransitionsResource;
export const TRANSITIONS_70 = TRANSITIONS_70_RESOURCE.transitions;

export type TransitionRegistryIntegrity = {
  count: 70;
  uniqueTaskIds: 70;
  transitionsPerElement: Record<SevenKElementId, 10>;
};

export function validateTransitionRegistry(
  transitions: readonly TransitionTask[],
): TransitionRegistryIntegrity {
  const issues: SevenKValidationIssue[] = [];
  if (transitions.length !== 70) {
    issues.push({
      path: "/transitions",
      code: "invalid_transition_count",
      message: `Ожидается ровно 70 переходов, получено ${transitions.length}.`,
    });
  }

  const taskIds = new Set<string>();
  const coverage = new Map<SevenKElementId, Set<number>>(
    SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, new Set<number>()]),
  );

  transitions.forEach((transition, index) => {
    const path = `/transitions/${index}`;
    if (typeof transition.task_id !== "string" || transition.task_id.trim() === "") {
      issues.push({ path: `${path}/task_id`, code: "missing_task_id", message: "task_id обязателен." });
    } else if (taskIds.has(transition.task_id)) {
      issues.push({
        path: `${path}/task_id`,
        code: "duplicate_task_id",
        message: `Дублирующийся task_id: ${transition.task_id}.`,
      });
    } else {
      taskIds.add(transition.task_id);
    }
    if (!isSevenKElementId(transition.element_id)) {
      issues.push({
        path: `${path}/element_id`,
        code: "unknown_element_id",
        message: `Неизвестный element_id: ${String(transition.element_id)}.`,
      });
      return;
    }
    if (
      !Number.isInteger(transition.from_score) ||
      !Number.isInteger(transition.to_score) ||
      transition.from_score < 0 ||
      transition.to_score > 10 ||
      transition.to_score !== transition.from_score + 1
    ) {
      issues.push({
        path,
        code: "invalid_transition_step",
        message: "Разрешены только последовательные переходы 0→1 ... 9→10.",
      });
    } else {
      coverage.get(transition.element_id)?.add(transition.from_score);
    }
    for (const field of [
      "current_state",
      "task",
      "done_when",
      "version",
      "revenue_lever",
      "revenue_mechanism",
    ] as const) {
      if (typeof transition[field] !== "string" || transition[field].trim() === "") {
        issues.push({ path: `${path}/${field}`, code: "missing_transition_text", message: `${field} обязателен.` });
      }
    }
  });

  for (const elementId of SEVEN_K_ELEMENT_IDS) {
    const fromScores = coverage.get(elementId) ?? new Set<number>();
    for (let fromScore = 0; fromScore <= 9; fromScore += 1) {
      if (!fromScores.has(fromScore)) {
        issues.push({
          path: `/transitions/${elementId}/${fromScore}`,
          code: "missing_transition",
          message: `Нет перехода ${elementId} ${fromScore}→${fromScore + 1}.`,
        });
      }
    }
  }

  if (issues.length > 0) throw new SevenKValidationError(issues);
  return {
    count: 70,
    uniqueTaskIds: 70,
    transitionsPerElement: Object.fromEntries(
      SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, 10]),
    ) as Record<SevenKElementId, 10>,
  };
}

export const TRANSITIONS_70_INTEGRITY = validateTransitionRegistry(TRANSITIONS_70);

const TRANSITION_BY_KEY = new Map(
  TRANSITIONS_70.map((transition) => [
    `${transition.element_id}:${transition.from_score}:${transition.to_score}`,
    transition,
  ]),
);

export type TransitionMilestone = {
  element_id: SevenKElementId;
  from_score: number;
  to_score: number;
};

export type ResolvedTransitionMilestone = TransitionMilestone & {
  transitions: TransitionTask[];
};

export type ResolvedTransitionSequence = {
  resourceVersion: typeof TRANSITIONS_RESOURCE_VERSION;
  milestones: ResolvedTransitionMilestone[];
  tasks: TransitionTask[];
};

function validateMilestone(milestone: TransitionMilestone, index: number): void {
  const issues: SevenKValidationIssue[] = [];
  if (!isSevenKElementId(milestone.element_id)) {
    issues.push({
      path: `/elementSequence/${index}/element_id`,
      code: "unknown_element_id",
      message: "Неизвестный элемент 7К.",
    });
  }
  for (const field of ["from_score", "to_score"] as const) {
    const value = milestone[field];
    if (!Number.isInteger(value) || value < 0 || value > 10) {
      issues.push({
        path: `/elementSequence/${index}/${field}`,
        code: "invalid_score",
        message: "Ожидается целое число от 0 до 10.",
      });
    }
  }
  if (
    Number.isInteger(milestone.from_score) &&
    Number.isInteger(milestone.to_score) &&
    milestone.to_score <= milestone.from_score
  ) {
    issues.push({
      path: `/elementSequence/${index}`,
      code: "non_forward_transition",
      message: "to_score должен быть больше from_score.",
    });
  }
  if (issues.length > 0) throw new SevenKValidationError(issues);
}

export function resolveTransitionSequence(
  elementSequence: readonly TransitionMilestone[],
): ResolvedTransitionSequence {
  const milestones = elementSequence.map((milestone, index) => {
    validateMilestone(milestone, index);
    const transitions: TransitionTask[] = [];
    for (let score = milestone.from_score; score < milestone.to_score; score += 1) {
      const key = `${milestone.element_id}:${score}:${score + 1}`;
      const transition = TRANSITION_BY_KEY.get(key);
      if (!transition || !transition.task_id) {
        throw new SevenKValidationError([
          {
            path: `/elementSequence/${index}`,
            code: "transition_not_found",
            message: `Не найден канонический переход ${milestone.element_id} ${score}→${score + 1}.`,
          },
        ]);
      }
      transitions.push(transition);
    }
    return { ...milestone, transitions };
  });

  return {
    resourceVersion: TRANSITIONS_RESOURCE_VERSION,
    milestones,
    tasks: milestones.flatMap((milestone) => milestone.transitions),
  };
}
