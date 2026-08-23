import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import p04OutputSchema from "@/schemas/p04-report-writer.output.v1.2.schema.json";
import { stableJson } from "@/server/stage4/hash";
import { getExpectedArchetypeName } from "./projections";
import type { P04PreparedInput } from "./stage-types";
import type { P04ResultV1_2 } from "./types";

export type P04ValidationIssue = { path: string; code: string; message: string };

export class P04SchemaValidationError extends Error {
  readonly code = "P04_SCHEMA_VALIDATION_FAILED" as const;
  constructor(readonly issues: P04ValidationIssue[]) {
    super("P-04 output does not satisfy schema 1.2");
    this.name = "P04SchemaValidationError";
  }
}

export class P04InvariantError extends Error {
  readonly code = "P04_INVARIANT_FAILED" as const;
  constructor(readonly issues: P04ValidationIssue[]) {
    super("P-04 output violates backend semantic invariants");
    this.name = "P04InvariantError";
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(p04OutputSchema);

function schemaIssue(error: ErrorObject): P04ValidationIssue {
  return {
    path: error.instancePath || "/",
    code: `schema.${error.keyword}`,
    message: error.message ?? "Schema validation failed",
  };
}

export function validateP04Schema(value: unknown): P04ResultV1_2 {
  if (!validateSchema(value)) {
    throw new P04SchemaValidationError((validateSchema.errors ?? []).map(schemaIssue));
  }
  return value as P04ResultV1_2;
}

function add(issues: P04ValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function canonicalSourceRefs(
  refs: readonly string[],
  required: readonly string[],
  input: P04PreparedInput,
): string[] {
  const allowed = new Set(input.sourceRegistry.refs);
  const normalizedRefs = refs.filter((ref) => allowed.has(ref));
  for (const ref of required) {
    if (allowed.has(ref) && !normalizedRefs.includes(ref)) normalizedRefs.push(ref);
  }
  return normalizedRefs;
}

export function canonicalizeP04ImmutableEchoes(
  value: unknown,
  input: P04PreparedInput,
): P04ResultV1_2 {
  const result = structuredClone(validateP04Schema(value));
  const policy = input.reportPolicy;
  const context = input.context;

  result.analysisStatus = policy.analysisStatus;
  result.opening.source_refs = canonicalSourceRefs(
    result.opening.source_refs,
    ["P01:businessMap"],
    input,
  );
  result.currentConfiguration.source_refs = canonicalSourceRefs(
    result.currentConfiguration.source_refs,
    ["P01:businessMap"],
    input,
  );
  result.targetConfiguration.source_refs = canonicalSourceRefs(
    result.targetConfiguration.source_refs,
    ["TARGET:model"],
    input,
  );

  if (result.targetConfiguration.key_shifts.length === policy.targetShiftElements.length) {
    result.targetConfiguration.key_shifts = policy.targetShiftElements.map((expected, index) => {
      const authored = result.targetConfiguration.key_shifts.find(
        (item) => item.element_id === expected.element_id,
      ) ?? result.targetConfiguration.key_shifts[index];
      return {
        ...authored,
        ...expected,
        source_refs: canonicalSourceRefs(
          authored.source_refs,
          [`TARGET:${expected.element_id}`],
          input,
        ),
      };
    });
  }

  result.archetype.archetype_name = getExpectedArchetypeName(context);
  result.archetype.source_refs = canonicalSourceRefs(
    result.archetype.source_refs,
    ["ARCHETYPE:current"],
    input,
  );
  result.growthPoint.priority_element = context.strategy.bundle.priority_element;
  result.growthPoint.build_elements = structuredClone(context.strategy.bundle.build_elements);
  result.growthPoint.source_refs = canonicalSourceRefs(
    result.growthPoint.source_refs,
    ["P02:constraint", "P02:bundle"],
    input,
  );

  if (result.whyNotNow.length === policy.whyNotNowExpected.length) {
    result.whyNotNow = policy.whyNotNowExpected.map((expected, index) => {
      const authored = result.whyNotNow.find((item) => item.element_id === expected.element_id)
        ?? result.whyNotNow[index];
      return {
        ...authored,
        ...expected,
        source_refs: canonicalSourceRefs(authored.source_refs, ["P02:bundle"], input),
      };
    });
  }

  if (result.routeCards.length === policy.routeCardIdentities.length) {
    result.routeCards = policy.routeCardIdentities.map((expected, index) => {
      const authored = result.routeCards.find((item) => item.card_id === expected.card_id)
        ?? result.routeCards[index];
      return {
        ...authored,
        ...expected,
        task_ids: [...expected.task_ids],
        source_refs: canonicalSourceRefs(
          authored.source_refs,
          [`PLAN:card:${expected.card_id}`],
          input,
        ),
      };
    });
  }

  const businessValidation = context.strategy.businessValidation;
  Object.assign(result.businessValidation, {
    checkpoint_after_order: businessValidation.checkpoint_after_order,
    metric_name: businessValidation.metric_name,
    baseline_value: businessValidation.baseline_value,
    target_value: businessValidation.target_value,
    unit: businessValidation.unit,
    target_rule: businessValidation.target_rule,
    formula: businessValidation.formula,
    timeframe_days: businessValidation.timeframe_days,
    if_signal_absent: businessValidation.if_signal_absent,
  });
  result.businessValidation.source_refs = canonicalSourceRefs(
    result.businessValidation.source_refs,
    ["P02:validation"],
    input,
  );

  result.finalFocus.first_task_id = policy.firstTask.taskId;
  result.finalFocus.first_action = policy.firstTask.task;
  result.finalFocus.wait_for_signal = policy.validationSignal;
  result.finalFocus.source_refs = canonicalSourceRefs(
    result.finalFocus.source_refs,
    [`TASK:${policy.firstTask.taskId}`],
    input,
  );

  result.moneyNow.status = policy.moneyNowStatus;
  result.moneyNow.scenario_id = context.moneyNow.selectedScenario?.scenario_id ?? null;
  result.moneyNow.locked_teaser = context.moneyNow.lockedTeaser;
  result.moneyNow.source_refs = canonicalSourceRefs(
    result.moneyNow.source_refs,
    ["MN:selection"],
    input,
  );

  result.sanityChecks = result.sanityChecks.map((check) => ({
    ...check,
    source_refs: canonicalSourceRefs(check.source_refs, ["P02:validation"], input),
  }));
  return result;
}

function safeNarrativeTypography(value: string): string {
  return value
    .replace(/[—–]/gu, "-")
    .replace(/(^|[^\p{L}])(?:готова|готов)(?=$|[^\p{L}])/giu, "$1готовы")
    .replace(/(^|[^\p{L}])(?:сделала|сделал)(?=$|[^\p{L}])/giu, "$1сделали")
    .replace(/(^|[^\p{L}])(?:начала|начал)(?=$|[^\p{L}])/giu, "$1начали")
    .replace(/(^|[^\p{L}])(?:выстроила|выстроил)(?=$|[^\p{L}])/giu, "$1выстроили")
    .replace(/(^|[^\p{L}])(?:решила|решил)(?=$|[^\p{L}])/giu, "$1решили");
}

export function canonicalizeP04NarrativePresentation(
  value: P04ResultV1_2,
): P04ResultV1_2 {
  const result = structuredClone(value);
  const clean = safeNarrativeTypography;

  result.opening.headline = clean(result.opening.headline);
  result.opening.summary = clean(result.opening.summary);
  result.currentConfiguration.summary = clean(result.currentConfiguration.summary);
  result.currentConfiguration.strengths = result.currentConfiguration.strengths.map(clean);
  result.currentConfiguration.fragilities = result.currentConfiguration.fragilities.map(clean);
  result.targetConfiguration.summary = clean(result.targetConfiguration.summary);
  result.targetConfiguration.key_shifts = result.targetConfiguration.key_shifts.map((item) => ({
    ...item,
    shift: clean(item.shift),
  }));
  result.archetype.summary = clean(result.archetype.summary);
  result.growthPoint.title = clean(result.growthPoint.title);
  result.growthPoint.coach_explanation = clean(result.growthPoint.coach_explanation);
  result.growthPoint.what_it_unlocks = result.growthPoint.what_it_unlocks.map(clean);
  result.whyNotNow = result.whyNotNow.map((item) => ({
    ...item,
    text: item.return_trigger === null
      ? "Сейчас этот элемент не входит в ближайший маршрут. Вернуться к нему можно после прохождения ближайшего маршрута."
      : `Сейчас этот элемент не входит в ближайший маршрут. Условие возврата: ${clean(item.return_trigger)}`,
  }));
  result.routeCards = result.routeCards.map((card) => ({
    ...card,
    card_title: clean(card.card_title),
    why_now: clean(card.why_now),
    what_changes_in_business: clean(card.what_changes_in_business),
    connection_to_next_stage: card.connection_to_next_stage === null
      ? null
      : clean(card.connection_to_next_stage),
  }));
  result.businessValidation.explanation =
    `Проверка строится по показателю «${clean(result.businessValidation.metric_name)}» и заданному правилу. `
    + `Контрольная точка: ${result.businessValidation.timeframe_days} дней.`;
  result.moneyNow.headline = clean(result.moneyNow.headline);
  result.moneyNow.narrative = result.moneyNow.narrative === null
    ? null
    : clean(result.moneyNow.narrative);
  result.finalFocus.headline = "Первый шаг";
  result.finalFocus.text = clean(result.finalFocus.text);
  result.sanityChecks = result.sanityChecks.map((check) => ({
    ...check,
    message: clean(check.message),
  }));
  return result;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/gu, " ");
}

function authoredTexts(result: P04ResultV1_2): Array<{ path: string; value: string }> {
  const texts: Array<{ path: string; value: string }> = [
    { path: "/opening/headline", value: result.opening.headline },
    { path: "/opening/summary", value: result.opening.summary },
    { path: "/currentConfiguration/summary", value: result.currentConfiguration.summary },
    { path: "/targetConfiguration/summary", value: result.targetConfiguration.summary },
    { path: "/archetype/summary", value: result.archetype.summary },
    { path: "/growthPoint/title", value: result.growthPoint.title },
    { path: "/growthPoint/coach_explanation", value: result.growthPoint.coach_explanation },
    { path: "/businessValidation/explanation", value: result.businessValidation.explanation },
    { path: "/moneyNow/headline", value: result.moneyNow.headline },
    { path: "/finalFocus/headline", value: result.finalFocus.headline },
    { path: "/finalFocus/text", value: result.finalFocus.text },
  ];
  if (result.moneyNow.narrative !== null) {
    texts.push({ path: "/moneyNow/narrative", value: result.moneyNow.narrative });
  }
  result.currentConfiguration.strengths.forEach((value, index) => texts.push({ path: `/currentConfiguration/strengths/${index}`, value }));
  result.currentConfiguration.fragilities.forEach((value, index) => texts.push({ path: `/currentConfiguration/fragilities/${index}`, value }));
  result.targetConfiguration.key_shifts.forEach((item, index) => texts.push({ path: `/targetConfiguration/key_shifts/${index}/shift`, value: item.shift }));
  result.growthPoint.what_it_unlocks.forEach((value, index) => texts.push({ path: `/growthPoint/what_it_unlocks/${index}`, value }));
  result.whyNotNow.forEach((item, index) => texts.push({ path: `/whyNotNow/${index}/text`, value: item.text }));
  result.routeCards.forEach((card, index) => {
    texts.push(
      { path: `/routeCards/${index}/card_title`, value: card.card_title },
      { path: `/routeCards/${index}/why_now`, value: card.why_now },
      { path: `/routeCards/${index}/what_changes_in_business`, value: card.what_changes_in_business },
    );
    if (card.connection_to_next_stage !== null) {
      texts.push({ path: `/routeCards/${index}/connection_to_next_stage`, value: card.connection_to_next_stage });
    }
  });
  result.sanityChecks.forEach((check, index) => texts.push({ path: `/sanityChecks/${index}/message`, value: check.message }));
  return texts;
}

function allSourceRefGroups(result: P04ResultV1_2): Array<{ path: string; refs: string[] }> {
  const groups: Array<{ path: string; refs: string[] }> = [
    { path: "/opening/source_refs", refs: result.opening.source_refs },
    { path: "/currentConfiguration/source_refs", refs: result.currentConfiguration.source_refs },
    { path: "/targetConfiguration/source_refs", refs: result.targetConfiguration.source_refs },
    { path: "/archetype/source_refs", refs: result.archetype.source_refs },
    { path: "/growthPoint/source_refs", refs: result.growthPoint.source_refs },
    { path: "/businessValidation/source_refs", refs: result.businessValidation.source_refs },
    { path: "/moneyNow/source_refs", refs: result.moneyNow.source_refs },
    { path: "/finalFocus/source_refs", refs: result.finalFocus.source_refs },
  ];
  result.targetConfiguration.key_shifts.forEach((item, index) => groups.push({ path: `/targetConfiguration/key_shifts/${index}/source_refs`, refs: item.source_refs }));
  result.whyNotNow.forEach((item, index) => groups.push({ path: `/whyNotNow/${index}/source_refs`, refs: item.source_refs }));
  result.routeCards.forEach((item, index) => groups.push({ path: `/routeCards/${index}/source_refs`, refs: item.source_refs }));
  result.sanityChecks.forEach((item, index) => groups.push({ path: `/sanityChecks/${index}/source_refs`, refs: item.source_refs }));
  return groups;
}

const IMPERATIVE_PATTERN = /(?:^|[^\p{L}])(?:сделайте|запустите|наймите|внедрите|создайте|настройте|проведите|соберите|напишите|предложите|продайте|добавьте|уберите|начните|перестаньте|привлеките|делегируйте|увеличьте|повышайте|сфокусируйтесь)(?=$|[^\p{L}])/iu;

function imperativeClauses(value: string): string[] {
  return value
    .split(/[.!?;\n]+/u)
    .map(normalized)
    .filter((part) => IMPERATIVE_PATTERN.test(part));
}

function groundedInFixedTask(clause: string, fixedTasks: readonly string[]): boolean {
  const candidate = normalized(clause);
  return fixedTasks.some((task) => {
    const fixed = normalized(task);
    return fixed.includes(candidate) || candidate.includes(fixed);
  });
}

function validateNoNewTasks(
  issues: P04ValidationIssue[],
  result: P04ResultV1_2,
  input: P04PreparedInput,
): void {
  const routePaths = new Map<string, string[]>();
  input.context.resolvedPlan.cards.forEach((card, index) => {
    const tasks = card.tasks.map((task) => task.task);
    ["card_title", "why_now", "what_changes_in_business", "connection_to_next_stage"].forEach((field) => {
      routePaths.set(`/routeCards/${index}/${field}`, tasks);
    });
  });
  routePaths.set("/finalFocus/headline", [input.reportPolicy.firstTask.task]);
  routePaths.set("/finalFocus/text", [input.reportPolicy.firstTask.task]);
  authoredTexts(result).forEach(({ path, value }) => {
    const clauses = imperativeClauses(value);
    const fixedTasks = routePaths.get(path) ?? [];
    clauses.forEach((clause) => {
      if (!groundedInFixedTask(clause, fixedTasks)) {
        add(issues, path, "new_task_language", `Imperative action is not grounded in immutable fixed tasks: ${clause}`);
      }
    });
  });
}

function validateTextInvariants(
  issues: P04ValidationIssue[],
  result: P04ResultV1_2,
): void {
  const bureaucratic = /(?:рекомендуется|целесообразно|оптимизировать|повысить эффективность|в рамках данного направления|выявлено|анализ показывает|алгоритм определил|нейросеть считает)/iu;
  const genderAssumption = /(?:^|[^\p{L}])(?:готова|готов|сделала|сделал|начала|начал|выстроила|выстроил|решила|решил)(?=$|[^\p{L}])/iu;
  const incomePromise = /(?:гарантир\p{L}*\s+(?:доход|выручк|заработ)|(?:точно|обязательно|непременно)\s+(?:заработ|получ|принес|даст)\p{L}*\s+(?:деньг|доход|выручк))/iu;
  const metricAdvice = /^(?:повысить|увеличить|улучшить|оптимизировать)\s+(?:конверси|доход|выручк|продаж|эффективност)/iu;
  authoredTexts(result).forEach(({ path, value }) => {
    if (/[—–]/u.test(value)) add(issues, path, "long_dash_forbidden", "P-04 narrative cannot contain a long dash.");
    if (bureaucratic.test(value)) add(issues, path, "bureaucratic_phrase", "P-04 narrative contains forbidden bureaucratic/AI wording.");
    if (genderAssumption.test(value)) add(issues, path, "invented_gender", "Client gender was not provided; use neutral grammar.");
    if (incomePromise.test(value)) add(issues, path, "income_promise", "P-04 cannot promise income or revenue.");
    if (metricAdvice.test(value.trim())) add(issues, path, "metric_as_advice", "A metric cannot be presented as a new action.");
  });
}

export function validateP04Invariants(
  result: P04ResultV1_2,
  input: P04PreparedInput,
): P04ResultV1_2 {
  const issues: P04ValidationIssue[] = [];
  const policy = input.reportPolicy;
  const context = input.context;

  if (result.analysisStatus !== policy.analysisStatus) {
    add(issues, "/analysisStatus", "analysis_status_changed", "P-04 must echo backend REPORT_POLICY analysisStatus and cannot upgrade confidence or invent a conflict.");
  }
  const expectedShifts = policy.targetShiftElements;
  const actualShifts = result.targetConfiguration.key_shifts.map((item) => ({
    element_id: item.element_id,
    from_score: item.from_score,
    to_score: item.to_score,
  }));
  if (stableJson(actualShifts) !== stableJson(expectedShifts)) {
    add(issues, "/targetConfiguration/key_shifts", "target_shift_changed", "Target shifts must exactly match deterministic REPORT_POLICY.");
  }
  result.targetConfiguration.key_shifts.forEach((item, index) => {
    if (!item.source_refs.includes(`TARGET:${item.element_id}`)) {
      add(issues, `/targetConfiguration/key_shifts/${index}/source_refs`, "target_shift_trace_missing", "Each target shift must reference its deterministic target element.");
    }
  });

  const archetypeName = getExpectedArchetypeName(context);
  if (result.archetype.archetype_name !== archetypeName) {
    add(issues, "/archetype/archetype_name", "archetype_renamed", `Expected exact archetype name ${archetypeName}.`);
  }
  if (!result.archetype.source_refs.includes("ARCHETYPE:current")) {
    add(issues, "/archetype/source_refs", "archetype_trace_missing", "Archetype narrative must reference ARCHETYPE:current.");
  }

  if (
    result.growthPoint.priority_element !== context.strategy.bundle.priority_element ||
    stableJson(result.growthPoint.build_elements) !== stableJson(context.strategy.bundle.build_elements)
  ) {
    add(issues, "/growthPoint", "growth_bundle_changed", "P-04 cannot change P-02 priority/build bundle.");
  }
  if (!result.growthPoint.source_refs.includes("P02:constraint") || !result.growthPoint.source_refs.includes("P02:bundle")) {
    add(issues, "/growthPoint/source_refs", "growth_trace_missing", "Growth point must trace to P-02 constraint and bundle.");
  }

  const actualWhyNotNow = result.whyNotNow.map((item) => ({
    element_id: item.element_id,
    status: item.status,
    return_trigger: item.return_trigger,
  }));
  if (stableJson(actualWhyNotNow) !== stableJson(policy.whyNotNowExpected)) {
    add(issues, "/whyNotNow", "why_not_now_changed", "whyNotNow elements/status/return_trigger must exactly match REPORT_POLICY.");
  }
  result.whyNotNow.forEach((item, index) => {
    if (!item.source_refs.includes("P02:bundle")) {
      add(issues, `/whyNotNow/${index}/source_refs`, "why_not_now_trace_missing", "whyNotNow must trace to P-02 bundle.");
    }
  });

  const actualCards = result.routeCards.map((card) => ({
    card_id: card.card_id,
    order: card.order,
    element_id: card.element_id,
    role: card.role,
    from_score: card.from_score,
    to_score: card.to_score,
    task_ids: card.task_ids,
  }));
  if (stableJson(actualCards) !== stableJson(policy.routeCardIdentities)) {
    add(issues, "/routeCards", "route_identity_changed", "Route cards must preserve exact count/order/identity/task IDs.");
  }
  result.routeCards.forEach((card, index) => {
    const expectedRefs = new Set([
      `PLAN:card:${card.card_id}`,
      `P02:sequence:${card.order}`,
      ...card.task_ids.map((taskId) => `TASK:${taskId}`),
    ]);
    if (!card.source_refs.some((ref) => expectedRefs.has(ref))) {
      add(issues, `/routeCards/${index}/source_refs`, "route_trace_missing", "Route card must trace to its plan card, milestone or fixed task.");
    }
  });

  const validation = context.strategy.businessValidation;
  const actualValidation = {
    checkpoint_after_order: result.businessValidation.checkpoint_after_order,
    metric_name: result.businessValidation.metric_name,
    baseline_value: result.businessValidation.baseline_value,
    target_value: result.businessValidation.target_value,
    unit: result.businessValidation.unit,
    target_rule: result.businessValidation.target_rule,
    formula: result.businessValidation.formula,
    timeframe_days: result.businessValidation.timeframe_days,
    if_signal_absent: result.businessValidation.if_signal_absent,
  };
  const expectedValidation = {
    checkpoint_after_order: validation.checkpoint_after_order,
    metric_name: validation.metric_name,
    baseline_value: validation.baseline_value,
    target_value: validation.target_value,
    unit: validation.unit,
    target_rule: validation.target_rule,
    formula: validation.formula,
    timeframe_days: validation.timeframe_days,
    if_signal_absent: validation.if_signal_absent,
  };
  if (stableJson(actualValidation) !== stableJson(expectedValidation)) {
    add(issues, "/businessValidation", "business_validation_changed", "P-04 may write only explanation; all validation fields are immutable P-02 echoes.");
  }
  if (!result.businessValidation.source_refs.includes("P02:validation")) {
    add(issues, "/businessValidation/source_refs", "validation_trace_missing", "Business validation must reference P02:validation.");
  }

  if (
    result.finalFocus.first_task_id !== policy.firstTask.taskId ||
    result.finalFocus.first_action !== policy.firstTask.task ||
    result.finalFocus.wait_for_signal !== policy.validationSignal
  ) {
    add(issues, "/finalFocus", "final_focus_changed", "first_task_id, first_action and wait_for_signal must be exact backend echoes.");
  }
  if (!result.finalFocus.source_refs.includes(`TASK:${policy.firstTask.taskId}`)) {
    add(issues, "/finalFocus/source_refs", "first_task_trace_missing", "Final focus must reference its immutable first task.");
  }

  const expectedScenarioId = context.moneyNow.selectedScenario?.scenario_id ?? null;
  if (
    result.moneyNow.status !== policy.moneyNowStatus ||
    result.moneyNow.scenario_id !== expectedScenarioId ||
    result.moneyNow.locked_teaser !== context.moneyNow.lockedTeaser
  ) {
    add(issues, "/moneyNow", "money_now_changed", "Money Now status/scenario/locked teaser must exactly match backend state.");
  }
  if (!result.moneyNow.source_refs.includes("MN:selection")) {
    add(issues, "/moneyNow/source_refs", "money_now_trace_missing", "Money Now must reference immutable Stage 7 selection.");
  }
  if (policy.moneyNowStatus === "no_eligible_scenario") {
    if (result.moneyNow.scenario_id !== null) add(issues, "/moneyNow/scenario_id", "no_eligible_fallback", "No eligible scenario requires scenario_id=null.");
    if (/(?:вместо этого|альтернатив|можно\s+(?:сделать|запустить|создать|предложить)|сфокусируйтесь|начните)/iu.test(result.moneyNow.narrative ?? "")) {
      add(issues, "/moneyNow/narrative", "no_eligible_fallback", "P-04 cannot invent a fallback when Stage 7 found no eligible scenario.");
    }
  }
  if (policy.moneyNowStatus === "blocked_insufficient_evidence") {
    const narrative = result.moneyNow.narrative ?? "";
    if (/(?:точная\s+)?причина\s+(?:в|это|заключается)|корень\s+проблемы\s+(?:в|это)/iu.test(narrative)) {
      add(issues, "/moneyNow/narrative", "unproven_cause_disclosed", "Blocked insufficient narrative cannot expose a cause hypothesis.");
    }
  }

  const allowedRefs = new Set(input.sourceRegistry.refs);
  allSourceRefGroups(result).forEach(({ path, refs }) => {
    if (refs.length === 0) add(issues, path, "source_ref_required", "At least one canonical source_ref is required.");
    refs.forEach((ref, index) => {
      if (!allowedRefs.has(ref)) add(issues, `${path}/${index}`, "unknown_source_ref", `${ref} is absent from backend SOURCE_REGISTRY.`);
    });
  });

  validateTextInvariants(issues, result);
  validateNoNewTasks(issues, result, input);
  if (issues.length) throw new P04InvariantError(issues);
  return result;
}

export function finalizeAndValidateP04Output(
  value: unknown,
  input: P04PreparedInput,
): P04ResultV1_2 {
  return validateP04Invariants(validateP04Schema(value), input);
}

export const P04_OUTPUT_SCHEMA = p04OutputSchema as Record<string, unknown>;
