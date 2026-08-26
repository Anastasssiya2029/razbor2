"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  archetypeDefinitions,
  demoBusinessAnalysis,
  resolveSystemElements,
  systemScoreTone,
  systemElementDefinitions,
  type ArchetypeId,
  type BusinessAnalysisResult,
  type ElementRecommendation,
  type ResolvedSystemElement,
  type SystemElementId,
} from "@/lib/business-analysis";
import type { ClientsCountPeriod, DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import {
  emptyDiagnosticValues,
  formatMoneyInput,
  formatRubles,
  valuesForSubmission,
} from "@/lib/diagnostic-form";
import { declineRussianNameGenitive } from "@/lib/russian-name";
import { logoutAndRedirect, useAppSession } from "@/app/_components/app-session";
import { AnalysisResultView } from "@/app/_components/analysis-result-view";
import { AnalysisStrategySummary } from "@/app/_components/analysis-strategy-summary";
import type { AnalysisResultV1 } from "@/server/analysis-result";
import { GiftWheel } from "@/app/_components/gift-wheel";
import { buildCurrentSystemSummary } from "@/lib/current-system-summary";
import type { AnalysisOverview } from "@/lib/analysis-overview";

type FieldProps = {
  label: string;
  name: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  variant?: "text" | "number" | "money";
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

const FORM_RECOVERY_STORAGE_KEY = "razbor7k.current-diagnostic.v1";

const tabs = [
  { id: 0, label: "Сейчас и цель" },
  { id: 1, label: "Инфо о проекте" },
  { id: 2, label: "Опыт" },
];

const stages = [
  { label: "Диагностика", accessibleLabel: "Диагностика" },
  { label: "Разбор", accessibleLabel: "Разбор" },
  { label: "План перехода", accessibleLabel: "План перехода" },
  { label: "", accessibleLabel: "Бонусный этап" },
];

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

const archetypePortraitCaptions: Record<ArchetypeId, string> = {
  altruist: "Готов всем помочь",
  explorer: "Исследует возможности",
  creator: "Создаёт формы",
  hero: "Запускает маховик",
  magician: "Создаёт собственную формулу",
  ruler: "Масштабирует через команду и систему",
};

const archetypePortraits: Record<ArchetypeId, { src: string; position: string }> = {
  altruist: { src: "/archetype-altruist.jpg", position: "50% 28%" },
  explorer: { src: "/archetype-explorer.jpg", position: "50% 31%" },
  creator: { src: "/archetype-creator.jpg", position: "50% 50%" },
  hero: { src: "/archetype-hero.png", position: "50% 24%" },
  magician: { src: "/archetype-magician.png", position: "50% 27%" },
  ruler: { src: "/archetype-ruler.png", position: "50% 23%" },
};

function ArchetypePortrait({ kind }: { kind: ArchetypeId }) {
  const archetype = archetypeDefinitions[kind];
  const portrait = archetypePortraits[kind];
  return (
    <span className={`archetype-photo-unit archetype-photo-${kind}`} aria-hidden="true">
      <span className="archetype-photo-circle">
        <Image
          src={portrait.src}
          alt=""
          fill
          sizes="184px"
          className="archetype-photo-image"
          style={{ objectPosition: portrait.position }}
        />
      </span>
      <span className="archetype-photo-plaque">
        <strong>{archetype.name}</strong>
        <small>{archetypePortraitCaptions[kind]}</small>
      </span>
    </span>
  );
}

function SystemModel({ elements, target = false }: { elements: ResolvedSystemElement[]; target?: boolean }) {
  return (
    <div className="system-model" aria-label={target ? "Модель под вашу цель" : "Текущая бизнес-модель"}>
      {elements.map((element) => {
        const result = element.current + (target ? element.added : 0);
        const currentTone = systemScoreTone(element.current);
        return (
          <div className="model-column" key={element.id}>
            <div className={`model-score ${target && element.added ? "target-score" : currentTone}`}>{result}</div>
            <div className="brick-stack" aria-label={`${element.name}: ${result} из 10`}>
              {Array.from({ length: 10 }, (_, index) => {
                const level = 10 - index;
                const state =
                  level <= element.current
                    ? `current ${currentTone}`
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
              <span id="archetype-card-title" className="sr-only">{archetype.name}</span>
              <ArchetypePortrait kind={archetype.id} />
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
  const [mapOpen, setMapOpen] = useState(false);
  const currentArchetype = archetypeDefinitions[currentArchetypeId];

  useEffect(() => {
    if (!mapOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMapOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mapOpen]);

  return (
    <section className="evolution-card" aria-labelledby="evolution-title">
      <div className="evolution-heading">
        <span className="result-kicker">Навигатор роста</span>
        <h3 id="evolution-title">Эволюция предпринимательского мышления</h3>
        <p>Не тип личности, а способ мышления, через который человек сейчас строит именно этот бизнес.</p>
      </div>
      <button
        type="button"
        className="evolution-map-button"
        onClick={() => setMapOpen(true)}
        aria-label={`Увеличить карту эволюции. Текущий архетип: ${currentArchetype.name}`}
      >
        <Image
          src="/business-archetype-map.png"
          alt="Карта эволюции предпринимательского мышления от Альтруиста к Правителю"
          width={2048}
          height={1152}
          sizes="(max-width: 920px) 92vw, 980px"
        />
        <span className="evolution-map-hint"><b aria-hidden="true">＋</b> Увеличить карту</span>
      </button>

      {mapOpen && (
        <div
          className="evolution-map-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMapOpen(false);
          }}
        >
          <div className="evolution-map-dialog" role="dialog" aria-modal="true" aria-label="Увеличенная карта эволюции предпринимательского мышления">
            <button type="button" className="evolution-map-close" onClick={() => setMapOpen(false)} aria-label="Закрыть карту" autoFocus>×</button>
            <Image
              src="/business-archetype-map.png"
              alt="Карта эволюции предпринимательского мышления от Альтруиста к Правителю"
              width={2048}
              height={1152}
              sizes="96vw"
            />
          </div>
        </div>
      )}
    </section>
  );
}

// Старая компоновка сохранена до подключения генерации PDF для полной версии разбора.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyBusinessAnalysis({ analysis }: { analysis: BusinessAnalysisResult }) {
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

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="lock-icon">
      <rect x="5" y="10" width="14" height="11" rx="3" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10M12 14.5v2.5" />
    </svg>
  );
}

function BrainIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M11.2 6.1c-.2-1.8-1.6-3.1-3.3-3.1-1.8 0-3.3 1.5-3.3 3.4v.2A3.5 3.5 0 0 0 3 9.5c0 1.2.6 2.3 1.5 2.9a3.5 3.5 0 0 0-.5 1.8c0 1.9 1.5 3.4 3.4 3.5.5 1.7 2.2 2.8 3.8 2.1V6.1Z" />
      <path d="M12.8 6.1c.2-1.8 1.6-3.1 3.3-3.1 1.8 0 3.3 1.5 3.3 3.4v.2A3.5 3.5 0 0 1 21 9.5c0 1.2-.6 2.3-1.5 2.9.3.5.5 1.1.5 1.8 0 1.9-1.5 3.4-3.4 3.5-.5 1.7-2.2 2.8-3.8 2.1V6.1Z" />
      <path d="M7.8 6.4c1.3 0 2.2 1 2.2 2.2M6.4 11.3c1.5-.3 2.8.7 2.9 2.2M8 17.5c-.1-1.2.7-2.2 1.8-2.5M16.2 6.4c-1.3 0-2.2 1-2.2 2.2M17.6 11.3c-1.5-.3-2.8.7-2.9 2.2M16 17.5c.1-1.2-.7-2.2-1.8-2.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="check-icon">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function BusinessAnalysis({
  analysis,
  onOpenPlan,
}: {
  analysis: BusinessAnalysisResult;
  onOpenPlan: () => void;
}) {
  const leading = analysis.growthLink.leading;
  const supporting = analysis.growthLink.supporting;
  const leadingDefinition = systemElementDefinitions[leading.elementId];

  return (
    <div className="business-analysis decision-analysis">
      <div className="result-heading decision-heading">
        <span className="result-kicker">Ваш путь к цели</span>
        <h2>Как перейти в желаемую реальность</h2>
        <p>Сначала определяем ближайший денежный горизонт на 30 дней. Затем собираем связку элементов, которая поможет перейти от текущей точки к выбранной цели.</p>
      </div>

      <section className="locked-money-card" aria-labelledby="locked-money-title">
        <div className="locked-money-topline">
          <h3 id="locked-money-title">Где деньги сейчас</h3>
          <span className="locked-access"><LockIcon /> Доступно для действующих клиентов</span>
        </div>
        <div className="locked-money-content" aria-hidden="true">
          <p>{analysis.moneyNow.headline}</p>
          <div className="locked-chain">
            {analysis.moneyNow.chain.map((step, index) => (
              <span key={`${step}-${index}`}>{step}</span>
            ))}
          </div>
        </div>
        <div className="locked-money-overlay" aria-label="Содержание блока закрыто">
          <span className="locked-circle"><LockIcon /></span>
        </div>
      </section>

      <div className="decision-grid">
        <section className="decision-card constraint-card" aria-labelledby="constraint-title">
          <span className="decision-card-number">01</span>
          <h3 id="constraint-title">Что мешает в первую очередь</h3>
          <div className="constraint-element">
            <span>Ключевое ограничение</span>
            <strong>{leadingDefinition.name}</strong>
          </div>
          <p>{leading.notBuilt}</p>
          <div className="decision-proof">
            <span>Почему это ограничивает рост</span>
            <strong>{leading.impact}</strong>
          </div>
        </section>

        <section className="decision-card growth-card" aria-labelledby="growth-title">
          <span className="decision-card-number">02</span>
          <h3 id="growth-title">Ключевая связка для роста</h3>
          <p className="growth-card-subtitle">Ключевая связка из трёх элементов</p>
          <div className="growth-element-list">
            <article className="growth-element leading">
              <span>Ключевой элемент</span>
              <strong>{leadingDefinition.name}</strong>
              <p>{leading.minimumChange}</p>
            </article>
            {supporting.map((item) => (
              <article className="growth-element" key={item.elementId}>
                <span>Поддерживающий элемент</span>
                <strong>{systemElementDefinitions[item.elementId].name}</strong>
                <p>{item.minimumChange}</p>
              </article>
            ))}
          </div>
          <aside className="growth-argument">
            <span>Почему именно эта связка</span>
            <p>{analysis.change30Days.explanation}</p>
          </aside>
        </section>
      </div>

      <section className="deferred-elements" aria-labelledby="deferred-title">
        <div className="deferred-heading">
          <span className="decision-card-number">03</span>
          <div>
            <h3 id="deferred-title">Что сейчас нельзя делать</h3>
            <p>Почему остальные элементы пока не нужно трогать</p>
          </div>
        </div>
        <div className="deferred-grid">
          {analysis.doNotDo.map((item) => (
            <article key={item.title}>
              <span aria-hidden="true">×</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.explanation}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <EvolutionMap currentArchetypeId={analysis.archetype.id} />

      <div className="route-action-wrap">
        <span>Следующий шаг</span>
        <h3>Посмотреть, в какой последовательности усиливать систему</h3>
        <button type="button" className="primary-button route-button" onClick={onOpenPlan}>
          Маршрут перехода <ArrowIcon />
        </button>
      </div>
    </div>
  );
}

type AnalysisProgressStatus =
  | "queued"
  | "scoring"
  | "targeting"
  | "strategizing"
  | "resolving_tasks"
  | "money_now"
  | "writing_report"
  | "ready";

const analysisProgressByStatus: Record<AnalysisProgressStatus, {
  step: number;
  percent: number;
  title: string;
  detail: string;
}> = {
  queued: {
    step: 1,
    percent: 8,
    title: "Алекс изучает вашу ситуацию",
    detail: "Собираю из ответов цельную картину бизнеса и его текущих опор.",
  },
  scoring: {
    step: 1,
    percent: 12,
    title: "Алекс изучает вашу ситуацию",
    detail: "Собираю из ответов цельную картину бизнеса и его текущих опор.",
  },
  targeting: {
    step: 2,
    percent: 28,
    title: "Собираю картину роста",
    detail: "Определяю, на что уже можно опереться и какой уровень нужен для вашей цели.",
  },
  strategizing: {
    step: 3,
    percent: 42,
    title: "Ищу главную связку роста",
    detail: "Выбираю элементы, которые важно усиливать вместе, чтобы не распылять ресурс.",
  },
  resolving_tasks: {
    step: 4,
    percent: 60,
    title: "Собираю последовательность действий",
    detail: "Выстраиваю понятный маршрут от текущей ситуации к ближайшему результату.",
  },
  money_now: {
    step: 5,
    percent: 72,
    title: "Ищу ближайший денежный фокус",
    detail: "Проверяю, на какой существующий актив можно опереться уже сейчас.",
  },
  writing_report: {
    step: 6,
    percent: 88,
    title: "Собираю индивидуальный план",
    detail: "Соединяю выводы и действия в понятный план для разговора с клиентом.",
  },
  ready: {
    step: 6,
    percent: 100,
    title: "Разбор готов",
    detail: "Завершаю сохранение результата в кабинете.",
  },
};

function formatAnalysisElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} сек`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} мин ${remainder} сек` : `${minutes} мин`;
}

function NeuroAnalysisScreen({
  mode,
  analysisStatus = "queued",
  startedAt = null,
}: {
  mode: "analysis" | "plan";
  analysisStatus?: AnalysisProgressStatus;
  startedAt?: number | null;
}) {
  const isPlan = mode === "plan";
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const progress = analysisProgressByStatus[analysisStatus];

  useEffect(() => {
    if (isPlan || !startedAt) return;
    const updateElapsed = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [isPlan, startedAt]);

  return (
    <section className="diagnostic-card neuro-screen" aria-live="polite" aria-busy="true">
      <div className="alex-portrait-wrap">
        <div className="alex-portrait" role="img" aria-label="Нейро-маркетолог Алекс" />
        <span className="alex-brain-badge" aria-hidden="true">
          <BrainIcon className="alex-brain-icon" />
        </span>
      </div>
      <span className="neuro-badge">
        <BrainIcon className="neuro-badge-brain" /> Нейро-анализ
      </span>
      <p className="neuro-status-title">{isPlan ? "Собираю маршрут перехода" : progress.title}</p>
      <p className="neuro-status-copy">
        {isPlan
          ? "Алекс сопоставляет текущий уровень каждого элемента 7К с вашей целью и собирает последовательность действий без лишней нагрузки."
          : progress.detail}
      </p>
      <div className="neuro-progress">
        <span className="neuro-spinner" aria-hidden="true" />
        <div>
          <strong>{isPlan ? "Прогресс" : `Шаг ${progress.step} из 6 · ${formatAnalysisElapsed(elapsedSeconds)}`}</strong>
          <span>{isPlan ? "Выстраиваем приоритеты…" : `${progress.percent}% выполнено`}</span>
        </div>
      </div>
      {!isPlan && (
        <>
          <div
            className="neuro-progress-meter"
            role="progressbar"
            aria-label="Прогресс анализа"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="neuro-duration-note">
            Первая часть разбора откроется сразу после оценки текущей системы. Полный план продолжит собираться в фоне.
            Анкета уже сохранена, повторно отправлять её не нужно.
          </p>
        </>
      )}
    </section>
  );
}

function formatIncome(value: string) {
  const cleaned = value.trim();
  if (!cleaned || cleaned === "не указан" || /(?:₽|руб)/i.test(cleaned)) return cleaned || "не указан";
  const digits = cleaned.replace(/\s/g, "");
  if (/^\d+$/.test(digits)) return `${Number(digits).toLocaleString("ru-RU")} ₽`;
  return cleaned;
}

const prototypePlanTasks: Record<SystemElementId, string[]> = {
  authenticity: [
    "Собрать факты профессионального пути и результаты клиентов.",
    "Сформулировать сильные стороны и собственный способ помощи.",
    "Подготовить короткую самопрезентацию с уверенным обозначением ценности.",
  ],
  audience: [
    "Выбрать сегмент клиентов, которому результат нужен сильнее всего.",
    "Зафиксировать главный запрос, ситуацию и критерий готовности к покупке.",
    "Собрать формулировки клиентов из реальных разговоров.",
  ],
  products_method: [
    "Собрать один понятный стартовый продукт с конкретным результатом.",
    "Описать путь клиента и логику работы внутри продукта.",
    "Проверить предложение в реальных диагностических разговорах.",
  ],
  sales_technology: [
    "Зафиксировать единую структуру диагностического разговора.",
    "Добавить понятный переход от проблемы клиента к предложению продукта.",
    "Собирать причины покупки, отказа и повторяющиеся возражения.",
  ],
  funnel: [
    "Зафиксировать текущие источники обращений и их результативность.",
    "Выбрать одну точку входа в путь клиента.",
    "Проверить связку на небольшом объёме трафика.",
  ],
  blog: [
    "Определить роль блога в пути клиента.",
    "Собрать серию материалов под ключевой запрос аудитории.",
    "Отслеживать обращения и реакции на каждый смысловой блок.",
  ],
  team: [
    "Выделить повторяющиеся задачи, которые не требуют личного участия эксперта.",
    "Выбрать одну безопасную зону для первого делегирования.",
    "Описать результат задачи и критерии качества.",
  ],
};

const prototypePlanCriteria: Record<SystemElementId, string> = {
  authenticity: "Эксперт уверенно объясняет свою ценность и не снижает цену заранее.",
  audience: "Выбран один приоритетный сегмент, а его запрос описан словами реальных клиентов.",
  products_method: "Клиент за минуту понимает результат продукта и путь внутри него.",
  sales_technology: "Проведена серия однотипных разговоров, собраны покупки, отказы и возражения.",
  funnel: "Определена конверсия одной проверяемой точки входа в обращение.",
  blog: "Понятно, какие материалы приводят подходящие обращения и поддерживают продажу.",
  team: "Первая задача передана с понятным результатом и принимается без постоянных переделок.",
};

function TransitionPlan({
  analysis,
  values,
  deadline,
  onBack,
}: {
  analysis: BusinessAnalysisResult;
  values: Record<string, string>;
  deadline: string;
  onBack: () => void;
}) {
  const systemElements = useMemo(() => resolveSystemElements(analysis.systemScores), [analysis.systemScores]);
  const recommendations = useMemo(() => {
    const items = [analysis.growthLink.leading, ...analysis.growthLink.supporting];
    return new Map<SystemElementId, ElementRecommendation>(items.map((item) => [item.elementId, item]));
  }, [analysis]);

  const priorityByElement = useMemo(() => {
    const growthElements = systemElements
      .filter((element) => element.added > 0)
      .sort((left, right) => right.added - left.added || left.id - right.id);
    return new Map<SystemElementId, number>(
      growthElements.map((element, index) => [element.elementId, index + 1]),
    );
  }, [systemElements]);

  const orderedElements = useMemo(() => [...systemElements].sort((left, right) => {
    const leftPriority = priorityByElement.get(left.elementId) ?? 99;
    const rightPriority = priorityByElement.get(right.elementId) ?? 99;
    return leftPriority - rightPriority || left.id - right.id;
  }), [priorityByElement, systemElements]);

  const expertName = values.expertName?.trim() || "Екатерина";
  const currentIncome = formatIncome(values.currentIncome?.trim() || "не указан");
  const goalIncome = formatIncome(values.goalIncome?.trim() || "не указан");

  return (
    <section className="diagnostic-card transition-plan" aria-labelledby="transition-plan-title">
      <div className="plan-heading">
        <span className="analysis-kicker">Шаг 3 · План перехода</span>
        <h2 id="transition-plan-title">Индивидуальный план перехода <span>для {declineRussianNameGenitive(expertName)}</span></h2>
        <p>Чек-лист показывает порядок усиления 7К. В работу попадают только элементы, которые действительно влияют на выбранную цель.</p>
      </div>

      <p className="income-route-line" aria-label={`Переход от ${currentIncome} к ${goalIncome} за ${deadline}`}>
        <strong>{currentIncome}</strong>
        <span className="income-route-line-arrow"><ArrowIcon /></span>
        <strong>{goalIncome}</strong>
        <span className="income-route-line-deadline">за {deadline}</span>
      </p>

      <div className="plan-checklist-heading">
        <span className="result-kicker">Маршрут перехода</span>
        <h3>Что усиливать и в какой последовательности</h3>
        <p>Карточки расположены по приоритету. Если элемент не требует действий сейчас, мы сохраняем его без дополнительной нагрузки.</p>
      </div>

      <div className="plan-element-grid">
        {orderedElements.map((element) => {
          const recommendation = recommendations.get(element.elementId);
          const priority = priorityByElement.get(element.elementId);
          const hasTask = element.added > 0;
          const taskCandidates = [
            recommendation?.minimumChange,
            ...prototypePlanTasks[element.elementId],
          ].filter((task): task is string => Boolean(task));
          const tasks = [...new Set(taskCandidates)].slice(0, 3);
          const criterion = recommendation?.criterion ?? prototypePlanCriteria[element.elementId];
          return (
            <article className={`plan-element-card ${hasTask ? "has-task" : "no-task"}`} key={element.elementId}>
              <div className="plan-element-topline">
                <span className="plan-element-number">{String(element.id).padStart(2, "0")}</span>
                {hasTask ? (
                  <span className="priority-chip">Приоритет {priority}</span>
                ) : (
                  <span className="priority-chip later">Без задач сейчас</span>
                )}
              </div>
              <h4>{element.name}</h4>
              {hasTask ? (
                <>
                  <ul className="plan-task-list">
                    {tasks.map((task, index) => (
                      <li key={`${element.elementId}-${index}`}>
                        <input type="checkbox" aria-label={`${element.name}: ${task}`} />
                        <span>{task}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="plan-criterion">
                    <span>Критерий выполнения</span>
                    <p>{criterion}</p>
                  </div>
                </>
              ) : (
                <div className="plan-empty-task">
                  <span className="task-check"><CheckIcon /></span>
                  <div>
                    <strong>Сейчас задач нет</strong>
                    <p>Сохраняем текущий уровень и не распыляем ресурс на этот элемент.</p>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="plan-actions">
        <button type="button" className="secondary-button" onClick={onBack}>Вернуться к разбору</button>
        <button type="button" className="primary-button compact" onClick={() => window.print()}>
          Сохранить план в PDF <ArrowIcon />
        </button>
      </div>
    </section>
  );
}

function AnalysisSection({
  analysis,
  activeSlide,
  setActiveSlide,
  onOpenPlan,
  onRetryPlan,
  planReady,
  progressStatus,
  backgroundError,
  retrying,
  result,
}: {
  analysis: AnalysisOverview;
  activeSlide: number;
  setActiveSlide: (slide: number) => void;
  onOpenPlan: () => void;
  onRetryPlan: () => void;
  planReady: boolean;
  progressStatus: AnalysisProgressStatus;
  backgroundError: string | null;
  retrying: boolean;
  result: AnalysisResultV1 | null;
}) {
  const pointerStart = useRef<number | null>(null);
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  const [archetypeFlipped, setArchetypeFlipped] = useState(false);
  const systemElements = useMemo(() => resolveSystemElements(analysis.systemScores), [analysis.systemScores]);
  const currentTotal = systemElements.reduce((sum, element) => sum + element.current, 0);
  const currentModelGroups = useMemo(
    () => buildCurrentSystemSummary(analysis.systemScores),
    [analysis.systemScores],
  );
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
        <span className="analysis-context-chip">Итоговый балл: <strong>{currentTotal}</strong><span>из 70</span></span>
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
                <h3>Текущая модель 7К</h3>
              </div>
              <SystemModel elements={systemElements} />
              <aside className="current-score-rationale" aria-label="Обоснование текущих баллов">
                <div className="current-system-conclusion" aria-label="Вывод о мягких и твёрдых элементах системы">
                  <article className="soft">
                    <span>Мягкие элементы системы</span>
                    <p>{currentModelGroups.soft}</p>
                  </article>
                  <article className="hard">
                    <span>Твёрдые элементы системы</span>
                    <p>{currentModelGroups.hard}</p>
                  </article>
                </div>
                <details className="current-score-details">
                  <summary>Почему выставлены такие баллы</summary>
                  <div className="current-score-argument-grid">
                    {analysis.currentScoreArguments.map((argument) => (
                      <article className={argument.kind} key={argument.id}>
                        <header>
                          <strong>{systemElementDefinitions[argument.id].name}</strong>
                          <span>{argument.score} из 10</span>
                        </header>
                        {argument.matchedCriterion && (
                          <p><b>Что означает этот уровень:</b> {argument.matchedCriterion}</p>
                        )}
                        {argument.evidence.length > 0 && (
                          <div>
                            <b>Что учтено из ответов:</b>
                            <ul>{argument.evidence.map((fact) => <li key={fact}>{fact}</li>)}</ul>
                          </div>
                        )}
                        {argument.whyNotHigher && (
                          <p><b>Почему не выше:</b> {argument.whyNotHigher}</p>
                        )}
                      </article>
                    ))}
                  </div>
                </details>
              </aside>
            </article>

            <article className="analysis-slide" aria-hidden={activeSlide !== 1}>
              <div className="analysis-slide-heading">
                <span>02</span>
                <h3>Бизнес-модель под вашу цель</h3>
              </div>
              <ModelLegend />
              <SystemModel elements={systemElements} target />
              {analysis.modelTransitionNote && (
                <aside className="target-horizon-note">
                  <strong>Почему не строим всю далёкую модель сразу</strong>
                  <p>{analysis.modelTransitionNote}</p>
                </aside>
              )}
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
        {["Текущая модель 7К", "Бизнес-модель под вашу цель"].map((label, index) => (
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

      <EvolutionMap currentArchetypeId={analysis.archetype.id} />

      {result && <AnalysisStrategySummary result={result} />}

      <div className={`route-action-wrap ${planReady ? "is-ready" : "is-building"}`} aria-live="polite">
        <span>{backgroundError ? "Нужна повторная попытка" : planReady ? "Следующий шаг" : "План продолжает собираться"}</span>
        <h3>
          {backgroundError
            ? "Разбор уже сохранён, но план перехода пока не собран"
            : planReady
              ? "Посмотреть, в какой последовательности усиливать систему"
              : analysisProgressByStatus[progressStatus].detail}
        </h3>
        <p>
          {backgroundError
            ? "Ответы и первая часть разбора сохранены. План можно собрать повторно, не заполняя анкету заново."
            : planReady
              ? "Все рекомендации и задачи готовы."
              : "Текущая и целевая модели уже готовы — их можно обсуждать с клиентом, пока система собирает рекомендации."}
        </p>
        <button
          type="button"
          className="primary-button route-button"
          onClick={backgroundError ? onRetryPlan : onOpenPlan}
          disabled={retrying || (!planReady && !backgroundError)}
        >
          {retrying ? "Собираем план…" : backgroundError ? "Повторить сборку плана" : planReady ? "Маршрут перехода" : "План ещё собирается"}
          {(planReady || backgroundError) && <ArrowIcon />}
        </button>
      </div>

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

function Field({
  label,
  name,
  multiline = false,
  rows = 2,
  className = "",
  variant = "text",
  values,
  setValues,
}: FieldProps) {
  const id = `field-${name}`;
  const value = values[name] ?? "";
  const displayValue = variant === "money" ? formatMoneyInput(value) : value;
  const updateValue = (nextValue: string) => {
    setValues((current) => ({
      ...current,
      [name]: variant === "money" ? formatMoneyInput(nextValue) : nextValue,
    }));
  };
  const shared = {
    id,
    name,
    value: displayValue,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      updateValue(event.target.value),
  };

  return (
    <label className={`field field-${variant} ${multiline ? "multiline-field" : ""} ${className}`} htmlFor={id}>
      <span>{label}</span>
      {variant === "money" ? (
        <span className="money-input-wrap">
          <input {...shared} className="money-input-control" inputMode="numeric" autoComplete="off" placeholder="0" />
          <span aria-hidden="true">₽</span>
        </span>
      ) : (
        <textarea {...shared} inputMode={variant === "number" ? "numeric" : undefined} rows={multiline ? rows : 1} />
      )}
    </label>
  );
}

function HamburgerIcon() {
  return (
    <span className="hamburger-icon" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function HeaderMenu({ onNewDiagnostic }: { onNewDiagnostic: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  return (
    <div className="header-menu" ref={menuRef}>
      <button
        type="button"
        className="header-menu-trigger"
        aria-label="Открыть меню"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <HamburgerIcon />
      </button>
      {open && (
        <div className="header-menu-popover" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onNewDiagnostic(); }}>
            Новый разбор
          </button>
          <a role="menuitem" href="/cabinet">Мои разборы</a>
          <button className="danger" type="button" role="menuitem" onClick={() => void logoutAndRedirect()}>
            Выйти
          </button>
        </div>
      )}
    </div>
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

type SubmittedDiagnostic = {
  values: Record<string, string>;
  deadline: string;
  clientsCountPeriod?: ClientsCountPeriod;
  desiredSystemHoursApplicable?: boolean;
  input: DiagnosticInputV1_2;
  diagnosticId: string;
  analysisRunId: string;
  status: "draft" | "queued";
};

type DiagnosticFormRecovery = {
  values: Record<string, string>;
  deadline: string;
  clientsCountPeriod: ClientsCountPeriod;
  desiredSystemHoursApplicable: boolean;
  activeTab: number;
  submittedDiagnostic: SubmittedDiagnostic | null;
};

type CreateDiagnosticResponse = {
  diagnosticId: string;
  analysisRunId: string;
  status: "draft" | "queued";
  input: DiagnosticInputV1_2;
  issues?: Array<{ message?: string }>;
  message?: string;
};

type RunAnalysisResponse = {
  status?: AnalysisProgressStatus;
  overview?: AnalysisOverview | null;
  result?: AnalysisResultV1;
  error?: string;
  message?: string;
};

type AnalysisRunStatusResponse = {
  status?: string;
  errorCode?: string | null;
  error?: string;
};

async function readJsonObject<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function submittedDiagnosticMatchesForm(
  submitted: SubmittedDiagnostic,
  values: Record<string, string>,
  deadline: string,
  clientsCountPeriod: ClientsCountPeriod,
  desiredSystemHoursApplicable: boolean,
): boolean {
  if (
    submitted.deadline !== deadline
    || submitted.clientsCountPeriod !== clientsCountPeriod
    || submitted.desiredSystemHoursApplicable !== desiredSystemHoursApplicable
  ) {
    return false;
  }

  const submittedValues = valuesForSubmission(submitted.values);
  const currentValues = valuesForSubmission(values);
  const keys = new Set([...Object.keys(submittedValues), ...Object.keys(currentValues)]);
  return [...keys].every((key) => submittedValues[key] === currentValues[key]);
}

function buildPrototypeAnalysis(diagnostic: SubmittedDiagnostic): BusinessAnalysisResult {
  const factualAnswers = [
    { title: "Откуда приходят клиенты", value: diagnostic.values.sources },
    { title: "Как устроены продажи", value: diagnostic.values.sales },
    { title: "Что покупают чаще", value: diagnostic.values.bestSeller },
    { title: "Лучший период", value: diagnostic.values.bestPeriod },
    { title: "Почему пока не получается", value: diagnostic.values.struggles },
  ]
    .filter((item) => item.value?.trim())
    .slice(0, 4)
    .map((item) => ({ title: item.title, explanation: item.value.trim() }));

  return {
    ...demoBusinessAnalysis,
    whyHere: factualAnswers.length >= 2 ? factualAnswers : demoBusinessAnalysis.whyHere,
  };
}

export default function Home() {
  const { user, loading: sessionLoading } = useAppSession({ redirectToLogin: true });
  const [activeTab, setActiveTab] = useState(0);
  const [currentStage, setCurrentStage] = useState(0);
  const [maxUnlockedStage, setMaxUnlockedStage] = useState(0);
  const [analysisSlide, setAnalysisSlide] = useState(0);
  const [values, setValues] = useState<Record<string, string>>(() => emptyDiagnosticValues());
  const [deadline, setDeadline] = useState("6 месяцев");
  const [clientsCountPeriod, setClientsCountPeriod] = useState<ClientsCountPeriod>("month");
  const [desiredSystemHoursApplicable, setDesiredSystemHoursApplicable] = useState(false);
  const [isSubmittingDiagnostic, setIsSubmittingDiagnostic] = useState(false);
  const [isSavingStart, setIsSavingStart] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [loadingTarget, setLoadingTarget] = useState<"analysis" | "plan" | null>(null);
  const [analysisProgressStatus, setAnalysisProgressStatus] = useState<AnalysisProgressStatus>("queued");
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null);
  const [submittedDiagnostic, setSubmittedDiagnostic] = useState<SubmittedDiagnostic | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisOverview | null>(null);
  const [realAnalysisResult, setRealAnalysisResult] = useState<AnalysisResultV1 | null>(null);
  const [analysisBackgroundError, setAnalysisBackgroundError] = useState<string | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);

  const situationParagraphs = useMemo(() => {
    const goal = formatRubles(values.goalIncome);
    const model = values.goalModel?.trim() || "_____";
    const now = formatRubles(values.currentIncome);
    const struggles = values.struggles?.trim() || "_____";
    const bestPeriod = values.bestPeriod?.trim() || "_____";
    const failures = values.failures?.trim() || "_____";
    return [
      <>Вы хотите прийти к <strong>{goal}</strong>, выстроив такую модель бизнеса: {model}. Сейчас у вас <strong>{now}</strong>.</>,
      <><strong>Почему пока не получается прийти к цели:</strong> {struggles}.</>,
      <><strong>Ваш лучший период:</strong> {bestPeriod}.</>,
      <><strong>Ошибки и провалы:</strong> {failures}.</>,
    ];
  }, [values]);

  useEffect(() => {
    let recovered: Partial<DiagnosticFormRecovery> | null = null;
    try {
      const stored = window.sessionStorage.getItem(FORM_RECOVERY_STORAGE_KEY);
      if (stored) recovered = JSON.parse(stored) as Partial<DiagnosticFormRecovery>;
    } catch {
      window.sessionStorage.removeItem(FORM_RECOVERY_STORAGE_KEY);
    }
    window.queueMicrotask(() => {
      if (recovered) {
        if (recovered.values && typeof recovered.values === "object") {
          setValues({ ...emptyDiagnosticValues(), ...recovered.values });
        }
        if (typeof recovered.deadline === "string") setDeadline(recovered.deadline);
        if (recovered.clientsCountPeriod === "month" || recovered.clientsCountPeriod === "launch") {
          setClientsCountPeriod(recovered.clientsCountPeriod);
        }
        if (typeof recovered.desiredSystemHoursApplicable === "boolean") {
          setDesiredSystemHoursApplicable(recovered.desiredSystemHoursApplicable);
        }
        if (Number.isInteger(recovered.activeTab) && Number(recovered.activeTab) >= 0 && Number(recovered.activeTab) <= 2) {
          setActiveTab(Number(recovered.activeTab));
        }
        if (recovered.submittedDiagnostic?.diagnosticId && recovered.submittedDiagnostic.analysisRunId) {
          setSubmittedDiagnostic(recovered.submittedDiagnostic);
          setMaxUnlockedStage(3);
        }
      }
      setRecoveryReady(true);
    });
  }, []);

  useEffect(() => {
    if (!recoveryReady) return;
    const snapshot: DiagnosticFormRecovery = {
      values,
      deadline,
      clientsCountPeriod,
      desiredSystemHoursApplicable,
      activeTab,
      submittedDiagnostic,
    };
    window.sessionStorage.setItem(FORM_RECOVERY_STORAGE_KEY, JSON.stringify(snapshot));
  }, [activeTab, clientsCountPeriod, deadline, desiredSystemHoursApplicable, recoveryReady, submittedDiagnostic, values]);

  const startNewDiagnostic = () => {
    const hasEnteredAnswers = Object.entries(values).some(([key, value]) =>
      key !== "clientPath" && Boolean(value.trim()),
    );
    if (hasEnteredAnswers && !window.confirm("Начать новый разбор? Текущая незавершённая форма будет очищена.")) return;
    window.sessionStorage.removeItem(FORM_RECOVERY_STORAGE_KEY);
    setValues(emptyDiagnosticValues());
    setDeadline("6 месяцев");
    setClientsCountPeriod("month");
    setDesiredSystemHoursApplicable(false);
    setActiveTab(0);
    setCurrentStage(0);
    setMaxUnlockedStage(0);
    setAnalysisSlide(0);
    setSubmittedDiagnostic(null);
    setAnalysisResult(null);
    setRealAnalysisResult(null);
    setAnalysisBackgroundError(null);
    setSubmissionError(null);
    setLoadingTarget(null);
    setAnalysisProgressStatus("queued");
    setAnalysisStartedAt(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToTab = (tab: number) => {
    setLoadingTarget(null);
    setCurrentStage(0);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const diagnosticPayload = (rawValues: Record<string, string>, intent?: "draft") => ({
    ...(intent ? { intent } : {}),
    sourceSchemaVersion: "diagnostic-flat-form.v1.2",
    rawAnswers: {
      values: valuesForSubmission(rawValues),
      deadline,
      clientsCountPeriod,
      desiredSystemWeeklyHoursApplicable: desiredSystemHoursApplicable,
    },
  });

  const redirectToLoginAfterExpiredSession = (response: Response): boolean => {
    if (response.status !== 401) return false;
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    return true;
  };

  const saveStartAndOpenProject = async () => {
    setSubmissionError(null);
    setIsSavingStart(true);
    const rawValues = { ...values };
    try {
      const response = submittedDiagnostic?.status === "draft"
        ? await fetch(`/api/diagnostics/${submittedDiagnostic.diagnosticId}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(diagnosticPayload(rawValues, "draft")),
          })
        : await fetch("/api/diagnostics", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(diagnosticPayload(rawValues, "draft")),
          });
      if (redirectToLoginAfterExpiredSession(response)) {
        throw new Error("Сессия входа завершилась. После входа заполненная форма восстановится автоматически.");
      }
      const result = (await response.json()) as CreateDiagnosticResponse;
      if (!response.ok) {
        throw new Error(result.issues?.[0]?.message ?? result.message ?? "Не удалось сохранить начало разбора.");
      }
      setSubmittedDiagnostic({
        values: rawValues,
        deadline,
        clientsCountPeriod,
        desiredSystemHoursApplicable,
        input: result.input,
        diagnosticId: result.diagnosticId,
        analysisRunId: result.analysisRunId,
        status: result.status,
      });
      goToTab(1);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Не удалось сохранить начало разбора.");
    } finally {
      setIsSavingStart(false);
    }
  };

  const openAnalysis = async () => {
    setSubmissionError(null);
    setAnalysisBackgroundError(null);
    setIsSubmittingDiagnostic(true);
    const rawValues = { ...values };
    let overviewAvailable = analysisResult !== null;

    try {
      let reusableDiagnostic = submittedDiagnostic;
      if (
        reusableDiagnostic?.status === "queued"
        && !submittedDiagnosticMatchesForm(
          reusableDiagnostic,
          rawValues,
          deadline,
          clientsCountPeriod,
          desiredSystemHoursApplicable,
        )
      ) {
        reusableDiagnostic = null;
      }

      if (reusableDiagnostic?.status === "queued") {
        const statusResponse = await fetch(`/api/analysis-runs/${reusableDiagnostic.analysisRunId}/run`, {
          method: "GET",
          credentials: "include",
          headers: { accept: "application/json" },
        });
        if (redirectToLoginAfterExpiredSession(statusResponse)) {
          throw new Error("Сессия входа завершилась. После входа заполненная форма восстановится автоматически.");
        }
        const status = await readJsonObject<AnalysisRunStatusResponse>(statusResponse);
        if (statusResponse.ok && status?.status === "analysis_failed") {
          if (status.errorCode?.startsWith("P02_")) {
            const retryResponse = await fetch(`/api/analysis-runs/${reusableDiagnostic.analysisRunId}/retry`, {
              method: "POST",
              credentials: "include",
            });
            if (redirectToLoginAfterExpiredSession(retryResponse)) {
              throw new Error("Сессия входа завершилась. После входа заполненная форма восстановится автоматически.");
            }
            const retried = await readJsonObject<RunAnalysisResponse>(retryResponse);
            if (!retryResponse.ok) {
              throw new Error(retried?.message ?? "Не удалось повторно собрать стратегию.");
            }
            if (retried?.status) setAnalysisProgressStatus(retried.status);
          } else {
            reusableDiagnostic = null;
          }
        }
      }

      let diagnostic: SubmittedDiagnostic;
      if (reusableDiagnostic?.status === "draft") {
        const response = await fetch(`/api/diagnostics/${reusableDiagnostic.diagnosticId}/submit`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(diagnosticPayload(rawValues)),
        });
        if (redirectToLoginAfterExpiredSession(response)) {
          throw new Error("Сессия входа завершилась. После входа заполненная форма восстановится автоматически.");
        }
        const result = (await response.json()) as CreateDiagnosticResponse;
        if (!response.ok) {
          throw new Error(result.issues?.[0]?.message ?? result.message ?? "Не удалось завершить сохранение диагностики.");
        }
        diagnostic = {
          values: rawValues,
          deadline,
          clientsCountPeriod,
          desiredSystemHoursApplicable,
          input: result.input,
          diagnosticId: result.diagnosticId,
          analysisRunId: result.analysisRunId,
          status: result.status,
        };
        setSubmittedDiagnostic(diagnostic);
      } else if (reusableDiagnostic) {
        diagnostic = reusableDiagnostic;
      } else {
        const response = await fetch("/api/diagnostics", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(diagnosticPayload(rawValues)),
        });
        if (redirectToLoginAfterExpiredSession(response)) {
          throw new Error("Сессия входа завершилась. После входа заполненная форма восстановится автоматически.");
        }
        const result = (await response.json()) as CreateDiagnosticResponse;
        if (!response.ok) {
          throw new Error(result.issues?.[0]?.message ?? result.message ?? "Не удалось сохранить диагностику.");
        }

        diagnostic = {
          values: rawValues,
          deadline,
          clientsCountPeriod,
          desiredSystemHoursApplicable,
          input: result.input,
          diagnosticId: result.diagnosticId,
          analysisRunId: result.analysisRunId,
          status: result.status,
        };
        setSubmittedDiagnostic(diagnostic);
      }
      setLoadingTarget(overviewAvailable ? null : "analysis");
      setAnalysisProgressStatus("queued");
      setAnalysisStartedAt(Date.now());
      setAnalysisSlide(0);
      window.scrollTo({ top: 0, behavior: "smooth" });

      const deadlineAt = Date.now() + 15 * 60 * 1000;
      let analysis: RunAnalysisResponse | null = null;
      while (Date.now() < deadlineAt) {
        try {
          const analysisResponse = await fetch(`/api/analysis-runs/${diagnostic.analysisRunId}/run`, {
            method: "POST",
            credentials: "include",
          });
          if (redirectToLoginAfterExpiredSession(analysisResponse)) {
            throw new Error("Сессия входа завершилась. После входа заполненная форма восстановится автоматически.");
          }
          analysis = await readJsonObject<RunAnalysisResponse>(analysisResponse);
          if (analysisResponse.ok && analysis?.status) {
            setAnalysisProgressStatus(analysis.status);
          }
          if (analysisResponse.ok && analysis?.overview && !overviewAvailable) {
            overviewAvailable = true;
            setAnalysisResult(analysis.overview);
            setCurrentStage(1);
            setMaxUnlockedStage((current) => Math.max(current, 1));
            setLoadingTarget(null);
            setAnalysisStartedAt(null);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
          if (analysisResponse.ok && analysis?.status === "ready" && analysis.result) break;
          if (analysisResponse.status === 422 || analysis?.error === "ANALYSIS_RUN_FAILED") {
            throw new Error(analysis?.message ?? "Разбор завершился ошибкой. Ответы сохранены в кабинете.");
          }
          if (analysisResponse.ok && analysis?.status && analysis.status !== "ready") {
            continue;
          }
        } catch (error) {
          if (error instanceof Error && /завершился ошибкой|Сессия входа завершилась/u.test(error.message)) throw error;
        }

        const statusResponse = await fetch(`/api/analysis-runs/${diagnostic.analysisRunId}/run`, {
          method: "GET",
          credentials: "include",
          headers: { accept: "application/json" },
        });
        if (redirectToLoginAfterExpiredSession(statusResponse)) {
          throw new Error("Сессия входа завершилась. После входа заполненная форма восстановится автоматически.");
        }
        const status = await readJsonObject<AnalysisRunStatusResponse>(statusResponse);
        if (status?.status && status.status in analysisProgressByStatus) {
          setAnalysisProgressStatus(status.status as AnalysisProgressStatus);
        }
        if (status?.status === "analysis_failed") {
          throw new Error("Разбор не удалось завершить. Ответы сохранены в кабинете.");
        }
        if (status?.status === "ready") {
          const resultResponse = await fetch(`/api/analysis-runs/${diagnostic.analysisRunId}/result`, {
            credentials: "include",
            headers: { accept: "application/json" },
          });
          if (redirectToLoginAfterExpiredSession(resultResponse)) {
            throw new Error("Сессия входа завершилась. После входа заполненная форма восстановится автоматически.");
          }
          const ready = await readJsonObject<RunAnalysisResponse>(resultResponse);
          if (resultResponse.ok && ready?.result) {
            analysis = ready;
            break;
          }
        }
        await wait(3000);
      }
      if (!analysis?.result) {
        throw new Error("Анализ занимает больше обычного. Ответы сохранены; результат появится в кабинете после завершения.");
      }
      setRealAnalysisResult(analysis.result);
      setCurrentStage(1);
      setMaxUnlockedStage(2);
      setLoadingTarget(null);
      setAnalysisStartedAt(null);
      window.sessionStorage.removeItem(FORM_RECOVERY_STORAGE_KEY);
    } catch (error) {
      setLoadingTarget(null);
      setAnalysisStartedAt(null);
      const message = error instanceof Error ? error.message : "Не удалось сохранить диагностику.";
      if (overviewAvailable) {
        setAnalysisBackgroundError(message);
      } else {
        setSubmissionError(message);
      }
    } finally {
      setIsSubmittingDiagnostic(false);
    }
  };

  const openTransitionPlan = () => {
    if (!realAnalysisResult) return;
    setCurrentStage(2);
    setMaxUnlockedStage((current) => Math.max(current, 2));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showJourneyStage = (stage: number) => {
    if (loadingTarget) return;
    if (stage === 3) {
      if (!submittedDiagnostic) return;
    } else if (stage > maxUnlockedStage) {
      return;
    }
    setCurrentStage(stage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const visibleAnalysis: AnalysisOverview = analysisResult ?? {
    archetype: demoBusinessAnalysis.archetype,
    systemScores: demoBusinessAnalysis.systemScores,
    currentScoreArguments: demoBusinessAnalysis.systemScores.map((score) => ({
      id: score.id,
      score: score.currentScore,
      evidence: [],
      matchedCriterion: null,
      whyNotHigher: null,
      kind: score.id === "authenticity" || score.id === "audience" ? "soft" : "hard",
    })),
  };

  if (sessionLoading || !user) {
    return <main className="admin-loading">Проверяю доступ…</main>;
  }

  return (
    <main className={`site-shell ${loadingTarget ? "is-neuro-loading" : ""}`}>
      {!loadingTarget && currentStage < 2 && <header className="site-header">
        <Brand />
        <HeaderMenu onNewDiagnostic={startNewDiagnostic} />
      </header>}

      {!loadingTarget && currentStage < 2 && <section className="hero" aria-labelledby="page-title">
        <span className="hero-badge">Авторский разбор для экспертов</span>
        <h1 id="page-title">Твоя Бизнес-Система</h1>
        <p>
          Оцифруйте свой проект и постройте аутентичную систему, которая
          <br className="desktop-break" /> дает ресурсы, а не забирает их.
        </p>
      </section>}

      {loadingTarget ? (
        <NeuroAnalysisScreen
          mode={loadingTarget}
          analysisStatus={analysisProgressStatus}
          startedAt={analysisStartedAt}
        />
      ) : currentStage === 0 ? (
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
                    <Field label="Доход в месяц" name="currentIncome" variant="money" values={values} setValues={setValues} />
                    <Field label="Количество клиентов" name="clientsCount" variant="number" values={values} setValues={setValues} />
                    <fieldset className="choice-fieldset clients-period-fieldset">
                      <legend>Количество указано</legend>
                      <div className="clients-period-options">
                        {[
                          { value: "month" as const, label: "За месяц" },
                          { value: "launch" as const, label: "За запуск" },
                        ].map((option) => (
                          <button
                            type="button"
                            key={option.value}
                            className={clientsCountPeriod === option.value ? "selected" : ""}
                            aria-pressed={clientsCountPeriod === option.value}
                            onClick={() => setClientsCountPeriod(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <Field label="Время на проект в неделю" name="weeklyTime" variant="number" values={values} setValues={setValues} />
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
                  <Field label="Доход в месяц" name="goalIncome" variant="money" values={values} setValues={setValues} />
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
                  <div className="conditional-time-field">
                    <label className="time-goal-toggle">
                      <input
                        type="checkbox"
                        checked={desiredSystemHoursApplicable}
                        onChange={(event) => setDesiredSystemHoursApplicable(event.target.checked)}
                      />
                      <span>
                        <strong>Свобода времени входит в цель</strong>
                        <small>Отметьте, если хотите сократить личное участие или выйти из операционки.</small>
                      </span>
                    </label>
                    {desiredSystemHoursApplicable && (
                      <Field label="Время на проект (система есть)" name="systemTime" variant="number" values={values} setValues={setValues} />
                    )}
                  </div>
                </div>
              </section>

              <button type="button" className="primary-button" onClick={() => void saveStartAndOpenProject()} disabled={isSavingStart}>
                {isSavingStart ? "Сохраняю…" : "Заполнить инфо о проекте"} {!isSavingStart && <ArrowIcon />}
              </button>
              {submissionError && <p className="diagnostic-submit-error" role="alert">{submissionError}</p>}
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
                    <Field className="client-path-field" label="Путь клиента" name="clientPath" multiline rows={3} values={values} setValues={setValues} />
                    <Field label="Продажи" name="sales" values={values} setValues={setValues} />
                  </div>
                  <div className="project-column project-assets-column">
                    <Field label="Социальные активы" name="socialAssets" multiline rows={3} values={values} setValues={setValues} />
                    <Field label="Команда" name="team" multiline rows={3} values={values} setValues={setValues} />
                    <Field label="Уникальность" name="uniqueness" multiline rows={3} values={values} setValues={setValues} />
                  </div>
                </div>
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
                  <Field className="experience-main-field" label="Трудности" name="struggles" multiline rows={1} values={values} setValues={setValues} />
                  <div className="experience-history-column">
                    <Field label="Лучший период" name="bestPeriod" multiline rows={5} values={values} setValues={setValues} />
                    <Field label="Ошибки и провалы" name="failures" multiline rows={5} values={values} setValues={setValues} />
                  </div>
                </div>
              </section>

              <section className="formula-section" aria-live="polite">
                <h3>Ваша ситуация</h3>
                <div className="formula-card">
                  <span className="quote-mark">“</span>
                  <div className="formula-paragraphs">
                    {situationParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                  </div>
                </div>
              </section>

              <div className="experience-actions">
                <button type="button" className="secondary-button" onClick={() => goToTab(0)}>
                  Исправить
                </button>
                <button
                  type="button"
                  className="primary-button compact"
                  onClick={openAnalysis}
                  disabled={isSubmittingDiagnostic}
                >
                  {isSubmittingDiagnostic ? "Сохраняю ответы…" : "Да, всё верно"} {!isSubmittingDiagnostic && <ArrowIcon />}
                </button>
              </div>
              {submissionError && <p className="diagnostic-submit-error" role="alert">{submissionError}</p>}
            </div>
          )}
        </div>
      </section>
      ) : currentStage === 3 && submittedDiagnostic ? (
        <section className="embedded-result wheel-stage">
          <GiftWheel analysisRunId={submittedDiagnostic.analysisRunId} />
        </section>
      ) : currentStage === 1 ? (
        <AnalysisSection
          analysis={visibleAnalysis}
          activeSlide={analysisSlide}
          setActiveSlide={setAnalysisSlide}
          onOpenPlan={openTransitionPlan}
          onRetryPlan={() => void openAnalysis()}
          planReady={Boolean(realAnalysisResult)}
          progressStatus={realAnalysisResult ? "ready" : analysisProgressStatus}
          backgroundError={analysisBackgroundError}
          retrying={isSubmittingDiagnostic}
          result={realAnalysisResult}
        />
      ) : realAnalysisResult ? (
        <section className="embedded-result">
          <AnalysisResultView
            result={realAnalysisResult}
            analysisRunId={submittedDiagnostic?.analysisRunId}
            view="plan"
            deadlineLabel={submittedDiagnostic?.deadline ?? deadline}
            currentRevenueRub={submittedDiagnostic?.input.current.monthlyRevenueRub}
            targetRevenueRub={submittedDiagnostic?.input.target.monthlyRevenueRub}
          />
        </section>
      ) : (
        <section className="embedded-result">
          <div className="route-action-wrap is-building">
            <span>План продолжает собираться</span>
            <h3>План перехода появится здесь сразу после завершения рекомендаций</h3>
          </div>
        </section>
      )}

      {!loadingTarget && <nav className={`journey ${currentStage >= 2 ? "journey-spacious" : ""}`} aria-label="Этапы работы">
        {stages.map((stage, index) => (
          <button
            type="button"
            aria-label={stage.accessibleLabel}
            className={`journey-stage ${index === currentStage ? "active" : ""}`}
            aria-current={index === currentStage ? "step" : undefined}
            disabled={Boolean(loadingTarget) || (index === 3 ? !submittedDiagnostic : index > maxUnlockedStage)}
            onClick={() => showJourneyStage(index)}
            key={stage.accessibleLabel}
          >
            <span className="journey-number">{index + 1}</span>
            {stage.label && <span>{stage.label}</span>}
          </button>
        ))}
      </nav>}
    </main>
  );
}
