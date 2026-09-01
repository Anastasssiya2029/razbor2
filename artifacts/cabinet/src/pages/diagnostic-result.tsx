import { useMemo } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  useGetDiagnostic, useListAnalysisRuns, useGetAnalysisResult, useGetManagerPlan,
  getGetDiagnosticQueryKey, getListAnalysisRunsQueryKey, getGetAnalysisResultQueryKey, getGetManagerPlanQueryKey,
} from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';
import { BUSINESS_ARCHETYPE_BY_ID } from '@/lib/server/7k/config/archetypes.v2';
import { SEVEN_K_ELEMENTS } from '@/lib/server/7k/config/elements.v1';
import { declineRussianNameGenitive } from '@/lib/russian-name';
import { systemScoreTone } from '@/lib/business-analysis';
import { resolveGrowthPriorityPlan } from '@/lib/growth-priority-plan';
import { SEVEN_K_BUSINESS_LEVERS } from '@/lib/7k-business-levers';
import type { AnalysisResultV1 } from '@/lib/server/analysis-result-types';
import { AnalysisPdfView } from '@/components/analysis-pdf-view';
import { PdfDownloadButton } from '@/components/pdf-download-button';
import type { ManagerPlanVersion } from '@/lib/analysis-checklist';

function deadlineLabel(months: number | null): string | null {
  if (months == null) return null;
  if (months % 12 !== 0) return `${months} месяцев`;
  const years = months / 12;
  const suffix = years === 1 ? 'год' : years < 5 ? 'года' : 'лет';
  return `${years} ${suffix}`;
}

function ResultSystemModel({ result }: { result: AnalysisResultV1 }) {
  return <div className="result-system-model" aria-label="Целевая конфигурация семи элементов системы">
    {SEVEN_K_ELEMENTS.map((element) => {
      const current = result.current.scores[element.id]; const target = result.target.targetScores[element.id];
      return <div className="result-model-column" key={element.id}>
        <strong>{current} → {target}</strong><div className="brick-stack" aria-label={`${element.name}: сейчас ${current}, цель ${target}`}>
          {Array.from({ length: 10 }, (_, index) => { const level = 10 - index; const state = level <= current ? `current ${systemScoreTone(current)}` : level <= target ? 'added' : 'empty'; return <span className={`system-brick ${state}`} key={level} />; })}
        </div><span>{element.displayOrder}</span><small>{element.name}</small>
      </div>;
    })}
  </div>;
}

