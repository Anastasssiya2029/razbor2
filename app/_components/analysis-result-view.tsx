"use client";

import type { AnalysisResultV1 } from "@/server/analysis-result";
import { SEVEN_K_ELEMENTS } from "@/server/7k/config/elements.v1";
import { BUSINESS_ARCHETYPE_BY_ID } from "@/server/7k/config/archetypes.v1";
import { ELEMENT_NEUROMARKETERS, NEUROMARKETERS } from "@/lib/neuromarketers";

type Props = {
  result: AnalysisResultV1;
  deadlineLabel?: string | null;
  currentRevenueRub?: number | null;
  targetRevenueRub?: number | null;
};

function money(value: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

export function AnalysisResultView({ result, deadlineLabel, currentRevenueRub, targetRevenueRub }: Props) {
  const clientName = result.clientContext.expertName ?? "клиента";
  const targetScores = result.target.targetScores;
  const archetype = BUSINESS_ARCHETYPE_BY_ID[result.archetype.finalArchetype];
  return (
    <div className="result-view">
      <section className="result-cover">
        <span className="admin-eyebrow">Персональная стратегия 7К</span>
        <h1>Индивидуальный план системного роста проекта для {clientName}</h1>
        {currentRevenueRub != null && targetRevenueRub != null && (
          <strong className="result-transition">
            Переход от {money(currentRevenueRub)} к {money(targetRevenueRub)}{deadlineLabel ? ` за ${deadlineLabel}` : ""}
          </strong>
        )}
        <p>{result.report.opening.headline}</p>
        {deadlineLabel && (currentRevenueRub == null || targetRevenueRub == null) && <strong>Плановый срок: {deadlineLabel}</strong>}
      </section>

      <section className="result-section">
        <div className="result-section-heading"><span>01</span><div><h2>Целевая конфигурация системы</h2><p>{result.report.targetConfiguration.summary}</p></div></div>
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
              {comment && <small className="score-comment">{comment}</small>}
            </article>;
          })}
        </div>
      </section>

      <section className="result-section">
        <div className="result-section-heading"><span>03</span><div><h2>Нейромаркетологи для реализации</h2><p>За каждым элементом закреплён профильный помощник. Для элемента «Команда» используется вся связка.</p></div></div>
        <div className="marketer-grid">
          {SEVEN_K_ELEMENTS.map((element) => <article key={element.id}>
            <h3>{element.name}</h3>
            <div>{ELEMENT_NEUROMARKETERS[element.id].map((marketerId) => {
              const marketer = NEUROMARKETERS[marketerId];
              return <section key={marketerId}><span aria-hidden="true">{marketer.name.slice(0, 1)}</span><p><strong>{marketer.name}</strong><small>{marketer.description}</small></p></section>;
            })}</div>
          </article>)}
        </div>
      </section>

      <section className="result-columns">
        <article className="result-section archetype-card">
          <span className="admin-eyebrow">Архетип</span><h2>{archetype.name}</h2><p>{result.report.archetype.summary}</p>
        </article>
        <article className="result-section focus-card">
          <span className="admin-eyebrow">Главная связка роста</span><h2>{result.report.growthPoint.title}</h2><p>{result.report.growthPoint.coach_explanation}</p>
        </article>
      </section>

      <section className="result-section">
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
      </section>

      <section className="result-columns">
        <article className="result-section money-card"><span className="admin-eyebrow">Где деньги сейчас</span><h2>{result.report.moneyNow.headline}</h2><p>{result.report.moneyNow.narrative ?? result.report.moneyNow.locked_teaser}</p></article>
        <article className="result-section focus-card"><span className="admin-eyebrow">Первое действие</span><h2>{result.finalFocus.headline}</h2><p>{result.finalFocus.text}</p><strong>{result.finalFocus.first_action}</strong><small>Сигнал: {result.finalFocus.wait_for_signal}</small></article>
      </section>
    </div>
  );
}
