import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetDiagnostic, useListAnalysisRuns, useGetAnalysisResult, useGetManagerPlan, useSaveManagerPlan, getGetDiagnosticQueryKey, getListAnalysisRunsQueryKey, getGetAnalysisResultQueryKey, getGetManagerPlanQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { NeuroTransitionScreen } from '@/components/analysis-visualization';
import { useQueryClient } from '@tanstack/react-query';
import { applyManagerPlan, buildCanonicalChecklist, managerPlanContentFromCards, type ChecklistCard } from '@/lib/analysis-checklist';
import { resolveGrowthPriorityPlan, growthRole } from '@/lib/growth-priority-plan';
import { SEVEN_K_BUSINESS_LEVERS } from '@/lib/7k-business-levers';
import { SEVEN_K_ELEMENTS } from '@/lib/server/7k/config/elements.v1';
import type { AnalysisResultV1 } from '@/lib/server/analysis-result-types';
import type { DiagnosticInputV1_2 } from '@/lib/diagnostic-input';
import { hasLiveDiagnosticSession } from '@/lib/live-diagnostic-session';

let managerTaskSeq = 0;
const nextManagerTaskId = () => `manager-${Date.now().toString(36)}${++managerTaskSeq}`;
const elementName = (id: string) => SEVEN_K_ELEMENTS.find((item) => item.id === id)?.name ?? id;
const cloneCards = (cards: ChecklistCard[]) => cards.map((card) => ({ ...card, tasks: card.tasks.map((task) => ({ ...task })) }));

