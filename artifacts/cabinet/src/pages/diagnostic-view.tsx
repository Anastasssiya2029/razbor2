import { useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  useGetDiagnostic,
  useListAnalysisRuns,
  useAdvanceAnalysisRun,
  useRetryAnalysisRun,
  useGetAnalysisRun,
  type AnalysisRunStatus,
  getGetDiagnosticQueryKey,
  getListAnalysisRunsQueryKey,
  getGetAnalysisRunQueryKey,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CabinetNav, CabinetTitleRow } from '@/components/cabinet-header';
import { DiagnosticAnswersView } from '@/components/diagnostic-answers-view';
import type { DiagnosticInputV1_2 } from '@/lib/diagnostic-input';
import { hasLiveDiagnosticSession } from '@/lib/live-diagnostic-session';

const TERMINAL_STATUSES: AnalysisRunStatus[] = ['ready', 'analysis_failed'];
const ADVANCE_RETRY_MS = 1200;

// Only these failures can resume the same run (server-side rules in
// reference/server/analysis-runs/pipeline.ts: retryFailedAnalysisPipeline).
// Any other errorCode (e.g. the P-01 evidence-quality gate) is terminal --
// the manager must submit a new, more detailed diagnostic instead.
function isRecoverableFailure(errorCode: string | null | undefined): boolean {
  if (!errorCode) return false;
  if (errorCode === 'P02_NO_ACTIONABLE_TARGET_GAP') return false;
  return errorCode.startsWith('P02_') || errorCode.startsWith('P04_');
}

const STATUS_LABELS: Record<AnalysisRunStatus, string> = {
  draft: 'Черновик',
  queued: 'В очереди',
  scoring: 'Оценка текущего состояния',
  targeting: 'Определение целевой модели',
  strategizing: 'Разработка стратегии перехода',
  resolving_tasks: 'Формирование задач',
  money_now: 'Поиск быстрых денег',
  money_now_prescribing: 'Формирование сценария Money Now',
  writing_report: 'Генерация отчета',
  ready: 'Анализ завершен',
  analysis_failed: 'Ошибка анализа',
};

const STATUS_PROGRESS: Record<AnalysisRunStatus, number> = {
  draft: 0,
  queued: 5,
  scoring: 15,
  targeting: 30,
  strategizing: 45,
  resolving_tasks: 60,
  money_now: 75,
  money_now_prescribing: 85,
  writing_report: 95,
  ready: 100,
  analysis_failed: 0,
};

