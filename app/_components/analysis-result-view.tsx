"use client";

import { useMemo, useState } from "react";
import type { AnalysisResultV1 } from "@/server/analysis-result";
import type { SevenKElementId } from "@/server/7k/types";
import { SEVEN_K_ELEMENTS } from "@/server/7k/config/elements.v1";
import { BUSINESS_ARCHETYPE_BY_ID } from "@/server/7k/config/archetypes.v1";
import { declineRussianNameGenitive } from "@/lib/russian-name";
import { systemScoreTone } from "@/lib/business-analysis";
import { AnalysisStrategySummary } from "@/app/_components/analysis-strategy-summary";
import { resolveGrowthPriorityPlan } from "@/lib/growth-priority-plan";
import { AnalysisPdfView } from "@/app/_components/analysis-pdf-view";
import { EditablePlanChecklist } from "@/app/_components/editable-plan-checklist";
import { PdfDownloadButton } from "@/app/_components/pdf-download-button";
import {
  applyManagerPlan,
  buildCanonicalChecklist,
  type ManagerPlanVersion,
} from "@/lib/analysis-checklist";
import type { AnalysisScoreArgument } from "@/lib/analysis-overview";
import type { SystemElementId } from "@/lib/business-analysis";

type Props = {
  result: AnalysisResultV1;
  analysisRunId?: string;
  initialManagerPlan?: ManagerPlanVersion | null;
  deadlineLabel?: string | null;
  currentRevenueRub?: number | null;
  targetRevenueRub?: number | null;
  scoreArguments?: AnalysisScoreArgument[] | null;
  view?: "analysis" | "plan" | "full";
};

const argumentElementIds: Record<SystemElementId, SevenKElementId> = {
  authenticity: "authenticity",
  audience: "audience",
  products: "product_method",
  sales: "sales_technology",
  funnel: "funnel",
  blog: "blog",
  team: "team",
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

export function AnalysisResultView({ result, analysisRunId, initialManagerPlan, deadlineLabel, currentRevenueRub, targetRevenueRub, scoreArguments, view = "full" }: Props) {
  const clientName = result.clientContext.expertName;
  const clientNameGenitive = clientName ? declineRussianNameGenitive(clientName) : "клиента";
  const targetScores = result.target.targetScores;
  const archetype = BUSINESS_ARCHETYPE_BY_ID[result.archetype.finalArchetype];
  const currentTotal = Object.values(result.current.scores).reduce((sum, score) => sum + score, 0);
  const targetTotal = Object.values(targetScores).reduce((sum, score) => sum + score, 0);
  const scoreArgumentsByElement = useMemo(
    () => new Map((scoreArguments ?? []).map((argument) => [argumentElementIds[argument.id], argument])),
    [scoreArguments],
  );
  const showAnalysis = view !== "plan";
  const showPlan = view !== "analysis";
  const showPlanCover = view === "plan";
  const growthPlan = resolveGrowthPriorityPlan(result);
  const sourceResultHash = result.provenance.assemblyInputHash;
  const canonicalChecklist = useMemo(() => buildCanonicalChecklist(result), [result]);
  const [managerPlan, setManagerPlan] = useState<ManagerPlanVersion | null>(initialManagerPlan ?? null);
  const checklistCards = useMemo(
    () => applyManagerPlan(canonicalChecklist, managerPlan, sourceResultHash),
    [canonicalChecklist, managerPlan, sourceResultHash],
  );
  return (
    <div className="result-view">
      <AnalysisPdfView
        result={result}
        currentRevenueRub={currentRevenueRub}
        targetRevenueRub={targetRevenueRub}
        deadlineLabel={deadlineLabel}
        managerPlan={managerPlan}
      />
      {(showAnalysis || showPlanCover) && <section className={`result-cover ${showPlanCover ? "plan-cover" : ""}`}>
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
        {result.target.modelTransitionNote && <aside className="target-horizon-note">
          <strong>Ближайшая конфигурация, а не далёкий финал</strong>
          <p>{result.target.modelTransitionNote}</p>
        </aside>}
        <div className="score-grid">
          {SEVEN_K_ELEMENTS.map((element) => {
            const current = result.current.scores[element.id];
            const target = targetScores[element.id];
            const argument = scoreArgumentsByElement.get(element.id);
            const comment = result.current.current7k[element.id].why_not_higher;
            return <article key={element.id} className="score-card">
              <div><span>{element.displayOrder}</span><strong>{element.name}</strong></div>
              <div className="score-bars" aria-label={`${element.name}: сейчас ${current}, цель ${target}`}>
                <i style={{ width: `${current * 10}%` }} /><b style={{ width: `${target * 10}%` }} />
              </div>
              <p><span>Сейчас <b>{current}</b></span><span>Цель <b>{target}</b></span></p>
              {(argument || comment || result.current.current7k[element.id].cap_reason) && <details className="score-explanation">
                <summary>Почему выставлен этот балл</summary>
                {argument?.matchedCriterion && <p><b>Критерий уровня:</b> {argument.matchedCriterion}</p>}
                {argument && argument.evidence.length > 0 && <div>
                  <b>Что учтено из ответов:</b>
                  <ul>{argument.evidence.map((fact) => <li key={fact}>{fact}</li>)}</ul>
                </div>}
                {result.current.current7k[element.id].cap_reason && <p>{result.current.current7k[element.id].cap_reason}</p>}
                {(argument?.whyNotHigher || comment) && <p><b>Почему не выше:</b> {argument?.whyNotHigher ?? comment}</p>}
              </details>}
            </article>;
          })}
        </div>
      </section>}

      {showAnalysis && <AnalysisStrategySummary result={result} />}

      {showAnalysis && <section className="result-columns">
        <article className="result-section archetype-card">
          <span className="admin-eyebrow">Бизнес-архетип</span><h2>{archetype.name}</h2><p>{result.report.archetype.summary}</p>
        </article>
        <article className="result-section focus-card">
          <span className="admin-eyebrow">Главная связка роста</span><h2>{result.report.growthPoint.title}</h2><p>{result.report.growthPoint.coach_explanation}</p>
        </article>
      </section>}

      {showPlan && <section className="result-section transition-checklist-section">
        <div className="result-section-heading"><span>{showPlanCover ? "01" : "02"}</span><div><h2>Чек‑лист перехода</h2><p>Карточки расставлены по приоритету. Отмечайте выполненное и переходите к следующему уровню элемента.</p></div></div>
        <EditablePlanChecklist
          analysisRunId={analysisRunId}
          sourceResultHash={sourceResultHash}
          growthPlan={growthPlan}
          cards={checklistCards}
          managerPlan={managerPlan}
          onSaved={setManagerPlan}
        />
      </section>}

      {showPlanCover && <div className="plan-actions result-plan-actions">
        <PdfDownloadButton fileName={`Индивидуальный-план-${clientName || "7К"}`} />
      </div>}

    </div>
  );
}
