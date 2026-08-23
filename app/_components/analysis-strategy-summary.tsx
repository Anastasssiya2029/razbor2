"use client";

import type { AnalysisResultV1 } from "@/server/analysis-result";
import { SEVEN_K_ELEMENTS } from "@/server/7k/config/elements.v1";
import type { SevenKElementId } from "@/server/7k/types";

type Props = {
  result: AnalysisResultV1;
  showMoneyNow?: boolean;
  startNumber?: number;
};

function elementName(elementId: SevenKElementId): string {
  return SEVEN_K_ELEMENTS.find((element) => element.id === elementId)?.name ?? elementId;
}

function moneyNowCopy(result: AnalysisResultV1): {
  eyebrow: string;
  headline: string;
  text: string;
  tone: "available" | "guarded";
} {
  const narrative = result.report.moneyNow.narrative ?? result.report.moneyNow.locked_teaser;
  switch (result.moneyNow.status) {
    case "available":
      return {
        eyebrow: "Где деньги сейчас",
        headline: result.report.moneyNow.headline,
        text: narrative,
        tone: "available",
      };
    case "no_eligible_scenario":
      return {
        eyebrow: "Ближайший денежный фокус",
        headline: "Сначала нужно подтвердить рабочую опору",
        text: narrative,
        tone: "guarded",
      };
    case "blocked_insufficient_evidence":
      return {
        eyebrow: "Ближайший денежный фокус",
        headline: "Пока не хватает данных для точного денежного действия",
        text: narrative,
        tone: "guarded",
      };
    case "blocked_inconsistency":
      return {
        eyebrow: "Ближайший денежный фокус",
        headline: "Сначала нужно сверить противоречивые данные",
        text: narrative,
        tone: "guarded",
      };
  }
}

export function AnalysisStrategySummary({ result, showMoneyNow = true, startNumber = 3 }: Props) {
  const bundle = [result.strategy.bundle.priority_element, ...result.strategy.bundle.build_elements]
    .filter((elementId): elementId is SevenKElementId => elementId !== null)
    .filter((elementId, index, all) => all.indexOf(elementId) === index);
  const moneyNow = moneyNowCopy(result);

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

      {result.report.whyNotNow.length > 0 && (
        <section className="result-section why-not-now-section" aria-labelledby="why-not-now-title">
          <div className="result-section-heading">
            <span>{String(startNumber + 1).padStart(2, "0")}</span>
            <div>
              <h2 id="why-not-now-title">Почему не другие элементы</h2>
              <p>К ним вернёмся после того, как появится указанный сигнал.</p>
            </div>
          </div>
          <div className="why-not-now-grid">
            {result.report.whyNotNow.map((item) => (
              <article key={item.element_id}>
                <strong>{elementName(item.element_id)}</strong>
                <p>{item.text}</p>
                {item.return_trigger && <small>Вернуться, когда: {item.return_trigger}</small>}
              </article>
            ))}
          </div>
        </section>
      )}

      {showMoneyNow && (
        <section className={`result-section money-now-summary ${moneyNow.tone}`} aria-labelledby="money-now-title">
          <span className="admin-eyebrow">{moneyNow.eyebrow}</span>
          <h2 id="money-now-title">{moneyNow.headline}</h2>
          <p>{moneyNow.text}</p>
        </section>
      )}
    </div>
  );
}