export default function DiagnosticViewPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: diagnostic, isLoading: isLoadingDiag } = useGetDiagnostic(id || '', { query: { enabled: !!id, queryKey: getGetDiagnosticQueryKey(id || '') } });
  const { data: runs, isLoading: isLoadingRuns, refetch: refetchRuns } = useListAnalysisRuns(id || '', { query: { enabled: !!id, queryKey: getListAnalysisRunsQueryKey(id || '') } });

  const startAnalysis = useAdvanceAnalysisRun();
  const autoAdvance = useAdvanceAnalysisRun();
  const retryFailedRun = useRetryAnalysisRun();

  const latestRun = runs?.length ? [...runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] : null;
  const isTerminal = latestRun?.status === 'ready' || latestRun?.status === 'analysis_failed';

  const { data: liveRun } = useGetAnalysisRun(latestRun?.id || '', {
    query: {
      enabled: !!latestRun && !isTerminal,
      queryKey: getGetAnalysisRunQueryKey(latestRun?.id || ''),
      refetchInterval: (query) => {
        const state = query.state.data;
        return state && ['ready', 'analysis_failed'].includes(state.status) ? false : 2000;
      },
    },
  });

  const activeRun = liveRun || latestRun;

  // The `/run` endpoint advances exactly one resumable pipeline step per call
  // (queued -> scoring -> targeting -> ... -> ready). Once a run has started,
  // this page must keep calling it -- the server never advances on its own,
  // and the polling GET above only observes state, it doesn't progress it.
  const statusRef = useRef<AnalysisRunStatus | undefined>(activeRun?.status);
  statusRef.current = activeRun?.status;
  const isAdvancingRef = useRef(false);

  useEffect(() => {
    const analysisRunId = activeRun?.id;
    if (!analysisRunId) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (cancelled) return;
      const status = statusRef.current;
      if (!status || TERMINAL_STATUSES.includes(status)) return;
      if (isAdvancingRef.current) {
        timeoutId = setTimeout(tick, ADVANCE_RETRY_MS);
        return;
      }
      isAdvancingRef.current = true;
      autoAdvance.mutate({ analysisRunId }, {
        onSettled: () => {
          isAdvancingRef.current = false;
          if (!cancelled) timeoutId = setTimeout(tick, ADVANCE_RETRY_MS);
        },
      });
    };

    tick();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
    // Re-arm whenever the run's status changes (e.g. after a manual retry
    // moves it out of "analysis_failed"), not just when the run id changes.
  }, [activeRun?.id, activeRun?.status]);

  const handleStartAnalysis = async () => {
    if (!diagnostic) return;
    try {
      await startAnalysis.mutateAsync({ analysisRunId: diagnostic.analysisRunId });
      refetchRuns();
      toast({ title: 'Анализ запущен', description: 'Система начала обработку данных.' });
    } catch (err: any) {
      toast({ title: 'Ошибка запуска', description: err.message || 'Не удалось запустить анализ', variant: 'destructive' });
    }
  };

  const handleRetryFailedRun = async () => {
    if (!activeRun) return;
    try {
      await retryFailedRun.mutateAsync({ analysisRunId: activeRun.id });
      refetchRuns();
      toast({ title: 'Анализ возобновлён', description: 'Система продолжает обработку с прерванного этапа.' });
    } catch (err: any) {
      toast({ title: 'Не удалось возобновить', description: err.message || 'Попробуйте ещё раз', variant: 'destructive' });
    }
  };

  if (isLoadingDiag || isLoadingRuns) {
    return <main className="admin-shell"><CabinetNav /><p className="admin-empty">Загружаю диагностику…</p></main>;
  }

  if (!diagnostic) {
    return <main className="admin-shell"><CabinetNav /><p className="admin-empty error">Диагностика не найдена.</p></main>;
  }

  const clientName = diagnostic.client?.displayName || 'Неизвестный клиент';

  const isRunning = activeRun && activeRun.status !== 'ready' && activeRun.status !== 'analysis_failed';
  const isReady = activeRun?.status === 'ready';
  const isFailed = activeRun?.status === 'analysis_failed';

  return (
    <main className="admin-shell">
      <CabinetNav
        extra={
          <>
            <a className="admin-button" href={`/api/diagnostics/answers.xlsx?ids=${diagnostic.diagnosticId}`} download>Экспорт анкеты</a>
            {isReady && (
              <button className="admin-button primary" type="button" onClick={() => setLocation(`/diagnostics/${diagnostic.diagnosticId}/result`)}>
                Смотреть результат
              </button>
            )}
          </>
        }
      />
      <CabinetTitleRow
        eyebrow={format(new Date(diagnostic.createdAt), 'd MMMM yyyy, HH:mm', { locale: ru })}
        title={`Анализ: ${clientName}`}
      />
      <nav className="journey saved-result-journey journey-spacious" aria-label="Этапы работы">
        <span className="journey-stage active"><span className="journey-number">1</span><span>Диагностика</span></span>
        <button type="button" className="journey-stage" disabled={!isReady} onClick={() => setLocation(hasLiveDiagnosticSession(id || '') ? `/analysis/${id}` : `/diagnostics/${id}/result`)}><span className="journey-number">2</span><span>Разбор</span></button>
        <button type="button" className="journey-stage" disabled={!isReady} onClick={() => setLocation(`/diagnostics/${id}/plan`)}><span className="journey-number">3</span><span>План перехода</span></button>
        <button type="button" className="journey-stage" disabled={!isReady} onClick={() => setLocation(`/diagnostics/${id}/gift`)}><span className="journey-number">4</span><span>Колесо возможностей</span></button>
      </nav>

      <section className="result-section">
        <div className="result-section-heading">
          <h2>Анкета диагностики</h2>
          <p>Ответы, полученные от клиента. Форма доступна только для просмотра.</p>
        </div>
        <DiagnosticAnswersView input={diagnostic.input as DiagnosticInputV1_2 | undefined} />
      </section>

      <section className="result-section">
        <div className="result-section-heading">
          <h2>Статус анализа</h2>
          <p>Запустите пайплайн для формирования стратегии и плана.</p>
        </div>

        {!activeRun ? (
          <div className="admin-empty">
            <p>Анализ ещё не запускался.</p>
            <p>Запустите систему для построения 7К-конфигурации, стратегии и подбора Money Now сценария.</p>
            <button className="primary-button compact" type="button" onClick={handleStartAnalysis} disabled={startAnalysis.isPending}>
              {startAnalysis.isPending ? 'Запускаю…' : 'Запустить анализ'}
            </button>
          </div>
        ) : isRunning ? (
          <div className="neuro-status-title-wrap">
            <p className="status-pill">{STATUS_LABELS[activeRun.status]}</p>
            <p className="neuro-status-copy">Это может занять 30–40 секунд…</p>
            <div className="neuro-progress">
              <div style={{ width: `${STATUS_PROGRESS[activeRun.status]}%` }} />
            </div>
          </div>
        ) : isFailed ? (
          <div className="admin-empty error">
            <p>Ошибка при анализе</p>
            <p>Код: {activeRun.errorCode || 'UNKNOWN'}</p>
            <p>{activeRun.errorMessage || 'Неизвестная ошибка'}</p>
            {isRecoverableFailure(activeRun.errorCode) ? (
              <button className="admin-button" type="button" onClick={handleRetryFailedRun} disabled={retryFailedRun.isPending}>
                {retryFailedRun.isPending ? 'Возобновляю…' : 'Повторить запуск'}
              </button>
            ) : (
              <p>Эта ошибка не устраняется повтором — создайте новую диагностику с более подробными ответами.</p>
            )}
          </div>
        ) : isReady ? (
          <div className="admin-empty">
            <p>Анализ успешно завершён.</p>
            <p>Сформирована целевая модель, пошаговая стратегия и план задач.</p>
            <button className="primary-button compact" type="button" onClick={() => setLocation(`/diagnostics/${diagnostic.diagnosticId}/result`)}>
              Перейти к результату →
            </button>
          </div>
        ) : null}
      </section>

    </main>
  );
}
