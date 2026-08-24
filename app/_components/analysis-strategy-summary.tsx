"use client";

import type { AnalysisResultV1 } from "@/server/analysis-result";
import { SEVEN_K_ELEMENTS } from "@/server/7k/config/elements.v1";
import type { SevenKElementId } from "@/server/7k/types";
import { SEVEN_K_BUSINESS_LEVERS } from "@/lib/7k-business-levers";

type Props = {
  result: AnalysisResultV1;
  startNumber?: number;
};

function elementName(elementId: SevenKElementId): string {
  return SEVEN_K_ELEMENTS.find((element) => element.id === elementId)?.name ?? elementId;
}

export function AnalysisStrategySummary({ result, startNumber = 3 }: Props) {
  const bundle = [result.strategy.bundle.priority_element, ...result.strategy.bundle.build_elements]
    .filter((elementId): elementId is SevenKElementId => elementId !== null)
    .filter((elementId, index, all) => all.indexOf(elementId) === index)
    .slice(0, 3);
  const supporting = SEVEN_K_ELEMENTS
    .map((element) => element.id)
    .filter((elementId) => (
      result.target.targetScores[elementId] > result.current.scores[elementId]
      && !bundle.includes(elementId)
    ));
  const paused = result.report.whyNotNow
    .filter((item) => result.target.targetScores[item.element_id] === result.current.scores[item.element_id])
    .filter((item, index, all) => all.findIndex((candidate) => candidate.element_id === item.element_id) === index);

  return (
    <div className="analysis-strategy-summary">
      <section className="result-section growth-bundle-section" aria-labelledby="growth-bundle-title">
        <div className="result-section-heading">
          <span>{String(startNumber).padStart(2, "0")}</span>
          <div>
            <h2 id="growth-bundle-title">Связка для перехода к денежной цели</h2>
            <p>Эти элементы усиливаются вместе. Остальные не забыты, но сейчас не должны забирать ресурс.</p>
          </div>
        </div>
        <div className="growth-bundle-line" aria-label="Ключевая связка элементов">
          {bundle.map((elementId, index) => (
            <div className="growth-bundle-item" key={elementId}>
              {index > 0 && <span aria-hidden="true">+</span>}
              <article>
                <small>{index === 0 ? "Главный элемент" : "Поддерживающий элемент"}</small>
                <strong>{elementName(elementId)}</strong>
                <em>{result.current.scores[elementId]} → {result.target.targetScores[elementId]}</em>
                <span className="growth-bundle-lever">{SEVEN_K_BUSINESS_LEVERS[elementId]}</span>
              </article>
            </div>
          ))}
        </div>
        <div className="growth-bundle-explanation">
          <span className="admin-eyebrow">Почему именно эта связка</span>
          <h3>{result.report.growthPoint.title}</h3>
          <p>{result.report.growthPoint.coach_explanation}</p>
        </div>
      </section>

      {supporting.length > 0 && (
        <section className="result-section supporting-growth-section" aria-labelledby="supporting-growth-title">
          <div className="result-section-heading">
            <span>{String(startNumber + 1).padStart(2, "0")}</span>
            <div>
              <h2 id="supporting-growth-title">Поддерживающие изменения</h2>
              <p>Их не развиваем отдельными большими проектами: добавляем ровно настолько, насколько нужно основной связке.</p>
            </div>
          </div>
          <div className="supporting-growth-grid">
            {supporting.map((elementId) => (
              <article key={elementId}>
                <strong>{elementName(elementId)}</strong>
                <em>{result.current.scores[elementId]} → {result.target.targetScores[elementId]}</em>
                <p>{SEVEN_K_BUSINESS_LEVERS[elementId]}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {paused.length > 0 && (
        <section className="result-section why-not-now-section" aria-labelledby="why-not-now-title">
          <div className="result-section-heading">
            <span>{String(startNumber + (supporting.length > 0 ? 2 : 1)).padStart(2, "0")}</span>
            <div>
              <h2 id="why-not-now-title">Пока не трогаем как отдельное направление</h2>
              <p>Эти элементы остаются на текущем уровне и не забирают ресурс ближайшего перехода.</p>
            </div>
          </div>
          <div className="why-not-now-grid">
            {paused.map((item) => (
              <article key={item.element_id}>
                <strong>{elementName(item.element_id)}</strong>
                <p>{item.text}</p>
                {item.return_trigger && <small>Вернуться, когда: {item.return_trigger}</small>}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
