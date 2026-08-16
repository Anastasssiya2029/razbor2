"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  archetypeDefinitions,
  archetypeOrder,
  demoBusinessAnalysis,
  resolveSystemElements,
  systemElementDefinitions,
  type ArchetypeId,
  type BusinessAnalysisResult,
  type ElementRecommendation,
  type ResolvedSystemElement,
} from "@/lib/business-analysis";

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

type ArchetypeKind = ArchetypeId;

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

function ArchetypeGlyph({ kind }: { kind: ArchetypeKind }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="archetype-glyph">
      {kind === "altruist" && (
        <path {...common} d="M12 20.3S4.8 16 4.8 10.1A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.2 2.7c0 5.9-7.2 10.2-7.2 10.2Z" />
      )}
      {kind === "explorer" && (
        <>
          <circle {...common} cx="12" cy="12" r="8.5" />
          <path {...common} d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        </>
      )}
      {kind === "creator" && (
        <>
          <path {...common} d="m4.4 19.6 3.7-.9L19 7.8 16.2 5 5.3 15.9l-.9 3.7Z" />
          <path {...common} d="m14.7 6.5 2.8 2.8M4.4 19.6l2.7-2.7" />
        </>
      )}
      {kind === "hero" && <path {...common} d="M13.3 2.7 5.7 13h5.7l-.7 8.3L18.3 11h-5.7l.7-8.3Z" />}
      {kind === "magician" && (
        <>
          <path {...common} d="M12 3.2 13.4 8l4.8 1.4-4.8 1.4L12 15.6l-1.4-4.8-4.8-1.4L10.6 8 12 3.2Z" />
          <path {...common} d="m18.3 15.2.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
        </>
      )}
      {kind === "ruler" && (
        <>
          <path {...common} d="m4.2 8.2 4 3.1L12 5l3.8 6.3 4-3.1-1.4 9.2H5.6L4.2 8.2Z" />
          <path {...common} d="M6 20h12" />
        </>
      )}
    </svg>
  );
}

function ArchetypeMedallion({ kind, className = "" }: { kind: ArchetypeKind; className?: string }) {
  return (
    <span className={`archetype-medallion ${className}`} aria-hidden="true">
      <span className="medallion-orbit" />
      <ArchetypeGlyph kind={kind} />
    </span>
  );
}

