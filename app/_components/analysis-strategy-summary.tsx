"use client";

import type { AnalysisResultV1 } from "@/server/analysis-result";
import { SEVEN_K_ELEMENTS } from "@/server/7k/config/elements.v1";
import type { SevenKElementId } from "@/server/7k/types";
import { SEVEN_K_BUSINESS_LEVERS } from "@/lib/7k-business-levers";
import { resolveGrowthPriorityPlan } from "@/lib/growth-priority-plan";

type Props = {
  result: AnalysisResultV1;
  startNumber?: number;
};

function elementName(elementId: SevenKElementId): string {
  return SEVEN_K_ELEMENTS.find((element) => element.id === elementId)?.name ?? elementId;
}

function compactElementName(elementId: SevenKElementId): string {
  if (elementId === "product_method") return "Продукты и метод";
  if (elementId === "funnel") return "Воронка и связки";
  return elementName(elementId);
}

export function AnalysisStrategySummary({ result, startNumber = 3 }: Props) {
  const priorityPlan = resolveGrowthPriorityPlan(result);
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
        <div className="growth-priority-groups">
          <section aria-labelledby="core-growth-title">
            <h3 id="core-growth-title">Ключевая связка</h3>
            <div className="growth-bundle-line" aria-label="Главные элементы денежной связки">
              {priorityPlan.core.map((elementId, index) => (
                <div className="growth-bundle-item" key={elementId}>
                  {index > 0 && <span aria-hidden="true">+</span>}
                  <article>
                    <small>Ключевой элемент</small>
                    <h4>{compactElementName(elementId)}</h4>
                    <em>{result.current.scores[elementId]} → {result.target.targetScores[elementId]}</em>
                    <span className="growth-bundle-lever">{SEVEN_K_BUSINESS_LEVERS[elementId]}</span>
                  </article>
                </div>
              ))}
            </div>
          </section>
          {priorityPlan.supporting.length > 0 && <section aria-labelledby="supporting-growth-title">
            <h3 id="supporting-growth-title">Поддерживающие элементы</h3>
            <div className="growth-bundle-line supporting" aria-label="Поддерживающие элементы денежной связки">
              {priorityPlan.supporting.map((elementId, index) => (
                <div className="growth-bundle-item" key={elementId}>
                  {index > 0 && <span aria-hidden="true">+</span>}
                  <article>
                    <small>Поддерживающий элемент</small>
                    <h4>{compactElementName(elementId)}</h4>
                    <em>{result.current.scores[elementId]} → {result.target.targetScores[elementId]}</em>
                    <span className="growth-bundle-lever">{SEVEN_K_BUSINESS_LEVERS[elementId]}</span>
                  </article>
                </div>
              ))}
            </div>
          </section>}
        </div>
        <div className="growth-bundle-explanation">
          <span className="admin-eyebrow">Почему именно эта связка</span>
          <h3>{result.report.growthPoint.title}</h3>
          <p>{result.report.growthPoint.coach_explanation}</p>
        </div>
      </section>

      {paused.length > 0 && (
        <section className="result-section why-not-now-section" aria-labelledby="why-not-now-title">
          <div className="result-section-heading">
            <span>{String(startNumber + 1).padStart(2, "0")}</span>
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
