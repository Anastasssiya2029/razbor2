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

function cleanTask(value: unknown, canonicalIds: Set<string>): ChecklistTask {
  if (!value || typeof value !== "object") {
    throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, "Некорректная задача чек-листа.");
  }
  const candidate = value as Partial<ChecklistTask>;
  const id = cleanText(candidate.id, "ID задачи", 160);
  const expectedSource = canonicalIds.has(id) ? "canonical" : "manager";
  if (candidate.source !== expectedSource) {
    throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, "Источник задачи не соответствует исходному плану.");
  }
  if (expectedSource === "manager" && !/^manager-[a-z0-9-]{8,80}$/u.test(id)) {
    throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, "Некорректный ID добавленной задачи.");
  }
  return {
    id,
    source: expectedSource,
    task: cleanText(candidate.task, "Задача", MAX_TASK_LENGTH),
    doneWhen: cleanText(candidate.doneWhen, "Критерий готовности", MAX_DONE_WHEN_LENGTH),
  };
}

export function validateManagerPlanContent(
  value: unknown,
  result: AnalysisResultV1,
): ManagerPlanContent {
  if (!value || typeof value !== "object") {
    throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, "Версия менеджера не заполнена.");
  }
  const candidate = value as Partial<ManagerPlanContent>;
  if (candidate.version !== MANAGER_PLAN_VERSION || !Array.isArray(candidate.cards)) {
    throw new ManagerPlanError("MANAGER_PLAN_INVALID", 400, "Версия чек-листа не поддерживается.");
  }
  const canonicalCards = buildCanonicalChecklist(result);
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
