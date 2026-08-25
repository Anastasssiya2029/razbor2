"use client";

import { useState } from "react";
import {
  managerPlanContentFromCards,
  type ChecklistCard,
  type ManagerPlanVersion,
} from "@/lib/analysis-checklist";
import { SEVEN_K_BUSINESS_LEVERS } from "@/lib/7k-business-levers";
import { growthRole, type GrowthPriorityPlan } from "@/lib/growth-priority-plan";
import { SEVEN_K_ELEMENTS } from "@/server/7k/config/elements.v1";
import type { SevenKElementId } from "@/server/7k/types";

type Props = {
  analysisRunId?: string;
  sourceResultHash: string;
  growthPlan: GrowthPriorityPlan;
  cards: ChecklistCard[];
  managerPlan?: ManagerPlanVersion | null;
  onSaved: (managerPlan: ManagerPlanVersion) => void;
};

function elementName(elementId: SevenKElementId): string {
  return SEVEN_K_ELEMENTS.find((element) => element.id === elementId)?.name ?? elementId;
}

function cloneCards(cards: ChecklistCard[]): ChecklistCard[] {
  return cards.map((card) => ({ ...card, tasks: card.tasks.map((task) => ({ ...task })) }));
}

export function EditablePlanChecklist({
  analysisRunId,
  sourceResultHash,
  growthPlan,
  cards,
  managerPlan,
  onSaved,
}: Props) {
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<ChecklistCard[]>(() => cloneCards(cards));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const updateTask = (cardIndex: number, taskIndex: number, field: "task" | "doneWhen", value: string) => {
    setDraft((current) => current.map((card, currentCardIndex) => currentCardIndex !== cardIndex
      ? card
      : {
          ...card,
          tasks: card.tasks.map((task, currentTaskIndex) => currentTaskIndex === taskIndex
            ? { ...task, [field]: value }
            : task),
        }));
    setMessage(null);
  };

  const addTask = (cardIndex: number) => {
    setDraft((current) => current.map((card, currentCardIndex) => currentCardIndex !== cardIndex
      ? card
      : {
          ...card,
          tasks: [...card.tasks, {
            id: `manager-${crypto.randomUUID()}`,
            source: "manager",
            task: "",
            doneWhen: "",
          }],
        }));
    setMessage(null);
  };

  const removeTask = (cardIndex: number, taskIndex: number) => {
    setDraft((current) => current.map((card, currentCardIndex) => currentCardIndex !== cardIndex
      ? card
      : { ...card, tasks: card.tasks.filter((_, currentTaskIndex) => currentTaskIndex !== taskIndex) }));
    setMessage(null);
  };

  const cancel = () => {
    setDraft(cloneCards(cards));
    setEditingCardIndex(null);
    setMessage(null);
  };

  const save = async () => {
    if (!analysisRunId) return;
    const editedCard = editingCardIndex == null ? null : draft[editingCardIndex];
    if (!editedCard || editedCard.tasks.some((task) => !task.task.trim() || !task.doneWhen.trim())) {
      setMessage("Заполните текст задачи и критерий «Готово, когда».");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/analysis-runs/${analysisRunId}/manager-plan`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceResultHash,
          content: managerPlanContentFromCards(draft),
        }),
      });
      const payload = await response.json() as { managerPlan?: ManagerPlanVersion; message?: string };
      if (!response.ok || !payload.managerPlan) {
        throw new Error(payload.message ?? "Не удалось сохранить изменения.");
      }
      onSaved(payload.managerPlan);
      setEditingCardIndex(null);
      setMessage(`Версия менеджера №${payload.managerPlan.revision} сохранена.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить изменения.");
    } finally {
      setSaving(false);
    }
  };

  const beginEditing = (cardIndex: number) => {
    setDraft(cloneCards(cards));
    setEditingCardIndex(cardIndex);
    setMessage(null);
  };

  return <>
    {message && <p className={`manager-plan-message no-print ${message.includes("сохранена") ? "success" : ""}`} role="status">{message}</p>}
    <div className="route-cards">
      {cards.map((savedCard, cardIndex) => {
        const editing = editingCardIndex === cardIndex;
        const card = editing ? draft[cardIndex] : savedCard;
        const role = growthRole(growthPlan, card.elementId);
        return <article className={editing ? "is-editing" : ""} key={card.elementId}>
          {analysisRunId && !editing && <button
            type="button"
            className="manager-card-edit no-print"
            aria-label={`Редактировать карточку «${elementName(card.elementId)}»`}
            title={managerPlan ? `Редактировать версию менеджера №${managerPlan.revision}` : "Редактировать карточку"}
            onClick={() => beginEditing(cardIndex)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.9 4.1L7.2 19 18.4 7.8a2.1 2.1 0 0 0-3-3Z" /><path d="m13.9 6.3 3.8 3.8" /></svg>
          </button>}
          <header><span>{card.order}</span><div><small>{role}</small><h3>{elementName(card.elementId)}: {card.fromScore} → {card.toScore}</h3><em>{SEVEN_K_BUSINESS_LEVERS[card.elementId]}</em></div></header>
          {card.narrative?.why_now && <p>{card.narrative.why_now}</p>}
          <ol className="route-task-list">{card.tasks.map((task, taskIndex) => <li key={task.id}>
            <i className="route-task-check" aria-hidden="true" />
            {editing ? <div className="manager-task-editor">
              <label><span>Задача</span><textarea rows={2} value={task.task} onChange={(event) => updateTask(cardIndex, taskIndex, "task", event.target.value)} /></label>
              <label><span>Готово, когда</span><textarea rows={2} value={task.doneWhen} onChange={(event) => updateTask(cardIndex, taskIndex, "doneWhen", event.target.value)} /></label>
              {task.source === "manager" && <button type="button" className="manager-task-remove" onClick={() => removeTask(cardIndex, taskIndex)}>Удалить добавленную задачу</button>}
            </div> : <div><strong>{task.task}</strong><span>Готово, когда: {task.doneWhen}</span></div>}
          </li>)}</ol>
          {editing && <div className="manager-card-actions no-print">
            <button type="button" className="manager-task-add" onClick={() => addTask(cardIndex)}>+ Добавить задачу</button>
            <span />
            <button type="button" className="secondary-button compact" onClick={cancel} disabled={saving}>Отменить</button>
            <button type="button" className="primary-button compact" onClick={() => void save()} disabled={saving}>{saving ? "Сохраняю…" : "Сохранить версию"}</button>
          </div>}
        </article>;
      })}
    </div>
  </>;
}
