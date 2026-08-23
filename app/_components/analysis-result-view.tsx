"use client";

import Image from "next/image";
import type { AnalysisResultV1 } from "@/server/analysis-result";
import { SEVEN_K_ELEMENTS } from "@/server/7k/config/elements.v1";
import { BUSINESS_ARCHETYPE_BY_ID } from "@/server/7k/config/archetypes.v1";
import { ELEMENT_NEUROMARKETERS, NEUROMARKETERS } from "@/lib/neuromarketers";
import { declineRussianNameGenitive } from "@/lib/russian-name";
import { systemScoreTone } from "@/lib/business-analysis";
import type { SevenKElementId } from "@/server/7k/types";

type Props = {
  result: AnalysisResultV1;
  deadlineLabel?: string | null;
  currentRevenueRub?: number | null;
  targetRevenueRub?: number | null;
  view?: "analysis" | "plan" | "full";
};

function money(value: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function ResultSystemModel({ result }: { result: AnalysisResultV1 }) {
  return <div className="result-system-model" aria-label="Целевая конфигурация семи элементов системы">
    {SEVEN_K_ELEMENTS.map((element) => {
      const current = result.current.scores[element.id];
      const target = result.target.targetScores[element.id];
      return <div className="result-model-column" key={element.id}>
        <strong>{current} → {target}</strong>
        <div className="brick-stack" aria-label={`${element.name}: сейчас ${current}, цель ${target}`}>
          {Array.from({ length: 10 }, (_, index) => {
            const level = 10 - index;
            const state = level <= current
              ? `current ${systemScoreTone(current)}`
              : level <= target
                ? "added"
                : "empty";
            return <span className={`system-brick ${state}`} key={level} />;
          })}
        </div>
        <span>{element.displayOrder}</span>
        <small>{element.name}</small>
      </div>;
    })}
  </div>;
}

function elementName(elementId: SevenKElementId): string {
  return SEVEN_K_ELEMENTS.find((element) => element.id === elementId)?.name ?? elementId;
}

export function AnalysisResultView({ result, deadlineLabel, currentRevenueRub, targetRevenueRub, view = "full" }: Props) {
  const clientName = result.clientContext.expertName;
  const clientNameGenitive = clientName ? declineRussianNameGenitive(clientName) : "клиента";
  const targetScores = result.target.targetScores;
  const archetype = BUSINESS_ARCHETYPE_BY_ID[result.archetype.finalArchetype];
  const currentTotal = Object.values(result.current.scores).reduce((sum, score) => sum + score, 0);
  const targetTotal = Object.values(targetScores).reduce((sum, score) => sum + score, 0);
  const buildNow = [result.strategy.bundle.priority_element, ...result.strategy.bundle.build_elements]
    .filter((elementId): elementId is SevenKElementId => elementId !== null);
  const paused = [...result.strategy.bundle.maintain_elements, ...result.strategy.bundle.later_elements.map((item) => item.element_id)]
    .filter((elementId, index, all) => all.indexOf(elementId) === index);
  const pauseReason = new Map<SevenKElementId, string>();
  for (const item of result.strategy.bundle.why_not_now) pauseReason.set(item.element_id, item.reason);
  for (const item of result.strategy.bundle.later_elements) pauseReason.set(item.element_id, item.reason);
  const showAnalysis = view !== "plan";
  const showPlan = view !== "analysis";
  return (
    <div className="result-view">
      {showAnalysis && <section className="result-cover">
        <span className="admin-eyebrow">Персональная стратегия 7К</span>
        <h1>Индивидуальный план системного роста проекта для {clientNameGenitive}</h1>
        {currentRevenueRub != null && targetRevenueRub != null && (
          <strong className="result-transition">
            Переход от {money(currentRevenueRub)} к {money(targetRevenueRub)}{deadlineLabel ? ` за ${deadlineLabel}` : ""}
          </strong>
        )}
        <p>{result.report.opening.headline}</p>
        {deadlineLabel && (currentRevenueRub == null || targetRevenueRub == null) && <strong>Плановый срок: {deadlineLabel}</strong>}
      </section>}

      {showAnalysis && <section className="result-section target-configuration-section">
        <div className="result-section-heading"><span>01</span><div><h2>Целевая конфигурация системы</h2><p>{result.report.targetConfiguration.summary}</p></div></div>
        <div className="configuration-total"><span>Сейчас <strong>{currentTotal}</strong></span><i aria-hidden="true">→</i><span>Целевая конфигурация <strong>{targetTotal}</strong></span></div>
        <ResultSystemModel result={result} />
        <div className="model-legend result-model-legend" aria-label="Обозначения цветов">
          <span><i className="legend-swatch current-swatch" />Текущий уровень</span>
          <span><i className="legend-swatch target-swatch" />Что нужно достроить</span>
          <span><i className="legend-swatch empty-swatch" />Потенциал роста</span>
        </div>
        <p className="target-calculation-note">Целевые баллы рассчитаны программно: система сохраняет уже достигнутый уровень и добавляет только минимумы, необходимые выбранной модели и цели.</p>
        <div className="score-grid">
          {SEVEN_K_ELEMENTS.map((element) => {
            const current = result.current.scores[element.id];
            const target = targetScores[element.id];
            const comment = result.current.current7k[element.id].why_not_higher;
            return <article key={element.id} className="score-card">
              <div><span>{element.displayOrder}</span><strong>{element.name}</strong></div>
              <div className="score-bars" aria-label={`${element.name}: сейчас ${current}, цель ${target}`}>
                <i style={{ width: `${current * 10}%` }} /><b style={{ width: `${target * 10}%` }} />
              </div>
              <p><span>Сейчас <b>{current}</b></span><span>Цель <b>{target}</b></span></p>
              {(comment || result.current.current7k[element.id].cap_reason) && <details className="score-explanation" open>
                <summary>Почему текущий балл не выше</summary>
                {result.current.current7k[element.id].cap_reason && <p>{result.current.current7k[element.id].cap_reason}</p>}
                {comment && <p>{comment}</p>}
              </details>}
            </article>;
          })}
        </div>
        <div className="configuration-decisions">
          <section>
            <span className="admin-eyebrow">Достраиваем сейчас</span>
            <div>{buildNow.map((elementId) => <article key={elementId}><strong>{elementName(elementId)}</strong><small>{result.current.scores[elementId]} → {targetScores[elementId]}</small></article>)}</div>
          </section>
          <section className="configuration-paused">
            <span className="admin-eyebrow">Пока не трогаем</span>
            <div>{paused.map((elementId) => <article key={elementId}><strong>{elementName(elementId)}</strong><small>{pauseReason.get(elementId) ?? "Текущий уровень достаточен для ближайшего перехода."}</small></article>)}</div>
          </section>
        </div>
      </section>}

      {showAnalysis && <section className="result-columns">
        <article className="result-section archetype-card">
          <span className="admin-eyebrow">Архетип</span><h2>{archetype.name}</h2><p>{result.report.archetype.summary}</p>
        </article>
        <article className="result-section focus-card">
          <span className="admin-eyebrow">Главная связка роста</span><h2>{result.report.growthPoint.title}</h2><p>{result.report.growthPoint.coach_explanation}</p>
        </article>
      </section>}

      {showPlan && <section className="result-section transition-checklist-section">
        <div className="result-section-heading"><span>02</span><div><h2>Чек‑лист перехода</h2><p>Двигайтесь по порядку: следующая связка опирается на результат предыдущей.</p></div></div>
        <div className="route-cards">
          {result.route.cards.map((card) => {
            const name = SEVEN_K_ELEMENTS.find((item) => item.id === card.elementId)?.name ?? card.elementId;
            const narrative = result.report.routeCards.find((item) => item.card_id === card.cardId);
            return <article key={card.cardId}>
              <header><span>{card.order}</span><div><small>{card.role === "priority" ? "Главный элемент" : "Поддерживающий элемент"}</small><h3>{name}: {card.fromScore} → {card.toScore}</h3></div></header>
              {narrative?.why_now && <p>{narrative.why_now}</p>}
              <ol>{card.tasks.map((task) => <li key={task.taskId}><strong>{task.task}</strong><span>Готово, когда: {task.doneWhen}</span></li>)}</ol>
            </article>;
          })}
        </div>
      </section>}

      {showPlan && <section className="result-section">
        <div className="result-section-heading"><span>03</span><div><h2>Нейромаркетологи для реализации</h2><p>За каждым элементом закреплён профильный помощник. Для элемента «Команда» используется вся связка.</p></div></div>
        <div className="marketer-grid">
          {SEVEN_K_ELEMENTS.map((element) => <article key={element.id}>
            <h3>{element.name}</h3>
            <div>{ELEMENT_NEUROMARKETERS[element.id].map((marketerId) => {
              const marketer = NEUROMARKETERS[marketerId];
              return <section key={marketerId}><Image src={marketer.image} alt="" width={48} height={48} /><p><strong>{marketer.name}</strong><small>{marketer.description}</small></p></section>;
            })}</div>
          </article>)}
        </div>
      </section>}

      {view === "full" && <section className="result-columns">
        <article className="result-section money-card"><span className="admin-eyebrow">Где деньги сейчас</span><h2>{result.report.moneyNow.headline}</h2><p>{result.report.moneyNow.narrative ?? result.report.moneyNow.locked_teaser}</p></article>
        <article className="result-section focus-card"><span className="admin-eyebrow">Первое действие</span><h2>{result.finalFocus.headline}</h2><p>{result.finalFocus.text}</p><strong>{result.finalFocus.first_action}</strong><small>Сигнал: {result.finalFocus.wait_for_signal}</small></article>
      </section>}
    </div>
  );
}