function SystemModel({ elements, target = false }: { elements: ResolvedSystemElement[]; target?: boolean }) {
  return (
    <div className="system-model" aria-label={target ? "Модель под вашу цель" : "Текущая бизнес-модель"}>
      {elements.map((element) => {
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

function ModelLegend({ includeTarget = true }: { includeTarget?: boolean }) {
  return (
    <div className="model-legend" aria-label="Обозначения цветов">
      <span><i className="legend-swatch current-swatch" />Текущий уровень</span>
      {includeTarget && <span><i className="legend-swatch target-swatch" />Что нужно достроить</span>}
      <span><i className="legend-swatch empty-swatch" />Потенциал роста</span>
    </div>
  );
}

function ArchetypeDialog({
  archetypeId,
  open,
  flipped,
  onFlip,
  onClose,
}: {
  archetypeId: ArchetypeId;
  open: boolean;
  flipped: boolean;
  onFlip: () => void;
  onClose: () => void;
}) {
  const archetype = archetypeDefinitions[archetypeId];
  const nextArchetype = archetype.nextId ? archetypeDefinitions[archetype.nextId] : null;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="archetype-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="archetype-dialog" role="dialog" aria-modal="true" aria-labelledby="archetype-card-title">
        <button type="button" className="archetype-close" aria-label="Закрыть карту архетипа" onClick={onClose} autoFocus>
          <span aria-hidden="true">×</span>
        </button>
        <div className={`archetype-flip-scene ${flipped ? "is-flipped" : ""}`}>
          <button
            type="button"
            className="archetype-flip-card"
            onClick={onFlip}
            aria-label={flipped ? "Показать лицевую сторону карты" : "Показать ключ перехода"}
          >
            <span className="archetype-card-face archetype-card-front" aria-hidden={flipped}>
              <span className="archetype-card-eyebrow">Ваш бизнес-архетип</span>
              <ArchetypeMedallion kind={archetype.id} className="card-medallion" />
              <strong id="archetype-card-title">{archetype.name}</strong>
              <span className="archetype-card-quote">«{archetype.quote}»</span>
              <span className="archetype-card-hint">Нажмите на карту, чтобы увидеть ключ перехода</span>
            </span>

            <span className="archetype-card-face archetype-card-back" aria-hidden={!flipped}>
              <span className="archetype-card-eyebrow">
                {nextArchetype ? `${archetype.name} → ${nextArchetype.name}` : `${archetype.name} · устойчивый уровень`}
              </span>
              <span className="archetype-back-icon"><ArchetypeGlyph kind={nextArchetype?.id ?? archetype.id} /></span>
              <span className="archetype-back-section">
                <b>Ключ перехода</b>
                <strong>{archetype.transitionKey}</strong>
              </span>
              <span className="archetype-back-section actions">
                <b>Что важно сделать</b>
                {archetype.actions.map((action) => <span key={action}>{action}</span>)}
              </span>
              <span className="archetype-card-hint">Нажмите, чтобы перевернуть обратно</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function EvolutionMap({ currentArchetypeId }: { currentArchetypeId: ArchetypeId }) {
  const currentIndex = archetypeOrder.indexOf(currentArchetypeId);
  const archetypeJourney = archetypeOrder.map((id, index) => ({
    number: index + 1,
    ...archetypeDefinitions[id],
    state: index < currentIndex ? "passed" : index === currentIndex ? "current" : index === currentIndex + 1 ? "next" : "",
  }));

  return (
    <section className="evolution-card" aria-labelledby="evolution-title">
      <div className="evolution-heading">
        <span className="result-kicker">Карта роста</span>
        <h3 id="evolution-title">Эволюция предпринимательского мышления</h3>
        <p>Не тип личности, а способ, которым человек сейчас строит именно этот бизнес.</p>
      </div>
      <div className="evolution-legend" aria-label="Обозначения карты">
        <span><i className="evolution-dot passed" />Пройденная опора</span>
        <span><i className="evolution-dot current" />Текущий архетип</span>
        <span><i className="evolution-dot next" />Следующий переход</span>
      </div>
      <div className="evolution-scroll">
        <div className="evolution-flow">
          {archetypeJourney.map((stage) => (
            <article className={`evolution-stage ${stage.state ?? ""}`} key={stage.name}>
              <span className="evolution-stage-number">{String(stage.number).padStart(2, "0")}</span>
              <span className="evolution-orb">
                <ArchetypeGlyph kind={stage.id} />
              </span>
              <strong className="evolution-stage-label">{stage.name}</strong>
              {stage.state === "current" && <small>Вы здесь</small>}
              {stage.state === "next" && <small>Следующий уровень</small>}
            </article>
          ))}
        </div>
      </div>
      <p className="evolution-caption">
        Альтруист ждёт оценки. Искатель ищет способ. Творец создаёт. Герой связывает и ведёт результат. Волшебник знает формулу. Правитель передаёт её системе и масштабирует через сильных лидеров.
      </p>
    </section>
  );
}

function BusinessAnalysis({ analysis }: { analysis: BusinessAnalysisResult }) {
  const moneyImpact = analysis.moneyImpact;
  const sectionOrder = [
    "whyHere",
    ...(moneyImpact ? ["moneyImpact"] : []),
    "growthLink",
    "doNotDo",
    "repeatability",
  ];
  const sectionNumber = (key: string) => String(sectionOrder.indexOf(key) + 1).padStart(2, "0");
  const growthLevers: Array<ElementRecommendation & { role: string }> = [
    { ...analysis.growthLink.leading, role: "Ведущий элемент" },
    ...analysis.growthLink.supporting.map((lever) => ({ ...lever, role: "Поддерживающий элемент" })),
  ];

  return (
    <div className="business-analysis">
      <div className="result-heading">
        <span className="result-kicker">Персональный вывод</span>
        <h2>Результат бизнес-разбора</h2>
        <p>Главная точка денег, логика решения и ближайший проверяемый шаг.</p>
      </div>

      <section className="money-insight" aria-labelledby="money-now-title">
        <div className="money-insight-main">
          <span className="insight-label">Где деньги сейчас</span>
          <h3 id="money-now-title">{analysis.moneyNow.headline}</h3>
        </div>
        <div className="month-focus">
          <span className="month-focus-label">Фокус на 30 дней</span>
          {analysis.moneyNow.chain.map((step, index) => (
            <span className="month-focus-step" key={`${step}-${index}`}>
              {index > 0 && <i aria-hidden="true">→</i>}
              <strong>{step}</strong>
            </span>
          ))}
        </div>
      </section>

      <section className="result-section reasons-section" aria-labelledby="reasons-title">
        <div className="result-section-heading">
          <span className="section-index">{sectionNumber("whyHere")}</span>
          <div>
            <h3 id="reasons-title">Почему именно здесь</h3>
            <p>Факты из диагностики, на которых держится вывод.</p>
          </div>
        </div>
        <div className="reason-grid">
          {analysis.whyHere.map((reason, index) => (
            <article className="reason-card" key={`${reason.explanation}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                {reason.title && <h4>{reason.title}</h4>}
                <p>{reason.explanation}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {moneyImpact && <section className="result-section revenue-section" aria-labelledby="revenue-title">
        <div className="result-section-heading">
          <span className="section-index">{sectionNumber("moneyImpact")}</span>
          <div>
            <h3 id="revenue-title">Как это может повлиять на деньги</h3>
            <p>{moneyImpact.intro}</p>
          </div>
        </div>
        <div className="revenue-board">
          <div className="package-formula">
            <span>{moneyImpact.formula.baseLabel}</span>
            <strong>{moneyImpact.formula.baseValue}</strong>
            <i aria-hidden="true">{moneyImpact.formula.multiplierLabel}</i>
            <span>{moneyImpact.formula.resultLabel}</span>
            <strong className="package-total">{moneyImpact.formula.resultValue}</strong>
          </div>
          <div className="revenue-scenarios">
            {moneyImpact.scenarios.map((scenario) => (
              <div className="revenue-scenario" key={scenario.label}>
                <span>{scenario.label}</span>
                <strong>{scenario.value}</strong>
              </div>
            ))}
          </div>
          <div className="capacity-card">
            <span>{moneyImpact.capacityModel.label}</span>
            <strong>{moneyImpact.capacityModel.formula}</strong>
            <b>{moneyImpact.capacityModel.result}</b>
          </div>
        </div>
        <p className="result-note">{moneyImpact.disclaimer}</p>
      </section>}

      <section className="change-card" aria-labelledby="change-title">
        <span className="change-days">30 дней</span>
        <div>
          <span className="result-kicker">Что изменить</span>
          <h3 id="change-title">{analysis.change30Days.headline}</h3>
          <p>{analysis.change30Days.explanation}</p>
        </div>
      </section>

      <section className="result-section levers-section" aria-labelledby="levers-title">
        <div className="result-section-heading">
          <span className="section-index">{sectionNumber("growthLink")}</span>
          <div>
            <h3 id="levers-title">Что усиливает связку</h3>
            <p>Ведущий элемент и поддерживающие точки системы.</p>
          </div>
        </div>
        <div className="lever-grid">
          {growthLevers.map((lever, index) => (
            <article className={`lever-card ${index === 0 ? "leading" : ""}`} key={`${lever.elementId}-${index}`}>
              <span className="lever-role">{lever.role}</span>
              <h4>{systemElementDefinitions[lever.elementId].name}</h4>
              <dl>
                <div>
                  <dt>Не выстроено</dt>
                  <dd>{lever.notBuilt}</dd>
                </div>
                <div>
                  <dt>Как мешает деньгам</dt>
                  <dd>{lever.impact}</dd>
                </div>
                <div>
                  <dt>Минимальное изменение</dt>
                  <dd>{lever.minimumChange}</dd>
                </div>
                <div>
                  <dt>Критерий</dt>
                  <dd>{lever.criterion}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="result-section pause-section" aria-labelledby="pause-title">
        <div className="result-section-heading">
          <span className="section-index">{sectionNumber("doNotDo")}</span>
          <div>
            <h3 id="pause-title">Что пока не делать</h3>
            <p>Не распылять ресурс до подтверждения основной связки.</p>
          </div>
        </div>
        <div className="pause-grid">
          {analysis.doNotDo.map((item) => (
            <article className="pause-card" key={item.title}>
              <span aria-hidden="true">×</span>
              <div>
                <h4>{item.title}</h4>
                <p>{item.explanation}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="result-section repeat-section" aria-labelledby="repeat-title">
        <div className="result-section-heading">
          <span className="section-index">{sectionNumber("repeatability")}</span>
          <div>
            <h3 id="repeat-title">Как сделать результат повторяемым</h3>
            <p>Последовательность, которая превращает ручную продажу в систему.</p>
          </div>
        </div>
        <ol className="repeat-steps">
          {analysis.repeatabilitySteps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
        {analysis.importantCaveat && <aside className="analysis-caveat">
          <span>Важно для точности вывода</span>
          <p>{analysis.importantCaveat}</p>
        </aside>}
      </section>

      <EvolutionMap currentArchetypeId={analysis.archetype.id} />

      <div className="analysis-export">
        <button type="button" className="pdf-button" onClick={() => window.print()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" />
          </svg>
          Сохранить разбор в PDF
        </button>
        <p>Откроется системное окно печати. Выберите «Сохранить как PDF».</p>
      </div>
    </div>
  );
}

function AnalysisSection({
  analysis,
  activeSlide,
  setActiveSlide,
}: {
  analysis: BusinessAnalysisResult;
  activeSlide: number;
  setActiveSlide: (slide: number) => void;
}) {
  const pointerStart = useRef<number | null>(null);
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  const [archetypeFlipped, setArchetypeFlipped] = useState(false);
  const systemElements = useMemo(() => resolveSystemElements(analysis.systemScores), [analysis.systemScores]);
  const archetype = archetypeDefinitions[analysis.archetype.id];
  const slideCount = 2;
  const showSlide = (slide: number) => setActiveSlide(Math.max(0, Math.min(slideCount - 1, slide)));
  const closeArchetype = () => {
    setArchetypeOpen(false);
    setArchetypeFlipped(false);
  };

  const finishSwipe = (clientX: number) => {
    if (pointerStart.current === null) return;
    const distance = pointerStart.current - clientX;
    pointerStart.current = null;
    if (Math.abs(distance) < 55) return;
    showSlide(activeSlide + (distance > 0 ? 1 : -1));
  };

  return (
    <section className="diagnostic-card analysis-card" aria-labelledby="analysis-title">
      <button
        type="button"
        className="archetype-trigger"
        aria-label={`Открыть карту бизнес-архетипа ${archetype.name}`}
        onClick={() => {
          setArchetypeFlipped(false);
          setArchetypeOpen(true);
        }}
      >
        <ArchetypeMedallion kind={archetype.id} className="trigger-medallion" />
        <span>
          <small>Ваш архетип</small>
          <strong>{archetype.name}</strong>
        </span>
      </button>

      <div className="analysis-heading">
        <span className="analysis-kicker">Шаг 2 · Разбор</span>
        <h2 id="analysis-title">Бизнес-модель <span>7К</span></h2>
        <strong className="analysis-method-subtitle">Система пошагового роста эксперта</strong>
        <p>Показывает, как шаг за шагом построить сильную аутентичную систему. Сравните текущую модель с моделью под вашу цель и посмотрите, какие элементы важно достроить.</p>
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
                <h3>Текущая бизнес-модель 7К</h3>
              </div>
              <SystemModel elements={systemElements} />
            </article>

            <article className="analysis-slide" aria-hidden={activeSlide !== 1}>
              <div className="analysis-slide-heading">
                <span>02</span>
                <h3>Модель 7К под вашу цель</h3>
              </div>
              <ModelLegend />
              <SystemModel elements={systemElements} target />
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
        {["Текущая бизнес-модель 7К", "Модель 7К под вашу цель"].map((label, index) => (
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

      <BusinessAnalysis analysis={analysis} />

      <ArchetypeDialog
        archetypeId={analysis.archetype.id}
        open={archetypeOpen}
        flipped={archetypeFlipped}
        onFlip={() => setArchetypeFlipped((current) => !current)}
        onClose={closeArchetype}
      />
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
    const bestPeriod = values.bestPeriod?.trim() || "_____";
    const failures = values.failures?.trim() || "_____";
    return `Вы хотите прийти к ${goal}, выстроив такую модель бизнеса: ${model}. Сейчас у вас ${now}. Ваш лучший период: ${bestPeriod}. Ошибки и провалы, которые важно учесть при построении новой системы: ${failures}.`;
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
                  <div className="project-column project-assets-column">
                    <Field label="Социальные активы" name="socialAssets" multiline rows={3} values={values} setValues={setValues} />
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
                  <Field label="Лучший период" name="bestPeriod" multiline rows={6} values={values} setValues={setValues} />
                  <Field label="Ошибки и провалы" name="failures" multiline rows={6} values={values} setValues={setValues} />
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
        // При подключении ИИ demoBusinessAnalysis заменяется валидированным ответом business_analysis_v1.
        <AnalysisSection analysis={demoBusinessAnalysis} activeSlide={analysisSlide} setActiveSlide={setAnalysisSlide} />
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