export default function DiagnosticPlanPage() {
  const { id } = useParams<{ id: string }>(); const [location, setLocation] = useLocation(); const { toast } = useToast(); const queryClient = useQueryClient();
  const { data: diagnostic, isLoading: loadingDiagnostic } = useGetDiagnostic(id || '', { query: { enabled: !!id, queryKey: getGetDiagnosticQueryKey(id || '') } });
  const { data: runs, isLoading: loadingRuns } = useListAnalysisRuns(id || '', { query: { enabled: !!id, queryKey: getListAnalysisRunsQueryKey(id || '') } });
  const run = runs?.filter((item) => item.status === 'ready').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const { data: stored, isLoading: loadingResult } = useGetAnalysisResult(run?.id || '', { query: { enabled: !!run, queryKey: getGetAnalysisResultQueryKey(run?.id || '') } });
  const { data: snapshot, isLoading: loadingPlan } = useGetManagerPlan(run?.id || '', { query: { enabled: !!run, queryKey: getGetManagerPlanQueryKey(run?.id || '') } });
  const save = useSaveManagerPlan(); const [cards, setCards] = useState<ChecklistCard[]>([]); const [editing, setEditing] = useState<number | null>(null); const [saveError, setSaveError] = useState<string | null>(null); const init = useRef<string | null>(null);
  // Editing a card means there are local changes not yet persisted. Warn
  // before the tab closes so an edit isn't silently thrown away.
  useEffect(() => {
    if (editing === null) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editing]);
  // In-app navigation (journey buttons, "К разборам") unmounts this page,
  // which used to silently drop any edit that hadn't been saved yet -- ask
  // first so the manager can go back and hit "Сохранить версию" instead.
  const navigateGuarded = (path: string) => {
    if (editing !== null && !window.confirm('Изменения в чек-листе ещё не сохранены. Уйти без сохранения?')) return;
    setLocation(path);
  };
  // Best-effort guard for the browser's own back/forward buttons, which
  // bypass navigateGuarded entirely. If the manager backs out mid-edit and
  // changes their mind, restore the plan URL instead of losing the edit.
  useEffect(() => {
    if (editing === null) return;
    const guardedPath = location;
    const handlePopState = () => {
      if (!window.confirm('Изменения в чек-листе ещё не сохранены. Уйти без сохранения?')) {
        window.history.pushState(null, '', guardedPath);
      } else {
        setEditing(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [editing, location]);
  // Keep the branded "Алекс" transition screen up for a minimum stretch when
  // arriving from step 2 (Разбор), even though the plan data usually loads
  // fast -- otherwise the page would just flash a bare spinner.
  const [minDelayElapsed, setMinDelayElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMinDelayElapsed(true), 1400);
    return () => clearTimeout(timer);
  }, []);
  const result = stored?.result as AnalysisResultV1 | undefined;
  useEffect(() => {
    // Wait for the manager-plan snapshot query to settle before initializing
    // cards -- it resolves independently of (and often slower than) the
    // analysis result, so initializing as soon as `result` arrives could
    // apply an empty snapshot and discard a previously saved plan on reload.
    if (!result || !run || loadingPlan || init.current === run.id) return;
    init.current = run.id;
    const currentWeeklyHours = (diagnostic?.input as DiagnosticInputV1_2 | undefined)?.current?.weeklyHours ?? null;
    setCards(applyManagerPlan(buildCanonicalChecklist(result, currentWeeklyHours), snapshot?.managerPlan as any, snapshot?.sourceResultHash || result.provenance.assemblyInputHash));
  }, [result, run, snapshot, loadingPlan, diagnostic]);
  const update = (cardIndex: number, taskIndex: number, field: 'task' | 'doneWhen', value: string) => setCards((current) => current.map((card, index) => index !== cardIndex ? card : { ...card, tasks: card.tasks.map((task, taskNo) => taskNo === taskIndex ? { ...task, [field]: value } : task) }));
  const addTask = (cardIndex: number) => setCards((current) => current.map((card, index) => index !== cardIndex ? card : { ...card, tasks: [...card.tasks, { id: nextManagerTaskId(), source: 'manager', task: '', doneWhen: '' }] }));
  const removeTask = (cardIndex: number, taskIndex: number) => setCards((current) => current.map((card, index) => index !== cardIndex ? card : { ...card, tasks: card.tasks.filter((_, taskNo) => taskNo !== taskIndex) }));
  const savePlan = () => {
    if (!run || !snapshot || !result || cards.some((card) => card.tasks.some((task) => !task.task.trim() || !task.doneWhen.trim()))) { toast({ title: 'Заполните текст задачи и критерий «Готово, когда».', variant: 'destructive' }); return; }
    setSaveError(null);
    save.mutate({ analysisRunId: run.id, data: { sourceResultHash: snapshot.sourceResultHash, content: managerPlanContentFromCards(cards) } }, {
      onSuccess: () => { toast({ title: 'План сохранен', description: 'Изменения успешно зафиксированы.' }); setEditing(null); setSaveError(null); queryClient.invalidateQueries({ queryKey: getGetManagerPlanQueryKey(run.id) }); },
      // Keep the card in edit mode and show a durable inline error (not just
      // a toast that can be missed) -- the edited text stays visible and
      // unsaved rather than silently reverting if the manager navigates away.
      onError: (error: any) => { const message = error?.message || 'Не удалось сохранить изменения'; setSaveError(message); toast({ title: 'Ошибка сохранения', description: `${message} Изменения не сохранены — карточка остаётся открытой.`, variant: 'destructive' }); },
    });
  };
  if (loadingDiagnostic || loadingRuns || loadingResult || loadingPlan || !minDelayElapsed) {
    return (
      <main className="result-shell">
        <NeuroTransitionScreen
          title="Алекс собирает план перехода"
          detail="Превращаю денежную связку в пошаговый чек-лист действий к цели."
        />
      </main>
    );
  }
  if (!diagnostic || !run || !result || !cards.length) return <main className="result-shell"><section className="result-state"><h1>Разбор пока не готов</h1><button className="admin-button primary" type="button" onClick={() => setLocation(`/diagnostics/${id}`)}>Вернуться в кабинет</button></section></main>;
  const growthPlan = resolveGrowthPriorityPlan(result);
  return <main className="result-shell"><div className="result-view">
    <header className="admin-header no-print"><nav className="admin-actions"><button className="admin-button" type="button" onClick={() => navigateGuarded('/diagnostics')}>К разборам</button></nav></header>
    <section className="result-cover plan-cover"><span className="admin-eyebrow">Персональная стратегия 7К</span><h1>Индивидуальный план системного роста проекта</h1><p>{result.report.opening.headline}</p></section>
    <section className="result-section transition-checklist-section"><div className="result-section-heading"><span>01</span><div><h2>Чек‑лист перехода</h2><p>Карточки расставлены по приоритету. Отмечайте выполненное и переходите к следующему уровню элемента.</p></div></div><div className="route-cards">
      {cards.map((card, cardIndex) => { const isEditing = editing === cardIndex; return <article className={isEditing ? 'is-editing' : ''} key={card.elementId}>{!isEditing && <button className="manager-card-edit no-print" type="button" aria-label={`Редактировать карточку «${elementName(card.elementId)}»`} onClick={() => { setCards(cloneCards(cards)); setSaveError(null); setEditing(cardIndex); }}><svg viewBox="0 0 24 24"><path d="m4 16-.9 4.1L7.2 19 18.4 7.8a2.1 2.1 0 0 0-3-3Z" /><path d="m13.9 6.3 3.8 3.8" /></svg></button>}<header><span>{card.order}</span><div><small>{growthRole(growthPlan, card.elementId)}</small><h3>{elementName(card.elementId)}: {card.fromScore} → {card.toScore}</h3><em>{SEVEN_K_BUSINESS_LEVERS[card.elementId]}</em></div></header>{card.narrative?.why_now && <p>{card.narrative.why_now}</p>}<ol className="route-task-list">{card.tasks.map((task, taskIndex) => <li key={task.id}><i className="route-task-check" />{isEditing ? <div className="manager-task-editor"><label><span>Задача</span><textarea rows={2} value={task.task} onChange={(event) => update(cardIndex, taskIndex, 'task', event.target.value)} /></label><label><span>Готово, когда</span><textarea rows={2} value={task.doneWhen} onChange={(event) => update(cardIndex, taskIndex, 'doneWhen', event.target.value)} /></label>{task.source === 'manager' && <button type="button" className="manager-task-remove" onClick={() => removeTask(cardIndex, taskIndex)}>Удалить добавленную задачу</button>}</div> : <div><strong>{task.task}</strong><span>Готово, когда: {task.doneWhen}</span></div>}</li>)}</ol>{isEditing && <>{saveError && <p className="manager-plan-save-error no-print" role="alert">⚠ Не сохранено: {saveError}</p>}<div className="manager-card-actions no-print"><button className="manager-task-add" type="button" onClick={() => addTask(cardIndex)}>+ Добавить задачу</button><span /><button className="secondary-button compact" type="button" onClick={() => { setEditing(null); setSaveError(null); }}>Отменить</button><button className="primary-button compact" type="button" onClick={savePlan} disabled={save.isPending}>{save.isPending ? 'Сохраняю…' : 'Сохранить версию'}</button></div></>}</article>; })}
    </div></section>
    <nav className="journey saved-result-journey journey-spacious no-print" aria-label="Этапы работы"><button type="button" className="journey-stage" onClick={() => navigateGuarded(`/diagnostics/${id}`)}><span className="journey-number">1</span><span>Диагностика</span></button><button type="button" className="journey-stage" onClick={() => navigateGuarded(hasLiveDiagnosticSession(id || '') ? `/analysis/${id}` : `/diagnostics/${id}/result`)}><span className="journey-number">2</span><span>Разбор</span></button><span className="journey-stage active"><span className="journey-number">3</span><span>План перехода</span></span><button type="button" className="journey-stage" onClick={() => navigateGuarded(`/diagnostics/${id}/gift`)}><span className="journey-number">4</span><span>Колесо возможностей</span></button></nav>
  </div></main>;
}