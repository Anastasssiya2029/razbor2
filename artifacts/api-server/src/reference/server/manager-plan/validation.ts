import {
  MANAGER_PLAN_VERSION,
  buildCanonicalChecklist,
  type ChecklistTask,
  type ManagerPlanContent,
} from "@/lib/analysis-checklist";
import type { AnalysisResultV1 } from "@/server/analysis-result";
import { ManagerPlanError } from "./types";

const MAX_TASKS_PER_CARD = 20;
const MAX_TASK_LENGTH = 500;
const MAX_DONE_WHEN_LENGTH = 800;

function cleanText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, `${label}: нужен текст.`);
  }
  const cleaned = value.replace(/\r\n?/gu, "\n").trim();
  if (!cleaned || cleaned.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(cleaned)) {
    throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, `${label}: проверьте длину и содержание.`);
  }
  return cleaned;
}

// The client echoes back a `source` label it originally received, but that
// label can go stale: the canonical checklist is rebuilt fresh on every save
// (see buildCanonicalChecklist below), and its ids can shift slightly since
// the plan was last loaded (e.g. bullet-split boundaries move when saved
// text no longer contains the original bullet markers). Trusting the
// client's `source` field then rejects a perfectly legitimate edit with
// "Источник задачи не соответствует исходному плану", even though nothing
// about the actual checklist contract (below) was violated. The server
// always derives the true source itself from id membership in the freshly
// rebuilt canonical set instead of validating the client's claim -- the
// real integrity guarantees (every canonical id must still be present, ids
// must stay unique, per-card task counts and text length are bounded) are
// enforced separately in validateManagerPlanContent regardless of source.
function cleanTask(value: unknown, canonicalIds: Set<string>): ChecklistTask {
  if (!value || typeof value !== "object") {
    throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, "Некорректная задача чек-листа.");
  }
  const candidate = value as Partial<ChecklistTask>;
  const rawId = cleanText(candidate.id, "ID задачи", 160);
  const isCanonical = canonicalIds.has(rawId);
  const source: ChecklistTask["source"] = isCanonical ? "canonical" : "manager";
  // A canonical id is trusted as-is. A non-canonical id is expected to look
  // like a manager-generated id; if it doesn't (e.g. it's a stale canonical
  // id whose split suffix shifted, rather than a genuinely new task), give
  // it a fresh, well-formed manager id instead of rejecting the whole save
  // -- the task's content is still preserved.
  const id = source === "manager" && !/^manager-[a-z0-9-]{8,80}$/u.test(rawId)
    ? `manager-${crypto.randomUUID()}`
    : rawId;
  return {
    id,
    source,
    task: cleanText(candidate.task, "Задача", MAX_TASK_LENGTH),
    doneWhen: cleanText(candidate.doneWhen, "Критерий готовности", MAX_DONE_WHEN_LENGTH),
  };
}

export function validateManagerPlanContent(
  value: unknown,
  result: AnalysisResultV1,
  currentWeeklyHours?: number | null,
): ManagerPlanContent {
  if (!value || typeof value !== "object") {
    throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, "Версия менеджера не заполнена.");
  }
  const candidate = value as Partial<ManagerPlanContent>;
  if (candidate.version !== MANAGER_PLAN_VERSION || !Array.isArray(candidate.cards)) {
    throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, "Версия чек-листа не поддерживается.");
  }
  const canonicalCards = buildCanonicalChecklist(result, currentWeeklyHours);
  if (candidate.cards.length !== canonicalCards.length) {
    throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, "Состав карточек чек-листа изменён.");
  }
  const cards = canonicalCards.map((canonicalCard, index) => {
    const candidateCard = candidate.cards?.[index];
    if (!candidateCard || candidateCard.elementId !== canonicalCard.elementId || !Array.isArray(candidateCard.tasks)) {
      throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, "Порядок элементов чек-листа изменён.");
    }
    if (candidateCard.tasks.length < canonicalCard.tasks.length || candidateCard.tasks.length > MAX_TASKS_PER_CARD) {
      throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, "Некорректное количество задач в карточке.");
    }
    const canonicalIds = new Set(canonicalCard.tasks.map((task) => task.id));
    const tasks = candidateCard.tasks.map((task) => cleanTask(task, canonicalIds));
    const ids = tasks.map((task) => task.id);
    if (new Set(ids).size !== ids.length || canonicalCard.tasks.some((task) => !ids.includes(task.id))) {
      throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, "Исходные задачи нельзя удалять или дублировать.");
    }
    return { elementId: canonicalCard.elementId, tasks };
  });
  return { version: MANAGER_PLAN_VERSION, cards };
}
