"use client";

import { useMemo, useState } from "react";

type FieldProps = {
  label: string;
  name: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

const tabs = [
  { id: 0, label: "Сейчас и цель" },
  { id: 1, label: "Инфо о проекте" },
  { id: 2, label: "Опыт" },
];

const stages = ["Диагностика", "Разбор", "План перехода", "Рост и система"];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="arrow-icon">
      <path d="M5 12h14M14 6l6 6-6 6" />
    </svg>
  );
}

function PersonalityIcon({ type }: { type: "introvert" | "ambivert" | "extrovert" }) {
  if (type === "extrovert") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="personality-icon">
        <path d="m12 2.8 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.6-5 2.6 1-5.6-4.1-4 5.6-.8L12 2.8Z" />
      </svg>
    );
  }

  if (type === "ambivert") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="personality-icon">
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="8" r="3" />
        <path d="M2.8 20v-1.8A5.2 5.2 0 0 1 8 13h1M21.2 20v-1.8A5.2 5.2 0 0 0 16 13h-1M7 20v-1.2A5.8 5.8 0 0 1 12.8 13h0a5.8 5.8 0 0 1 5.8 5.8V20" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="personality-icon">
      <circle cx="12" cy="7" r="4" />
      <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
    </svg>
  );
}

function Field({
  label,
  name,
  multiline = false,
  rows = 2,
  className = "",
  values,
  setValues,
}: FieldProps) {
  const id = `field-${name}`;
  const shared = {
    id,
    name,
    value: values[name] ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((current) => ({ ...current, [name]: event.target.value })),
  };

  return (
    <label className={`field ${multiline ? "multiline-field" : ""} ${className}`} htmlFor={id}>
      <span>{label}</span>
      <textarea {...shared} rows={multiline ? rows : 1} />
    </label>
  );
}

