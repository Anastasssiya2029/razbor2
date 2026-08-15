"use client";

import { useMemo, useRef, useState } from "react";

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

type SystemElement = {
  id: number;
  name: string;
  labelLines: string[];
  current: number;
  added: number;
  tone: "gold" | "coral";
};

const systemElements: SystemElement[] = [
  { id: 1, name: "Аутентичность", labelLines: ["Аутентичность"], current: 5, added: 1, tone: "gold" },
  { id: 2, name: "Своя ЦА", labelLines: ["Своя ЦА"], current: 4, added: 2, tone: "gold" },
  {
    id: 3,
    name: "Продукты и авторский метод",
    labelLines: ["Продукты и", "авторский метод"],
    current: 3,
    added: 3,
    tone: "coral",
  },
  { id: 4, name: "Технология продаж", labelLines: ["Технология", "продаж"], current: 2, added: 2, tone: "coral" },
  {
    id: 5,
    name: "Воронка продаж и связки",
    labelLines: ["Воронка продаж", "и связки"],
    current: 1,
    added: 0,
    tone: "coral",
  },
  { id: 6, name: "Блог", labelLines: ["Блог"], current: 2, added: 0, tone: "coral" },
  { id: 7, name: "Команда", labelLines: ["Команда"], current: 1, added: 1, tone: "coral" },
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="arrow-icon">
      <path d="M5 12h14M14 6l6 6-6 6" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chevron-icon">
      <path d={direction === "left" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} />
    </svg>
  );
}

