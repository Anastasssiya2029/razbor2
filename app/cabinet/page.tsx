"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppBrand } from "@/app/_components/brand";
import { logoutAndRedirect, useAppSession } from "@/app/_components/app-session";
import type { AnalysisListItem } from "@/server/analyses";

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  queued: "Ожидает запуска",
  scoring: "AI‑оценка",
  targeting: "Целевая система",
  strategizing: "Стратегия",
  resolving_tasks: "Подбор задач",
  money_now: "Денежные действия",
  writing_report: "Финальный отчёт",
  ready: "Готов",
  analysis_failed: "Нужна проверка",
};

function money(value: number | null) {
  return value == null ? "—" : `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function date(value: string) {
  const parsed = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" }).format(parsed);
}

export default function CabinetPage() {
  const { user, loading: sessionLoading } = useAppSession({ redirectToLogin: true });
  const [analyses, setAnalyses] = useState<AnalysisListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managerFilter, setManagerFilter] = useState("all");

  useEffect(() => {
    if (!user) return;
    void fetch("/api/analyses", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось загрузить разборы.");
        return response.json() as Promise<{ analyses: AnalysisListItem[] }>;
      })
      .then((result) => setAnalyses(result.analyses))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Не удалось загрузить разборы."))
      .finally(() => setLoading(false));
  }, [user]);

  const managers = useMemo(() => Array.from(new Map(analyses.map((item) => [item.manager.id ?? item.manager.name, item.manager])).values()), [analyses]);
  const visible = useMemo(() => managerFilter === "all" ? analyses : analyses.filter((item) => (item.manager.id ?? item.manager.name) === managerFilter), [analyses, managerFilter]);
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = analyses.filter((item) => item.createdAt.slice(0, 10) === today).length;

  if (sessionLoading || !user) return <main className="admin-loading">Загружаю кабинет…</main>;

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <AppBrand />
        <nav className="admin-actions" aria-label="Действия кабинета">
          <Link className="admin-button primary" href="/">Новый разбор</Link>
          <a className="admin-button" href="/api/exports/analyses.xls">Выгрузить Excel</a>
          {user.role !== "manager" && <Link className="admin-button" href="/team">Менеджеры</Link>}
          <button className="admin-button danger" type="button" onClick={() => void logoutAndRedirect()}>Выйти</button>
        </nav>
      </header>
      <section className="admin-title-row">
        <div><span className="admin-eyebrow">Личный кабинет</span><h1>{user.role === "architect" ? "Панель архитектора" : user.role === "admin" ? "Админ‑панель" : "Мои разборы"}</h1><p>{user.displayName}</p></div>
      </section>
      <section className="admin-metrics" aria-label="Статистика">
        <article><span>Всего разборов</span><strong>{analyses.length}</strong></article>
        <article><span>Сегодня</span><strong>{todayCount}</strong></article>
        <article><span>Готовы</span><strong>{analyses.filter((item) => item.resultReady).length}</strong></article>
      </section>
      {user.role !== "manager" && managers.length > 1 && (
        <label className="admin-filter">Менеджер:
          <select value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)}>
            <option value="all">Все менеджеры ({analyses.length})</option>
            {managers.map((manager) => <option key={manager.id ?? manager.name} value={manager.id ?? manager.name}>{manager.name}</option>)}
          </select>
        </label>
      )}
      <section className="admin-table-card" aria-label="Сохранённые разборы">
        {loading ? <p className="admin-empty">Загружаю разборы…</p> : error ? <p className="admin-empty error">{error}</p> : visible.length === 0 ? <p className="admin-empty">Разборов пока нет. Начните первый разбор.</p> : (
          <div className="admin-table-scroll"><table className="admin-table">
            <thead><tr><th>Дата</th><th>Клиент</th><th>Просмотр</th><th>Факт, ₽</th><th>Факт, баллы</th><th>Цель, ₽</th><th>Цель, баллы</th><th>Архетип</th><th>Подарок</th><th>Менеджер</th></tr></thead>
            <tbody>{visible.map((item) => <tr key={item.analysisRunId}>
              <td>{date(item.createdAt)}</td>
              <td><strong>{item.client.name}</strong>{item.client.niche && <small>{item.client.niche}</small>}</td>
              <td><Link className={`view-result ${item.resultReady ? "" : "pending"}`} href={`/analysis/${item.analysisRunId}`} aria-label={`Открыть разбор ${item.client.name}`}>◎</Link></td>
              <td>{money(item.currentRevenueRub)}</td><td>{item.currentTotalScore ?? "—"}</td>
              <td>{money(item.targetRevenueRub)}</td><td>{item.targetTotalScore ?? "—"}</td>
              <td>{item.archetype?.name ?? <span className="status-pill">{STATUS_LABELS[item.status] ?? item.status}</span>}</td>
              <td>{item.gift ?? "—"}</td><td>{item.manager.name}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
    </main>
  );
}