export default function DiagnosticResultPage() {
  const { id } = useParams<{ id: string }>(); const [, setLocation] = useLocation();
  const { data: diagnostic, isLoading: isLoadingDiag } = useGetDiagnostic(id || '', { query: { enabled: !!id, queryKey: getGetDiagnosticQueryKey(id || '') } });
  const { data: runs, isLoading: isLoadingRuns } = useListAnalysisRuns(id || '', { query: { enabled: !!id, queryKey: getListAnalysisRunsQueryKey(id || '') } });
  const latestReadyRun = useMemo(() => runs?.filter((run) => run.status === 'ready').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0], [runs]);
  const { data: stored, isLoading: isLoadingResult } = useGetAnalysisResult(latestReadyRun?.id || '', { query: { enabled: !!latestReadyRun, queryKey: getGetAnalysisResultQueryKey(latestReadyRun?.id || '') } });
  const { data: planSnapshot, isLoading: isLoadingPlan } = useGetManagerPlan(latestReadyRun?.id || '', { query: { enabled: !!latestReadyRun, queryKey: getGetManagerPlanQueryKey(latestReadyRun?.id || '') } });
  if (isLoadingDiag || isLoadingRuns || isLoadingResult || isLoadingPlan) return <main className="result-shell"><div className="result-state"><Loader2 className="animate-spin" /><p>Открываю результат…</p></div></main>;
  if (!diagnostic || !latestReadyRun || !stored) return <main className="result-shell"><section className="result-state"><h1>Разбор пока не готов</h1><button className="admin-button primary" type="button" onClick={() => setLocation(`/diagnostics/${id}`)}>Вернуться в кабинет</button></section></main>;
  const result = stored.result as AnalysisResultV1;
  const clientName = result.clientContext.expertName;
  const clientNameGenitive = clientName ? declineRussianNameGenitive(clientName) : 'клиента';
  const archetype = BUSINESS_ARCHETYPE_BY_ID[result.archetype.finalArchetype];
  const currentTotal = Object.values(result.current.scores).reduce((sum, score) => sum + score, 0);
  const targetTotal = Object.values(result.target.targetScores).reduce((sum, score) => sum + score, 0);
  const priorityPlan = resolveGrowthPriorityPlan(result);
  const paused = result.report.whyNotNow.filter((item) => result.target.targetScores[item.element_id] === result.current.scores[item.element_id]);
  const elementName = (elementId: string) => SEVEN_K_ELEMENTS.find((element) => element.id === elementId)?.name ?? elementId;
  const diagnosticInput = diagnostic.input as {
    current?: { monthlyRevenueRub?: number | null; weeklyHours?: number | null };
    target?: { monthlyRevenueRub?: number | null; deadlineMonths?: number | null };
  } | undefined;
  const deadlineMonths = diagnosticInput?.target?.deadlineMonths ?? null;
  const currentRevenueRub = diagnosticInput?.current?.monthlyRevenueRub ?? null;
  const targetRevenueRub = diagnosticInput?.target?.monthlyRevenueRub ?? null;
  const currentWeeklyHours = diagnosticInput?.current?.weeklyHours ?? null;
  return <main className="result-shell"><div className="result-view">
    <header className="admin-header no-print"><nav className="admin-actions"><button className="admin-button" type="button" onClick={() => setLocation('/diagnostics')}>К разборам</button><PdfDownloadButton fileName={`Индивидуальный-план-${clientName ?? 'Клиент'}`} /></nav></header>
    <section className="result-cover"><span className="admin-eyebrow">Персональная стратегия 7К</span><h1>Индивидуальный план системного роста проекта для {clientNameGenitive}</h1><p>{result.report.opening.headline}</p></section>
    <AnalysisPdfView
      result={result}
      managerPlan={planSnapshot?.managerPlan as ManagerPlanVersion | null | undefined}
      deadlineLabel={deadlineLabel(deadlineMonths)}
      currentRevenueRub={currentRevenueRub}
      targetRevenueRub={targetRevenueRub}
      currentWeeklyHours={currentWeeklyHours}
    />
    <section className="result-section target-configuration-section"><div className="result-section-heading"><span>01</span><div><h2>Целевая конфигурация системы</h2><p>{result.report.targetConfiguration.summary}</p></div></div>
      <div className="configuration-total"><span>Сейчас <strong>{currentTotal}</strong></span><i aria-hidden="true">→</i><span>Целевая конфигурация <strong>{targetTotal}</strong></span></div><ResultSystemModel result={result} />
      <div className="model-legend result-model-legend" aria-label="Обозначения цветов"><span><i className="legend-swatch current-swatch" />Текущий уровень</span><span><i className="legend-swatch target-swatch" />Что нужно достроить</span><span><i className="legend-swatch empty-swatch" />Потенциал роста</span></div>
      <p className="target-calculation-note">Целевые баллы рассчитаны программно: система сохраняет уже достигнутый уровень и добавляет только минимумы, необходимые выбранной модели и цели.</p>
      <div className="score-grid">{SEVEN_K_ELEMENTS.map((element) => { const current = result.current.scores[element.id]; const target = result.target.targetScores[element.id]; return <article key={element.id} className="score-card"><div><span>{element.displayOrder}</span><strong>{element.name}</strong></div><div className="score-bars"><i style={{ width: `${current * 10}%` }} /><b style={{ width: `${target * 10}%` }} /></div><p><span>Сейчас <b>{current}</b></span><span>Цель <b>{target}</b></span></p></article>; })}</div>
    </section>
    <section className="result-section growth-bundle-section"><div className="result-section-heading"><span>03</span><div><h2>Связка для перехода к денежной цели</h2><p>Эти элементы усиливаются вместе. Остальные не забыты, но сейчас не должны забирать ресурс.</p></div></div><div className="growth-priority-groups"><section><h3>Ключевая связка</h3><div className="growth-bundle-line">{priorityPlan.core.map((elementId, index) => <div className="growth-bundle-item" key={elementId}>{index > 0 && <span>+</span>}<article><small>Ключевой элемент</small><h4>{elementName(elementId)}</h4><em>{result.current.scores[elementId]} → {result.target.targetScores[elementId]}</em><span className="growth-bundle-lever">{SEVEN_K_BUSINESS_LEVERS[elementId]}</span></article></div>)}</div></section>{priorityPlan.supporting.length > 0 && <section><h3>Поддерживающие элементы</h3><div className="growth-bundle-line supporting">{priorityPlan.supporting.map((elementId, index) => <div className="growth-bundle-item" key={elementId}>{index > 0 && <span>+</span>}<article><small>Поддерживающий элемент</small><h4>{elementName(elementId)}</h4><em>{result.current.scores[elementId]} → {result.target.targetScores[elementId]}</em><span className="growth-bundle-lever">{SEVEN_K_BUSINESS_LEVERS[elementId]}</span></article></div>)}</div></section>}</div><div className="growth-bundle-explanation"><span className="admin-eyebrow">Почему именно эта связка</span><h3>{result.report.growthPoint.title}</h3><p>{result.report.growthPoint.coach_explanation}</p></div></section>
    {paused.length > 0 && <section className="result-section why-not-now-section"><div className="result-section-heading"><span>04</span><div><h2>Пока не трогаем как отдельное направление</h2><p>Эти элементы остаются на текущем уровне и не забирают ресурс ближайшего перехода.</p></div></div><div className="why-not-now-grid">{paused.map((item) => <article key={item.element_id}><strong>{elementName(item.element_id)}</strong><p>{item.text}</p>{item.return_trigger && <small>Вернуться, когда: {item.return_trigger}</small>}</article>)}</div></section>}
    <section className="result-columns"><article className="result-section archetype-card"><span className="admin-eyebrow">Бизнес-архетип</span><h2>{archetype.name}</h2><p>{result.report.archetype.summary}</p></article><article className="result-section focus-card"><span className="admin-eyebrow">Главная связка роста</span><h2>{result.report.growthPoint.title}</h2><p>{result.report.growthPoint.coach_explanation}</p></article></section>
    <nav className="journey saved-result-journey journey-spacious no-print" aria-label="Этапы работы"><button type="button" className="journey-stage" onClick={() => setLocation(`/diagnostics/${id}`)}><span className="journey-number">1</span><span>Диагностика</span></button><span className="journey-stage active"><span className="journey-number">2</span><span>Разбор</span></span><button type="button" className="journey-stage" onClick={() => setLocation(`/diagnostics/${id}/plan`)}><span className="journey-number">3</span><span>План перехода</span></button><button type="button" className="journey-stage" onClick={() => setLocation(`/diagnostics/${id}/gift`)}><span className="journey-number">4</span><span>Колесо возможностей</span></button></nav>
  </div></main>;
}