function SystemModel({ target = false }: { target?: boolean }) {
  return (
    <div className="system-model" aria-label={target ? "Модель под вашу цель" : "Текущая бизнес-модель"}>
      {systemElements.map((element) => {
        const result = element.current + (target ? element.added : 0);
        return (
          <div className="model-column" key={element.id}>
            <div className={`model-score ${target && element.added ? "target-score" : element.tone}`}>{result}</div>
            <div className="brick-stack" aria-label={`${element.name}: ${result} из 10`}>
              {Array.from({ length: 10 }, (_, index) => {
                const level = 10 - index;
                const state =
                  level <= element.current
                    ? `current ${element.tone}`
                    : target && level <= element.current + element.added
                      ? "added"
                      : "empty";
                return <span className={`system-brick ${state}`} key={level} />;
              })}
            </div>
            <span className="model-number">{element.id}</span>
            <span className="model-name">{element.name}</span>
          </div>
        );
      })}
    </div>
  );
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function ringSectorPath(innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
  const centerX = 350;
  const centerY = 255;
  const outerStart = polarPoint(centerX, centerY, outerRadius, startAngle);
  const outerEnd = polarPoint(centerX, centerY, outerRadius, endAngle);
  const innerEnd = polarPoint(centerX, centerY, innerRadius, endAngle);
  const innerStart = polarPoint(centerX, centerY, innerRadius, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function SystemWheel() {
  const sectorAngle = 360 / systemElements.length;
  return (
    <div className="wheel-wrap">
      <svg className="wheel-svg" viewBox="0 0 700 510" role="img" aria-labelledby="wheel-title wheel-description">
        <title id="wheel-title">Колесо бизнес-системы</title>
        <desc id="wheel-description">
          Семь элементов бизнес-системы. Текущий уровень показан жёлтым и коралловым, зоны достройки — фиолетовым.
        </desc>
        {systemElements.map((element, elementIndex) => {
          const centerAngle = -90 + elementIndex * sectorAngle;
          const startAngle = centerAngle - sectorAngle / 2 + 1.2;
          const endAngle = centerAngle + sectorAngle / 2 - 1.2;
          return (
            <g key={element.id}>
              <title>{`${element.name}: сейчас ${element.current}, под цель ${element.current + element.added}`}</title>
              {Array.from({ length: 10 }, (_, levelIndex) => {
                const level = levelIndex + 1;
                const innerRadius = 48 + levelIndex * 15.2;
                const outerRadius = innerRadius + 13.2;
                const state =
                  level <= element.current
                    ? `current ${element.tone}`
                    : level <= element.current + element.added
                      ? "added"
                      : "empty";
                return (
                  <path
                    className={`wheel-segment ${state}`}
                    d={ringSectorPath(innerRadius, outerRadius, startAngle, endAngle)}
                    key={level}
                  />
                );
              })}
              {(() => {
                const labelPoint = polarPoint(350, 255, 218, centerAngle);
                return (
                  <text className="wheel-label" x={labelPoint.x} y={labelPoint.y} textAnchor="middle">
                    {element.labelLines.map((line, lineIndex) => (
                      <tspan x={labelPoint.x} dy={lineIndex === 0 ? 0 : 16} key={line}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                );
              })()}
            </g>
          );
        })}
        <circle className="wheel-center" cx="350" cy="255" r="43" />
        <text className="wheel-center-title" x="350" y="250" textAnchor="middle">7D</text>
        <text className="wheel-center-caption" x="350" y="272" textAnchor="middle">система</text>
      </svg>
    </div>
  );
}

function ModelLegend({ includeTarget = true }: { includeTarget?: boolean }) {
  return (
    <div className="model-legend" aria-label="Обозначения цветов">
      <span><i className="legend-swatch current-swatch" />Текущий уровень</span>
      {includeTarget && <span><i className="legend-swatch target-swatch" />Что нужно достроить</span>}
      <span><i className="legend-swatch empty-swatch" />Потенциал роста</span>
    </div>
  );
}

function AnalysisSection({ activeSlide, setActiveSlide }: { activeSlide: number; setActiveSlide: (slide: number) => void }) {
  const pointerStart = useRef<number | null>(null);
  const slideCount = 3;
  const showSlide = (slide: number) => setActiveSlide(Math.max(0, Math.min(slideCount - 1, slide)));

  const finishSwipe = (clientX: number) => {
    if (pointerStart.current === null) return;
    const distance = pointerStart.current - clientX;
    pointerStart.current = null;
    if (Math.abs(distance) < 55) return;
    showSlide(activeSlide + (distance > 0 ? 1 : -1));
  };

  return (
    <section className="diagnostic-card analysis-card" aria-labelledby="analysis-title">
      <div className="analysis-heading">
        <span className="analysis-kicker">Шаг 2 · Разбор</span>
        <h2 id="analysis-title">Ваша бизнес-система</h2>
        <p>Сравните текущую конструкцию с моделью под вашу цель и посмотрите, какие элементы важно достроить.</p>
      </div>

      <div className="analysis-carousel">
        <button
          type="button"
          className="analysis-arrow analysis-arrow-left"
          aria-label="Предыдущий экран"
          disabled={activeSlide === 0}
          onClick={() => showSlide(activeSlide - 1)}
        >
          <ChevronIcon direction="left" />
        </button>

        <div
          className="analysis-viewport"
          tabIndex={0}
          aria-roledescription="карусель"
          aria-label="Визуализация бизнес-системы"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") showSlide(activeSlide - 1);
            if (event.key === "ArrowRight") showSlide(activeSlide + 1);
          }}
          onPointerDown={(event) => {
            pointerStart.current = event.clientX;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => finishSwipe(event.clientX)}
          onPointerCancel={() => { pointerStart.current = null; }}
        >
          <div className="analysis-track" style={{ transform: `translate3d(-${activeSlide * 100}%, 0, 0)` }}>
            <article className="analysis-slide" aria-hidden={activeSlide !== 0}>
              <div className="analysis-slide-heading">
                <span>01</span>
                <h3>Текущая бизнес-модель</h3>
              </div>
              <SystemModel />
            </article>

            <article className="analysis-slide" aria-hidden={activeSlide !== 1}>
              <div className="analysis-slide-heading">
                <span>02</span>
                <h3>Модель под вашу цель</h3>
              </div>
              <ModelLegend />
              <SystemModel target />
            </article>

            <article className="analysis-slide wheel-slide" aria-hidden={activeSlide !== 2}>
              <div className="analysis-slide-heading">
                <span>03</span>
                <h3>Колесо бизнес-системы</h3>
              </div>
              <ModelLegend />
              <SystemWheel />
            </article>
          </div>
        </div>

        <button
          type="button"
          className="analysis-arrow analysis-arrow-right"
          aria-label="Следующий экран"
          disabled={activeSlide === slideCount - 1}
          onClick={() => showSlide(activeSlide + 1)}
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      <div className="analysis-pagination" aria-label="Экраны разбора">
        {["Текущая бизнес-модель", "Модель под вашу цель", "Колесо бизнес-системы"].map((label, index) => (
          <button
            type="button"
            className={activeSlide === index ? "active" : ""}
            aria-label={`Показать: ${label}`}
            aria-current={activeSlide === index ? "true" : undefined}
            onClick={() => showSlide(index)}
            key={label}
          />
        ))}
      </div>
      <p className="analysis-counter" aria-live="polite">{activeSlide + 1} / {slideCount}</p>
    </section>
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
  const [currentStage, setCurrentStage] = useState(0);
  const [analysisSlide, setAnalysisSlide] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [deadline, setDeadline] = useState("6 месяцев");
  const [personality, setPersonality] = useState("Амбиверт");

  const formula = useMemo(() => {
    const goal = values.goalIncome?.trim() || "_____";
    const model = values.goalModel?.trim() || "_____";
    const now = values.currentIncome?.trim() || "_____";
    const struggles = values.struggles?.trim() || "_____, _____ и _____";
    const experience = values.experience?.trim() || "_____";
    return `Вы хотите прийти к ${goal}, выстроив такую модель бизнеса: ${model}. Сейчас у вас ${now}, а основными препятствиями выглядят ${struggles}. До этого вы пробовали ${experience}, но устойчивого результата не получили.`;
  }, [values]);

  const goToTab = (tab: number) => {
    setCurrentStage(0);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openAnalysis = () => {
    setCurrentStage(1);
    setAnalysisSlide(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showJourneyStage = (stage: number) => {
    if (stage > 1) return;
    setCurrentStage(stage);
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

      {currentStage === 0 ? (
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
              <span>{tab.label}</span>
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

              <div className="experience-actions">
                <button type="button" className="secondary-button" onClick={() => goToTab(0)}>
                  Исправить
                </button>
                <button type="button" className="primary-button compact" onClick={openAnalysis}>
                  Да, всё верно <ArrowIcon />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      ) : (
        <AnalysisSection activeSlide={analysisSlide} setActiveSlide={setAnalysisSlide} />
      )}

      <nav className="journey" aria-label="Этапы работы">
        {stages.map((stage, index) => (
          <button
            type="button"
            className={`journey-stage ${index === currentStage ? "active" : ""}`}
            aria-current={index === currentStage ? "step" : undefined}
            disabled={index > 1}
            onClick={() => showJourneyStage(index)}
            key={stage}
          >
            <span className="journey-number">{index + 1}</span>
            <span>{stage}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
