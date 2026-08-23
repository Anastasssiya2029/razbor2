import {
  TRANSITIONS_70,
  TRANSITIONS_RESOURCE_VERSION,
  resolveTransitionSequence,
  validateTransitionRegistry,
  type ResolvedTransitionSequence,
  type TransitionTask,
} from "@/server/7k/transition-resolver";
import { isSevenKElementId, SevenKValidationError } from "@/server/7k/types";
import { TaskResolverError } from "./errors";
import {
  TASK_RESOLVER_STAGE_VERSION,
  type ResolvedTransitionPlan,
  type TaskResolverPlanInput,
} from "./types";

type ResolverDependencies = {
  resolve?: typeof resolveTransitionSequence;
  registry?: readonly TransitionTask[];
  registryVersion?: string;
};

function fail(code: string, message: string, details: unknown = null): never {
  throw new TaskResolverError(code, message, "integrity", details);
}

function assertPlanInput(input: TaskResolverPlanInput): void {
  if (input.elementSequence.length === 0) {
    throw new TaskResolverError(
      "TASK_RESOLVER_EMPTY_SEQUENCE",
      "Persisted P-02 elementSequence must contain at least one milestone.",
      "validation",
    );
  }
  const previousTo = new Map<string, number>();
  input.elementSequence.forEach((milestone, index) => {
    if (!isSevenKElementId(milestone.element_id)) {
      throw new TaskResolverError(
        "TASK_RESOLVER_INVALID_ELEMENT_ID",
        `Milestone ${index + 1} contains a non-canonical element_id.`,
        "validation",
      );
    }
    if (milestone.order !== index + 1) {
      throw new TaskResolverError(
        "TASK_RESOLVER_INVALID_ORDER",
        "P-02 elementSequence order must be continuous and must remain the route order.",
        "validation",
      );
    }
    const expectedFrom = previousTo.get(milestone.element_id) ?? input.currentScores[milestone.element_id];
    if (milestone.from_score !== expectedFrom) {
      throw new TaskResolverError(
        "TASK_RESOLVER_MILESTONE_CHAIN_MISMATCH",
        `${milestone.element_id} milestone ${milestone.order} must start at ${expectedFrom}.`,
        "validation",
      );
    }
    if (milestone.to_score > input.targetScores[milestone.element_id]) {
      throw new TaskResolverError(
        "TASK_RESOLVER_MILESTONE_ABOVE_TARGET",
        `${milestone.element_id} milestone ${milestone.order} exceeds persisted Target Configuration.`,
        "validation",
      );
    }
    previousTo.set(milestone.element_id, milestone.to_score);
  });
}

function assertResolvedMatchesSource(
  input: TaskResolverPlanInput,
  resolved: ResolvedTransitionSequence,
  registry: readonly TransitionTask[],
): void {
  if (resolved.resourceVersion !== TRANSITIONS_RESOURCE_VERSION) {
    fail("TASK_RESOLVER_REGISTRY_VERSION_MISMATCH", "Existing resolver returned an unexpected registry version.");
  }
  if (resolved.milestones.length !== input.elementSequence.length) {
    fail("TASK_RESOLVER_MILESTONE_COUNT_MISMATCH", "Resolver added or removed a P-02 milestone.");
  }
  const registryById = new Map(registry.map((transition) => [transition.task_id, transition]));
  const taskIds = new Set<string>();
  resolved.milestones.forEach((resolvedMilestone, index) => {
    const source = input.elementSequence[index];
    if (
      resolvedMilestone.element_id !== source.element_id ||
      resolvedMilestone.from_score !== source.from_score ||
      resolvedMilestone.to_score !== source.to_score
    ) {
      fail("TASK_RESOLVER_MILESTONE_MISMATCH", `Resolved milestone ${index + 1} differs from persisted P-02.`);
    }
    if (resolvedMilestone.transitions.length !== source.to_score - source.from_score) {
      fail("TASK_RESOLVER_TRANSITION_COUNT_MISMATCH", `Milestone ${source.order} has an invalid transition count.`);
    }
    resolvedMilestone.transitions.forEach((transition, transitionIndex) => {
      const expectedFrom = source.from_score + transitionIndex;
      const canonical = registryById.get(transition.task_id);
      if (!canonical) fail("TASK_RESOLVER_TASK_NOT_IN_REGISTRY", `Task ${transition.task_id} is absent from transitions-70.v1.`);
      if (taskIds.has(transition.task_id)) fail("TASK_RESOLVER_DUPLICATE_TASK_ID", `Task ${transition.task_id} is duplicated in the plan.`);
      taskIds.add(transition.task_id);
      if (
        transition.element_id !== source.element_id ||
        transition.from_score !== expectedFrom ||
        transition.to_score !== expectedFrom + 1
      ) {
        fail("TASK_RESOLVER_BROKEN_TRANSITION_CHAIN", `Task ${transition.task_id} breaks the milestone chain.`);
      }
      if (
        canonical.element_id !== transition.element_id ||
        canonical.from_score !== transition.from_score ||
        canonical.to_score !== transition.to_score ||
        canonical.task !== transition.task ||
        canonical.done_when !== transition.done_when ||
        canonical.version !== transition.version ||
        canonical.revenue_lever !== transition.revenue_lever ||
        canonical.revenue_mechanism !== transition.revenue_mechanism
      ) {
        fail("TASK_RESOLVER_REGISTRY_CONTENT_MISMATCH", `Task ${transition.task_id} does not exactly match the runtime registry.`);
      }
    });
  });
  const flattenedTaskIds = resolved.milestones.flatMap((milestone) => milestone.transitions.map((transition) => transition.task_id));
  if (
    resolved.tasks.length !== taskIds.size ||
    resolved.tasks.some((task, index) => task.task_id !== flattenedTaskIds[index])
  ) {
    fail("TASK_RESOLVER_FLAT_TASKS_MISMATCH", "Resolver flat task list is inconsistent with milestone tasks.");
  }
}

