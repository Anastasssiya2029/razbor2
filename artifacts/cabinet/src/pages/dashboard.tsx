import { useEffect, useMemo, useState } from 'react';
import { useListDiagnostics } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Link } from 'wouter';
import { CabinetNav, CabinetTitleRow } from '@/components/cabinet-header';
import { useAuth } from '@/components/auth-provider';
import { useGetUnlinkedSituationSummaryCost, getGetUnlinkedSituationSummaryCostQueryKey } from '@workspace/api-client-react';
import { CostDetailDialog, formatDurationMs, formatRub } from '@/components/cost-detail-dialog';
import { clearLiveDiagnosticSession } from '@/lib/live-diagnostic-session';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  queued: 'Ожидает запуска',
  scoring: 'AI‑оценка',
  targeting: 'Целевая система',
  strategizing: 'Стратегия',
  resolving_tasks: 'Подбор задач',
  money_now: 'Проверка связности',
  money_now_prescribing: 'Формирование сценария Money Now',
  writing_report: 'Финальный отчёт',
  ready: 'Готов',
  analysis_failed: 'Нужна проверка',
};

function money(value: number | null | undefined): string {
  return value == null ? '—' : `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: diagnostics, isLoading } = useListDiagnostics();
  const [managerFilter, setManagerFilter] = useState('all');
  const [costDetailRunId, setCostDetailRunId] = useState<string | null>(null);
  const isArchitect = user?.role === 'architect';
  const { data: unlinkedCost } = useGetUnlinkedSituationSummaryCost({
    query: { enabled: isArchitect, queryKey: getGetUnlinkedSituationSummaryCostQueryKey() },
  });

  // Reaching "Мои разборы" is the explicit exit from a client's live analysis
  // session, however the manager got here (button, hamburger menu, browser
  // back/forward). After this, that diagnostic's "Разбор" link goes back to
  // showing the saved result instead of the live carousel.
  useEffect(() => {
    clearLiveDiagnosticSession();
  }, []);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayCount = diagnostics?.filter((diagnostic) => (
    format(new Date(diagnostic.createdAt), 'yyyy-MM-dd') === today
  )).length ?? 0;

  const managers = useMemo(() => Array.from(
    new Map((diagnostics ?? [])
      .filter((item) => item.manager)
      .map((item) => [item.manager!.id, item.manager!])).values(),
  ), [diagnostics]);

  const visible = useMemo(() => {
    if (!diagnostics) return [];
    const sorted = [...diagnostics].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return managerFilter === 'all' ? sorted : sorted.filter((item) => item.manager?.id === managerFilter);
  }, [diagnostics, managerFilter]);

  return (
    <main className="admin-shell">
      <CabinetNav />
      <CabinetTitleRow
        eyebrow="Личный кабинет"
        title={user?.role === 'architect' ? 'Панель архитектора' : user?.role === 'admin' ? 'Админ‑панель' : 'Панель менеджера'}
        subtitle={user?.displayName}
      />

      <section className="admin-metrics" aria-label="Статистика">
        <article><span>Всего разборов</span><strong>{diagnostics?.length ?? 0}</strong></article>
        <article><span>Сегодня</span><strong>{todayCount}</strong></article>
        <article><span>Готовы</span><strong>{diagnostics?.filter((item) => item.status === 'ready').length ?? 0}</strong></article>
        {isArchitect && unlinkedCost && unlinkedCost.hasData && (
          <article>
            <span>Незавершённые сверки «Ваша ситуация» ({unlinkedCost.callCount})</span>
            <strong>{formatRub(unlinkedCost.totalCostRub)}</strong>
          </article>
        )}
      </section>

      {user?.role !== 'manager' && managers.length > 1 && (
        <label className="admin-filter">Менеджер:
          <select value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)}>
            <option value="all">Все менеджеры ({diagnostics?.length ?? 0})</option>
            {managers.map((manager) => <option key={manager!.id} value={manager!.id}>{manager!.displayName}</option>)}
          </select>
        </label>
      )}

      <section className="admin-table-card" aria-label="Сохранённые разборы">
        {isLoading ? (
          <p className="admin-empty">Загружаю разборы…</p>
        ) : visible.length === 0 ? (
          <p className="admin-empty">Разборов пока нет. Начните первый разбор.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Дата</th><th>Клиент</th><th>Просмотр</th><th>Ответы</th>
                  <th>Факт, ₽</th><th>Факт, баллы</th><th>Цель, ₽</th><th>Цель, баллы</th>
                  <th>Архетип</th><th>Подарок</th><th>Менеджер</th>
                  {isArchitect && <th>Время расчёта</th>}
                  {isArchitect && <th>Стоимость</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((diagnostic) => {
                  const niche = diagnostic.client?.niche
                    || (diagnostic.input as any)?.identity?.niche
                    || (diagnostic.input as any)?.niche
                    || 'Ниша не указана';
                  return (
                    <tr key={diagnostic.diagnosticId}>
                      <td>{format(new Date(diagnostic.createdAt), 'd MMMM yyyy, HH:mm', { locale: ru })}</td>
                      <td><strong>{diagnostic.client?.displayName || 'Неизвестный клиент'}</strong><small>{niche}</small></td>
                      <td>{diagnostic.status === 'ready'
                        ? <Link className="view-result" href={`/diagnostics/${diagnostic.diagnosticId}/result`} aria-label={`Открыть разбор ${diagnostic.client?.displayName || 'клиента'}`}>◎</Link>
                        : <span className="view-result pending" aria-disabled="true" title="Разбор ещё не готов">◎</span>}</td>
                      <td><a className="download-answers" href={`/api/diagnostics/answers.xlsx?ids=${diagnostic.diagnosticId}`} aria-label={`Скачать ответы клиента ${diagnostic.client?.displayName || 'клиента'} в Excel`}>Excel</a></td>
                      <td>{money(diagnostic.currentRevenueRub)}</td>
                      <td>{diagnostic.currentTotalScore ?? '—'}</td>
                      <td>{money(diagnostic.targetRevenueRub)}</td>
                      <td>{diagnostic.targetTotalScore ?? '—'}</td>
                      <td>{diagnostic.archetype?.name ?? <span className="status-pill">{STATUS_LABELS[diagnostic.status] ?? diagnostic.status}</span>}</td>
                      <td>{diagnostic.gifts && diagnostic.gifts.length > 0
                        ? <div className="gift-cell">{diagnostic.gifts.map((gift) => (
                            <span key={gift.tariff} className="gift-cell-item" title={gift.tariff === 'support' ? 'С сопровождением' : 'Самостоятельный'}>
                              <span className="gift-cell-icon" aria-hidden="true">{gift.tariff === 'support' ? '👥' : '👤'}</span>{gift.label}
                            </span>
                          ))}</div>
                        : '—'}</td>
                      <td>{diagnostic.manager?.displayName ?? 'Не назначен'}</td>
                      {isArchitect && <td>{formatDurationMs(diagnostic.durationMs)}</td>}
                      {isArchitect && (
                        <td>
                          {diagnostic.analysisRunId ? (
                            <button
                              type="button"
                              className="cost-cell-link"
                              onClick={() => setCostDetailRunId(diagnostic.analysisRunId)}
                            >
                              {formatRub(diagnostic.costRub)}
                            </button>
                          ) : (
                            formatRub(diagnostic.costRub)
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isArchitect && (
        <CostDetailDialog analysisRunId={costDetailRunId} onClose={() => setCostDetailRunId(null)} />
      )}
    </main>
  );
}
