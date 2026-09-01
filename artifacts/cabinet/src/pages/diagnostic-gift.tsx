import { useLocation, useParams } from 'wouter';
import { useGetDiagnostic, useListAnalysisRuns, getGetDiagnosticQueryKey, getListAnalysisRunsQueryKey } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';
import { GiftWheel } from '@/components/gift-wheel';
import { useAuth } from '@/components/auth-provider';
import { hasLiveDiagnosticSession } from '@/lib/live-diagnostic-session';

export default function DiagnosticGiftPage() {
  const { id } = useParams<{ id: string }>(); const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: diagnostic, isLoading: loadingDiagnostic } = useGetDiagnostic(id || '', { query: { enabled: !!id, queryKey: getGetDiagnosticQueryKey(id || '') } });
  const { data: runs, isLoading: loadingRuns } = useListAnalysisRuns(id || '', { query: { enabled: !!id, queryKey: getListAnalysisRunsQueryKey(id || '') } });
  const run = runs?.filter((item) => item.status === 'ready').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const canDrawGift = Boolean(user && run && user.id === run.ownerUserId);
  if (loadingDiagnostic || loadingRuns) return <main className="result-shell"><div className="result-state"><Loader2 className="animate-spin" /></div></main>;
  if (!diagnostic || !run) return <main className="result-shell"><section className="result-state"><h1>Разбор пока не готов</h1><button className="admin-button primary" type="button" onClick={() => setLocation(`/diagnostics/${id}`)}>Вернуться в кабинет</button></section></main>;
  return <main className="result-shell"><div className="result-view">
    <header className="admin-header no-print"><nav className="admin-actions"><button className="admin-button" type="button" onClick={() => setLocation('/diagnostics')}>К разборам</button></nav></header>
    <GiftWheel analysisRunId={run.id} canDraw={canDrawGift} />
    <nav className="journey saved-result-journey journey-spacious no-print" aria-label="Этапы работы"><button type="button" className="journey-stage" onClick={() => setLocation(`/diagnostics/${id}`)}><span className="journey-number">1</span><span>Диагностика</span></button><button type="button" className="journey-stage" onClick={() => setLocation(hasLiveDiagnosticSession(id || '') ? `/analysis/${id}` : `/diagnostics/${id}/result`)}><span className="journey-number">2</span><span>Разбор</span></button><button type="button" className="journey-stage" onClick={() => setLocation(`/diagnostics/${id}/plan`)}><span className="journey-number">3</span><span>План перехода</span></button><span className="journey-stage active"><span className="journey-number">4</span><span>Колесо возможностей</span></span></nav>
  </div></main>;
}
