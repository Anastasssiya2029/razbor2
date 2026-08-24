"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { AppBrand } from "@/app/_components/brand";
import { useAppSession } from "@/app/_components/app-session";
import { AnalysisResultView } from "@/app/_components/analysis-result-view";
import { GiftWheel } from "@/app/_components/gift-wheel";
import type { AnalysisResultV1 } from "@/server/analysis-result";
import type { AnalysisCoverContext } from "@/server/analyses";

function deadlineLabel(months: number | null): string | null {
  if (months == null) return null;
  if (months % 12 !== 0) return `${months} месяцев`;
  const years = months / 12;
  const suffix = years === 1 ? "год" : years < 5 ? "года" : "лет";
  return `${years} ${suffix}`;
}

export default function AnalysisPage({ params }: { params: Promise<{ analysisRunId: string }> }) {
  const { analysisRunId } = use(params);
  const { user, loading: sessionLoading } = useAppSession({ redirectToLogin: true });
  const [result, setResult] = useState<AnalysisResultV1 | null>(null);
  const [cover, setCover] = useState<AnalysisCoverContext | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<1 | 2 | 3>(2);
  useEffect(() => {
    if (!user) return;
    void fetch(`/api/analysis-runs/${analysisRunId}/result`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { result?: AnalysisResultV1; cover?: AnalysisCoverContext | null; message?: string };
        if (!response.ok || !payload.result) throw new Error(payload.message ?? "Результат ещё не готов.");
        setCover(payload.cover ?? null);
        return payload.result;
      })
      .then(setResult)
      .catch((error) => setMessage(error instanceof Error ? error.message : "Результат ещё не готов."));
  }, [analysisRunId, user]);
  if (sessionLoading || !user) return <main className="admin-loading">Проверяю доступ…</main>;
  return <main className="result-shell">
    <header className="admin-header no-print"><AppBrand /><nav className="admin-actions"><Link className="admin-button" href="/cabinet">К разборам</Link>{result && <button className="admin-button primary" type="button" onClick={() => window.print()}>Распечатать / PDF</button>}</nav></header>
    {message ? <section className="result-state"><h1>Разбор пока не готов</h1><p>{message}</p><Link className="admin-button primary" href="/cabinet">Вернуться в кабинет</Link></section> : result ? <>
      {activeStage === 3 ? <GiftWheel analysisRunId={analysisRunId} /> : <AnalysisResultView
        result={result}
        currentRevenueRub={cover?.currentRevenueRub}
        targetRevenueRub={cover?.targetRevenueRub}
        deadlineLabel={deadlineLabel(cover?.deadlineMonths ?? null)}
        view={activeStage === 1 ? "analysis" : "plan"}
      />}
      <nav className="journey saved-result-journey no-print" aria-label="Этапы работы">
        <Link className="journey-stage" href="/">
          <span className="journey-number">1</span><span>Диагностика</span>
        </Link>
        <button type="button" className={`journey-stage ${activeStage === 1 ? "active" : ""}`} aria-current={activeStage === 1 ? "step" : undefined} onClick={() => { setActiveStage(1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <span className="journey-number">2</span><span>Разбор</span>
        </button>
        <button type="button" className={`journey-stage ${activeStage === 2 ? "active" : ""}`} aria-current={activeStage === 2 ? "step" : undefined} onClick={() => { setActiveStage(2); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <span className="journey-number">3</span><span>План перехода</span>
        </button>
        <button type="button" className={`journey-stage ${activeStage === 3 ? "active" : ""}`} aria-current={activeStage === 3 ? "step" : undefined} onClick={() => { setActiveStage(3); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="Бонусный этап">
          <span className="journey-number">4</span><span />
        </button>
      </nav>
    </> : <section className="result-state"><h1>Открываю результат…</h1></section>}
  </main>;
}