export function buildResolvedTransitionPlan(
  input: TaskResolverPlanInput,
  dependencies: ResolverDependencies = {},
): ResolvedTransitionPlan {
  assertPlanInput(input);
  const registry = dependencies.registry ?? TRANSITIONS_70;
  const registryVersion = dependencies.registryVersion ?? TRANSITIONS_RESOURCE_VERSION;
  if (registryVersion !== TRANSITIONS_RESOURCE_VERSION) {
    fail("TASK_RESOLVER_REGISTRY_VERSION_MISMATCH", `Expected ${TRANSITIONS_RESOURCE_VERSION}, received ${registryVersion}.`);
  }
  try {
    validateTransitionRegistry(registry);
  } catch (error) {
    if (error instanceof SevenKValidationError) {
      fail("TASK_RESOLVER_REGISTRY_INTEGRITY_FAILED", "transitions-70.v1 failed integrity validation.", error.issues);
    }
    throw error;
  }
  let resolved: ResolvedTransitionSequence;
  try {
    resolved = (dependencies.resolve ?? resolveTransitionSequence)(
      input.elementSequence.map(({ element_id, from_score, to_score }) => ({ element_id, from_score, to_score })),
    );
  } catch (error) {
    if (error instanceof SevenKValidationError) {
      fail("TASK_RESOLVER_TRANSITION_NOT_FOUND", "A required transition is absent from transitions-70.v1.", error.issues);
    }
    throw error;
  }
  assertResolvedMatchesSource(input, resolved, registry);
  const cards = input.elementSequence.map((milestone, index) => ({
    cardId: `milestone-${milestone.order}-${milestone.element_id}-${milestone.from_score}-${milestone.to_score}`,
    order: milestone.order,
    elementId: milestone.element_id,
    role: milestone.role,
    fromScore: milestone.from_score,
    toScore: milestone.to_score,
    tasks: resolved.milestones[index].transitions.map((transition) => ({
      taskId: transition.task_id,
      fromScore: transition.from_score,
      toScore: transition.to_score,
      task: transition.task,
      doneWhen: transition.done_when,
      transitionVersion: transition.version,
    })),
    p02WhyNow: milestone.why_now,
    p02Unlocks: [...milestone.unlocks],
    evidenceIds: [...milestone.evidence_ids],
  }));
  const taskIds = cards.flatMap((card) => card.tasks.map((task) => task.taskId));
  return {
    stageVersion: TASK_RESOLVER_STAGE_VERSION,
    transitionRegistryVersion: TRANSITIONS_RESOURCE_VERSION,
    cards,
    taskIds,
    totalTasks: taskIds.length,
    businessValidation: structuredClone(input.businessValidation),
  };
}