function Brand() {
  return (
    <div className="brand" aria-label="Школа аутентичного маркетинга Сухаревой Анастасии">
      <div className="brand-line">
        <strong>Школа</strong>
        <span className="brand-heart">♥</span>
        <strong>аутентичного</strong>
        <span className="brand-mark">▼</span>
        <strong>маркетинга</strong>
      </div>
      <span className="brand-caption">СУХАРЕВОЙ АНАСТАСИИ</span>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [deadline, setDeadline] = useState("6 месяцев");
  const [personality, setPersonality] = useState("Амбиверт");
  const [confirmed, setConfirmed] = useState(false);

  const formula = useMemo(() => {
    const goal = values.goalIncome?.trim() || "_____";
    const model = values.goalModel?.trim() || "_____";
    const now = values.currentIncome?.trim() || "_____";
    const struggles = values.struggles?.trim() || "_____, _____ и _____";
    const experience = values.experience?.trim() || "_____";
    return `Вы хотите прийти к ${goal}, выстроив такую модель бизнеса: ${model}. Сейчас у вас ${now}, а основными препятствиями выглядят ${struggles}. До этого вы пробовали ${experience}, но устойчивого результата не получили.`;
  }, [values]);

  const goToTab = (tab: number) => {
    setActiveTab(tab);
    setConfirmed(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="site-shell">
      <header className="site-header">
        <Brand />
        <span className="system-label">Система пошагового роста</span>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <span className="hero-badge">Авторский разбор для экспертов</span>
        <h1 id="page-title">Твоя Бизнес-Система</h1>
        <p>
          Оцифруйте свой проект и постройте аутентичную систему, которая
          <br className="desktop-break" /> дает ресурсы, а не забирает их.
        </p>
      </section>

      <section className="diagnostic-card" aria-label="Диагностика бизнес-системы">
        <div className="identity-grid">
          <label className="identity-field">
            <span className="sr-only">Имя эксперта</span>
            <textarea
              rows={1}
              value={values.expertName ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, expertName: event.target.value }))}
              placeholder="ИМЯ ЭКСПЕРТА"
            />
          </label>
          <label className="identity-field">
            <span className="sr-only">Ниша</span>
            <textarea
              rows={1}
              value={values.niche ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, niche: event.target.value }))}
              placeholder="НИША"
            />
          </label>
        </div>

        <div className="tabs" role="tablist" aria-label="Этапы первого шага">
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              className={`tab ${activeTab === tab.id ? "active" : ""}`}
              key={tab.id}
              onClick={() => goToTab(tab.id)}
            >
              <span className="tab-number">{tab.id + 1}</span>
              <span>{tab.id + 1}. {tab.label}</span>
            </button>
          ))}
        </div>

        <div className="tab-content">
          {activeTab === 0 && (
            <div id="panel-0" role="tabpanel" aria-labelledby="tab-0" className="panel panel-now">
              <section className="form-section current-section">
                <h2>1. СЕЙЧАС</h2>
                <div className="current-grid">
                  <div className="current-fields">
                    <Field label="Доход в месяц" name="currentIncome" values={values} setValues={setValues} />
                    <Field label="Количество клиентов" name="clientsCount" values={values} setValues={setValues} />
                    <Field label="Время на проект в неделю" name="weeklyTime" values={values} setValues={setValues} />
                  </div>
                  <div className="products-box">
                    <h3>Продукты</h3>
                    <Field label="Какие продукты продаёте" name="products" values={values} setValues={setValues} />
                    <Field label="Что чаще покупают" name="bestSeller" values={values} setValues={setValues} />
                    <Field label="Есть ли бесплатные продукты" name="freeProducts" values={values} setValues={setValues} />
                  </div>
                </div>
              </section>

              <section className="form-section goal-section">
                <h2>2. ЦЕЛЬ</h2>
                <div className="goal-top-grid">
                  <Field label="Доход в месяц" name="goalIncome" values={values} setValues={setValues} />
                  <Field label="На чём хотите зарабатывать (модель)" name="goalModel" values={values} setValues={setValues} />
                </div>
                <fieldset className="choice-fieldset deadline-fieldset">
                  <legend>Срок</legend>
                  <div className="deadline-options">
                    {["6 месяцев", "1 год", "2 года", "3 года"].map((option) => (
                      <button
                        type="button"
                        key={option}
                        className={deadline === option ? "selected" : ""}
                        aria-pressed={deadline === option}
                        onClick={() => setDeadline(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="goal-bottom-grid">
                  <Field label="Что хотите делегировать" name="delegate" values={values} setValues={setValues} />
                  <Field label="Время на проект (рост)" name="growthTime" values={values} setValues={setValues} />
                  <Field label="Время на проект (система есть)" name="systemTime" values={values} setValues={setValues} />
                </div>
              </section>

              <button type="button" className="primary-button" onClick={() => goToTab(1)}>
                Заполнить инфо о проекте <ArrowIcon />
              </button>
            </div>
          )}

          {activeTab === 1 && (
            <div id="panel-1" role="tabpanel" aria-labelledby="tab-1" className="panel project-panel">
              <section className="form-section project-section">
                <h2>2. ИНФО О ПРОЕКТЕ</h2>
                <div className="project-grid">
                  <div className="project-column">
                    <Field label="Кто клиенты" name="clients" multiline rows={2} values={values} setValues={setValues} />
                    <Field label="Результат" name="result" multiline rows={2} values={values} setValues={setValues} />
                    <Field label="Откуда приходят" name="sources" values={values} setValues={setValues} />
                    <Field label="Путь клиента" name="clientPath" values={values} setValues={setValues} />
                    <Field label="Продажи" name="sales" values={values} setValues={setValues} />
                  </div>
                  <div className="project-column">
                    <Field label="Блог" name="blog" multiline rows={3} values={values} setValues={setValues} />
                    <Field label="Команда" name="team" multiline rows={3} values={values} setValues={setValues} />
                    <Field label="Уникальность" name="uniqueness" multiline rows={3} values={values} setValues={setValues} />
                  </div>
                </div>
                <fieldset className="choice-fieldset personality-fieldset">
                  <legend className="sr-only">Тип личности</legend>
                  {["Интроверт", "Амбиверт", "Экстраверт"].map((option, index) => {
                    const iconTypes = ["introvert", "ambivert", "extrovert"] as const;
                    return (
                      <button
                        type="button"
                        key={option}
                        className={personality === option ? "selected" : ""}
                        aria-pressed={personality === option}
                        onClick={() => setPersonality(option)}
                      >
                        <PersonalityIcon type={iconTypes[index]} />
                        {option}
                      </button>
                    );
                  })}
                </fieldset>
              </section>

              <button type="button" className="primary-button" onClick={() => goToTab(2)}>
                Заполнить опыт <ArrowIcon />
              </button>
            </div>
          )}

          {activeTab === 2 && (
            <div id="panel-2" role="tabpanel" aria-labelledby="tab-2" className="panel experience-panel">
              <section className="form-section experience-section">
                <h2>3. ОПЫТ</h2>
                <div className="experience-grid">
                  <Field label="Трудности" name="struggles" multiline rows={6} values={values} setValues={setValues} />
                  <Field label="Опыт" name="experience" multiline rows={6} values={values} setValues={setValues} />
                </div>
              </section>

              <section className="formula-section" aria-live="polite">
                <h3>Ваша ситуация</h3>
                <div className="formula-card">
                  <span className="quote-mark">“</span>
                  <p>{formula}</p>
                </div>
              </section>

              {confirmed && (
                <div className="confirmation-message" role="status">
                  Первый шаг завершён. Диагностика готова к разбору.
                </div>
              )}

              <div className="experience-actions">
                <button type="button" className="secondary-button" onClick={() => goToTab(0)}>
                  Исправить
                </button>
                <button type="button" className="primary-button compact" onClick={() => setConfirmed(true)}>
                  Да, всё верно <ArrowIcon />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <nav className="journey" aria-label="Этапы работы">
        {stages.map((stage, index) => (
          <div className={`journey-stage ${index === 0 ? "active" : ""}`} key={stage}>
            <span className="journey-number">{index + 1}</span>
            <span>{stage}</span>
          </div>
        ))}
      </nav>
    </main>
  );
}
