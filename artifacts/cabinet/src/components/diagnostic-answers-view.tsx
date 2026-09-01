// Read-only presentation of a saved diagnostic's answers, reusing the exact
// tab/field layout and CSS classes from the intake form (diagnostic-new.tsx)
// so a manager revisiting step 1 sees "the same interface" with the same
// entered text, instead of a status summary.
import { useState } from "react";
import type { DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import { formatRubles } from "@/lib/diagnostic-form";

const tabs = [
  { id: 0, label: "Сейчас и цель" },
  { id: 1, label: "Инфо о проекте" },
  { id: 2, label: "Опыт" },
];

function deadlineMonthsLabel(months: number | null): string {
  if (months == null) return "—";
  const fixed: Record<number, string> = { 6: "6 месяцев", 12: "1 год", 24: "2 года", 36: "3 года" };
  if (fixed[months]) return fixed[months];
  if (months % 12 === 0) {
    const years = months / 12;
    const suffix = years === 1 ? "год" : years < 5 ? "года" : "лет";
    return `${years} ${suffix}`;
  }
  return `${months} месяцев`;
}

function ReadOnlyField({
  label,
  value,
  multiline = false,
  rows = 2,
  className = "",
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
  rows?: number;
  className?: string;
}) {
  return (
    <label className={`field ${multiline ? "multiline-field" : ""} ${className}`}>
      <span>{label}</span>
      <textarea value={value || "—"} readOnly rows={multiline ? rows : 1} />
    </label>
  );
}

export function DiagnosticAnswersView({ input }: { input: DiagnosticInputV1_2 | null | undefined }) {
  const [activeTab, setActiveTab] = useState(0);

  if (!input) {
    return <p className="admin-empty">Анкета ещё не заполнена.</p>;
  }

  const { current, target, project, experience, identity } = input;

  return (
    <section className="diagnostic-card diagnostic-answers-view" aria-label="Анкета диагностики">
      <div className="identity-grid">
        <label className="identity-field">
          <span className="sr-only">Имя эксперта</span>
          <textarea rows={1} value={identity.expertName || ""} readOnly placeholder="ИМЯ ЭКСПЕРТА" />
        </label>
        <label className="identity-field">
          <span className="sr-only">Ниша</span>
          <textarea rows={1} value={identity.niche || ""} readOnly placeholder="НИША" />
        </label>
      </div>

      <div className="tabs" role="tablist" aria-label="Этапы анкеты">
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`view-panel-${tab.id}`}
            id={`view-tab-${tab.id}`}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-number">{tab.id + 1}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 0 && (
          <div id="view-panel-0" role="tabpanel" aria-labelledby="view-tab-0" className="panel panel-now">
            <section className="form-section current-section">
              <h2>1. СЕЙЧАС</h2>
              <div className="current-grid">
                <div className="current-fields">
                  <ReadOnlyField label="Доход в месяц" value={formatRubles(current.monthlyRevenueRub, "—")} />
                  <ReadOnlyField
                    label="Количество клиентов"
                    value={current.payingClientsCount != null ? String(current.payingClientsCount) : "—"}
                  />
                  <fieldset className="choice-fieldset clients-period-fieldset">
                    <legend>Количество указано</legend>
                    <div className="clients-period-options">
                      <button type="button" className={current.clientsCountPeriod === "month" ? "selected" : ""} disabled aria-pressed={current.clientsCountPeriod === "month"}>За месяц</button>
                      <button type="button" className={current.clientsCountPeriod === "launch" ? "selected" : ""} disabled aria-pressed={current.clientsCountPeriod === "launch"}>За запуск</button>
                    </div>
                  </fieldset>
                  <ReadOnlyField
                    label="Время на проект в неделю"
                    value={current.weeklyHours != null ? String(current.weeklyHours) : "—"}
                  />
                </div>
                <div className="products-box">
                  <h3>Продукты</h3>
                  <ReadOnlyField label="Какие продукты продаёте" value={current.products} />
                  <ReadOnlyField label="Что чаще покупают" value={current.bestSeller} />
                  <ReadOnlyField label="Есть ли бесплатные продукты" value={current.freeProducts} />
                </div>
              </div>
            </section>
            <section className="form-section goal-section">
              <h2>2. ЦЕЛЬ</h2>
              <div className="goal-top-grid">
                <ReadOnlyField label="Доход в месяц" value={formatRubles(target.monthlyRevenueRub, "—")} />
                <ReadOnlyField label="На чём хотите зарабатывать (модель)" value={target.businessModel} />
              </div>
              <fieldset className="choice-fieldset deadline-fieldset">
                <legend>Срок</legend>
                <div className="deadline-options">
                  <button type="button" className="selected" disabled>{deadlineMonthsLabel(target.deadlineMonths)}</button>
                </div>
              </fieldset>
              <div className="goal-bottom-grid">
                <ReadOnlyField label="Что хотите делегировать" value={target.delegation} />
                {target.desiredSystemWeeklyHours != null && (
                  <ReadOnlyField label="Время на проект (система есть)" value={String(target.desiredSystemWeeklyHours)} />
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 1 && (
          <div id="view-panel-1" role="tabpanel" aria-labelledby="view-tab-1" className="panel project-panel">
            <section className="form-section project-section">
              <h2>2. ИНФО О ПРОЕКТЕ</h2>
              <div className="project-grid">
                <div className="project-column">
                  <ReadOnlyField label="Кто клиенты" value={project.clients} multiline rows={2} />
                  <ReadOnlyField label="Результат" value={project.result} multiline rows={2} />
                  <ReadOnlyField label="Откуда приходят" value={project.sources} />
                  <ReadOnlyField className="client-path-field" label="Путь клиента" value={project.clientPath} multiline rows={3} />
                  <ReadOnlyField label="Продажи" value={project.sales} />
                </div>
                <div className="project-column project-assets-column">
                  <ReadOnlyField label="Социальные активы" value={project.socialAssets} multiline rows={3} />
                  <ReadOnlyField label="Команда" value={project.team} multiline rows={3} />
                  <ReadOnlyField label="Уникальность" value={project.uniqueness} multiline rows={3} />
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 2 && (
          <div id="view-panel-2" role="tabpanel" aria-labelledby="view-tab-2" className="panel experience-panel">
            <section className="form-section experience-section">
              <h2>3. ОПЫТ</h2>
              <div className="experience-grid">
                <ReadOnlyField className="experience-main-field" label="Трудности" value={experience.struggles} multiline rows={1} />
                <div className="experience-history-column">
                  <ReadOnlyField label="Лучший период" value={experience.bestPeriod} multiline rows={5} />
                  <ReadOnlyField label="Ошибки и провалы" value={experience.failures} multiline rows={5} />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </section>
  );
}
