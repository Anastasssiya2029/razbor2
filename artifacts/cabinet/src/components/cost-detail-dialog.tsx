import { useGetAnalysisRunCostDetail, getGetAnalysisRunCostDetailQueryKey } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const MODULE_LABELS: Record<string, string> = {
  p01: 'P01 · Оценка доказательств',
  p02: 'P02 · Стратегия перехода',
  p03: 'P03 · Money Now',
  p04: 'P04 · Финальный отчёт',
  situation_summary: 'Сверка «Ваша ситуация»',
};

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null) return 'нет данных';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} мин ${seconds} с` : `${seconds} с`;
}

export function formatRub(value: number | null | undefined): string {
  if (value == null) return 'нет данных';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₽`;
}

function formatUsd(value: number | null | undefined): string {
  if (value == null) return '—';
  return `$${value.toFixed(4)}`;
}

function formatTimestamp(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return format(new Date(value), 'd MMM yyyy, HH:mm:ss', { locale: ru });
}

export function CostDetailDialog({
  analysisRunId,
  onClose,
}: {
  analysisRunId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useGetAnalysisRunCostDetail(analysisRunId ?? '', {
    query: { enabled: Boolean(analysisRunId), queryKey: getGetAnalysisRunCostDetailQueryKey(analysisRunId ?? '') },
  });

  return (
    <Dialog open={Boolean(analysisRunId)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Стоимость и время расчёта</DialogTitle>
          <DialogDescription>
            {analysisRunId ? `Прогон ${analysisRunId}` : ''}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="admin-empty">Загружаю детали…</p>}
        {isError && <p className="admin-empty">Не удалось загрузить детали расчёта.</p>}

        {data && (
          <div className="cost-detail">
            <section className="cost-detail-summary">
              <div><span>Статус</span><strong>{data.status}</strong></div>
              <div><span>Создан</span><strong>{formatTimestamp(data.createdAt)}</strong></div>
              <div><span>Первый вызов</span><strong>{formatTimestamp(data.startedAt)}</strong></div>
              <div><span>Последний вызов</span><strong>{formatTimestamp(data.completedAt)}</strong></div>
              <div><span>Время расчёта</span><strong>{formatDurationMs(data.durationMs)}</strong></div>
              <div><span>Стоимость</span><strong>{formatRub(data.totalCostRub)} {data.totalCostUsd != null ? `(${formatUsd(data.totalCostUsd)})` : ''}</strong></div>
              <div><span>Токены (всего)</span><strong>{data.totalTokens ?? 'нет данных'}</strong></div>
            </section>

            {!data.hasData && (
              <p className="admin-empty">
                Для этого прогона нет данных о реальных вызовах провайдера (например, он выполнялся до включения учёта стоимости).
              </p>
            )}

            {data.modules.map((mod) => (
              <section key={mod.module} className="cost-detail-module">
                <header>
                  <strong>{MODULE_LABELS[mod.module] ?? mod.module}</strong>
                  <span>
                    {mod.attempts.length === 0
                      ? 'нет вызовов'
                      : `${mod.attempts.length} попыт${mod.attempts.length === 1 ? 'ка' : 'ки'}, ${formatRub(mod.totalCostRub)}, ${formatDurationMs(mod.totalDurationMs)}`}
                  </span>
                </header>
                {mod.attempts.length > 0 && (
                  <table className="cost-detail-attempts">
                    <thead>
                      <tr>
                        <th>#</th><th>Модель</th><th>Статус</th><th>Токены</th><th>Стоимость</th><th>Время</th><th>Ошибка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mod.attempts.map((attempt) => (
                        <tr key={attempt.attemptIndex}>
                          <td>{attempt.attemptIndex}</td>
                          <td>{attempt.model}</td>
                          <td>{attempt.status === 'success' ? 'успех' : 'ошибка'}</td>
                          <td>{attempt.totalTokens ?? '—'}</td>
                          <td>{formatUsd(attempt.costUsd)}</td>
                          <td>{(attempt.latencyMs / 1000).toFixed(1)} с</td>
                          <td>
                            {attempt.status === 'error'
                              ? [attempt.errorCode, attempt.httpStatus ? `HTTP ${attempt.httpStatus}` : null, attempt.errorMessage]
                                  .filter(Boolean)
                                  .join(' · ') || '—'
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
