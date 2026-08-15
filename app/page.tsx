"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type ArchetypeKind = "altruist" | "explorer" | "creator" | "hero" | "magician" | "seer" | "ruler";

const archetypeJourney: { id: number; name: string; kind: ArchetypeKind; state?: "current" | "next" }[] = [
  { id: 1, name: "Альтруист", kind: "altruist" },
  { id: 2, name: "Искатель", kind: "explorer", state: "current" },
  { id: 3, name: "Творец", kind: "creator", state: "next" },
  { id: 4, name: "Герой", kind: "hero" },
  { id: 5, name: "Волшебник", kind: "magician" },
  { id: 6, name: "Провидец", kind: "seer" },
  { id: 7, name: "Правитель", kind: "ruler" },
];

const analysisReasons = [
  "Снижение цены не увеличило поток, следовательно, проблема не доказана как «клиентам дорого».",
  "Когда Екатерина делала личные приглашения, продажи происходили.",
  "Клиенты уже оставались в работе несколько месяцев, следовательно, длительная помощь востребована.",
  "У неё есть свободная ёмкость, поэтому пока не нужны группа, команда и автоматизация.",
];

const growthLevers = [
  {
    role: "Ведущий элемент",
    title: "Технология продаж",
    notBuilt: "Нет повторяемого перехода от разговора о проблеме к предложению длительной работы.",
    impact: "Человек либо покупает одну встречу, либо уходит, не увидев понятного пути.",
    change: "Одна структура встречи и одно предложение стартового пакета.",
    criterion: "Проведено не менее десяти однотипных разговоров; понятно, сколько людей покупает и какие возражения повторяются.",
  },
  {
    role: "Поддерживающий элемент",
    title: "Продукты и авторский метод",
    notBuilt: "Нет первого законченного продукта между «одной сессией» и «терапией неизвестной длительности».",
    impact: "Клиенту трудно покупать неопределённый процесс.",
    change: "Пакет из четырёх встреч с понятной задачей, логикой и первым результатом.",
    criterion: "Екатерина объясняет продукт за минуту, а клиент понимает, что произойдёт на четырёх встречах.",
  },
  {
    role: "Поддерживающий элемент",
    title: "Аутентичность",
    notBuilt: "Екатерина не опирается на десятилетний путь обучения и реальные длительные результаты. Она всё ещё называет себя начинающей и снижает цену из внутреннего сомнения.",
    impact: "Она не делает достаточного количества предложений и отступает в цене до проверки реакции клиента.",
    change: "Двухдневная работа с Соулой: опыт, суперсилы, ценность, собственный способ помощи, право на цену, короткая самопрезентация.",
    criterion: "Она спокойно называет стоимость 2 500 ₽, презентует пакет 10 000 ₽ и не снижает цену заранее.",
  },
];

const notNowItems = [
  ["Не строить автоворонку", "Пока не подтверждено само предложение."],
  ["Не запускать платную рекламу", "Она масштабирует и продажи, и текущие потери."],
  ["Не создавать большую группу", "Индивидуальная модель ещё не заполнена."],
  ["Не делать блог главным проектом месяца", "Он может поддерживать доверие, но деньги сейчас ближе к тёплым контактам."],
  ["Не создавать длинную линейку продуктов", "Нужен один подтверждённый основной формат."],
];

const repeatableSteps = [
  "Подтвердить продажу стартового пакета.",
  "Собрать причины покупок и отказов.",
  "Уточнить на этом материале свою аудиторию и авторский метод.",
  "Создать регулярный способ получать тёплые обращения: рекомендации, партнёры, блог или короткие продукты.",
  "Только после стабильной ручной продажи автоматизировать отдельные шаги.",
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
      {kind === "seer" && (
        <>
          <path {...common} d="M3.2 12s3.2-5.1 8.8-5.1 8.8 5.1 8.8 5.1-3.2 5.1-8.8 5.1S3.2 12 3.2 12Z" />
          <circle {...common} cx="12" cy="12" r="2.4" />
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

function ArchetypeMedallion({ className = "" }: { className?: string }) {
  return (
    <span className={`archetype-medallion ${className}`} aria-hidden="true">
      <span className="medallion-orbit" />
      <ArchetypeGlyph kind="explorer" />
    </span>
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

function ArchetypeDialog({
  open,
  flipped,
  onFlip,
  onClose,
}: {
  open: boolean;
  flipped: boolean;
  onFlip: () => void;
  onClose: () => void;
}) {
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
              <ArchetypeMedallion className="card-medallion" />
              <strong id="archetype-card-title">Искатель</strong>
              <span className="archetype-card-quote">
                «Я больше не жду, что клиенты придут сами. Я ищу способ, который приведёт новых клиентов».
              </span>
              <span className="archetype-card-hint">Нажмите на карту, чтобы увидеть ключ перехода</span>
            </span>

            <span className="archetype-card-face archetype-card-back" aria-hidden={!flipped}>
              <span className="archetype-card-eyebrow">Искатель → Творец</span>
              <span className="archetype-back-icon"><ArchetypeGlyph kind="creator" /></span>
              <span className="archetype-back-section">
                <b>Ключ перехода</b>
                <strong>Перестать искать, начать действовать и создавать.</strong>
              </span>
              <span className="archetype-back-section actions">
                <b>Что важно сделать</b>
                <span>Остановить бесконечное накопление инструментов и выбрать одно направление.</span>
                <span>Перевести знания в собственный продукт, контент или способ продвижения.</span>
                <span>Дать созданному время на проверку, прежде чем снова менять стратегию.</span>
              </span>
              <span className="archetype-card-hint">Нажмите, чтобы перевернуть обратно</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function EvolutionMap() {
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
              <span className="evolution-stage-number">{String(stage.id).padStart(2, "0")}</span>
              <span className="evolution-orb">
                <ArchetypeGlyph kind={stage.kind} />
              </span>
              <strong className="evolution-stage-label">{stage.name}</strong>
              {stage.state === "current" && <small>Вы здесь</small>}
              {stage.state === "next" && <small>Следующий уровень</small>}
            </article>
          ))}
        </div>
      </div>
      <p className="evolution-caption">
        Альтруист ждёт оценки. Искатель ищет способ. Творец создаёт. Герой связывает и ведёт результат. Волшебник знает формулу. Провидец передаёт её системе. Правитель масштабирует через сильных лидеров.
      </p>
    </section>
  );
}

function BusinessAnalysis() {
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
          <h3 id="money-now-title">
            Деньги находятся в уже доступных тёплых контактах и в переводе человека из разовой дешёвой сессии в понятный стартовый формат длительной работы.
          </h3>
        </div>
        <div className="month-focus">
          <span>Фокус на 30 дней</span>
          <strong>Тёплый контакт</strong>
          <i aria-hidden="true">→</i>
          <strong>Диагностический разговор</strong>
          <i aria-hidden="true">→</i>
          <strong>Пакет из четырёх встреч</strong>
        </div>
      </section>

      <section className="result-section reasons-section" aria-labelledby="reasons-title">
        <div className="result-section-heading">
          <span className="section-index">01</span>
          <div>
            <h3 id="reasons-title">Почему именно здесь</h3>
            <p>Четыре факта, на которых держится вывод.</p>
          </div>
        </div>
        <div className="reason-grid">
          {analysisReasons.map((reason, index) => (
            <article className="reason-card" key={reason}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{reason}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="result-section revenue-section" aria-labelledby="revenue-title">
        <div className="result-section-heading">
          <span className="section-index">02</span>
          <div>
            <h3 id="revenue-title">Как это может повлиять на деньги</h3>
            <p>Проверяемая экономика без необходимости сразу строить большой блог.</p>
          </div>
        </div>
        <div className="revenue-board">
          <div className="package-formula">
            <span>1 встреча</span>
            <strong>2 500 ₽</strong>
            <i aria-hidden="true">× 4</i>
            <span>Стартовый пакет</span>
            <strong className="package-total">10 000 ₽</strong>
          </div>
          <div className="revenue-scenarios">
            {[["2 продажи", "20 000 ₽"], ["3 продажи", "30 000 ₽"], ["4 продажи", "40 000 ₽"]].map(([label, value]) => (
              <div className="revenue-scenario" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="capacity-card">
            <span>Модель цели</span>
            <strong>6 активных клиентов × 4 встречи × 2 500 ₽</strong>
            <b>≈ 60 000 ₽ в месяц</b>
          </div>
        </div>
        <p className="result-note">
          Это не обещание, что шесть клиентов появятся за 30 дней. Это показывает, что для цели 60 000 ₽ Екатерине не нужен огромный блог. Ей нужно постепенно собрать примерно шесть стабильных клиентских мест.
        </p>
      </section>

      <section className="change-card" aria-labelledby="change-title">
        <span className="change-days">30 дней</span>
        <div>
          <span className="result-kicker">Что изменить</span>
          <h3 id="change-title">Перестать предлагать только отдельную сессию за 1 000 ₽.</h3>
          <p>Подтвердить продажу одного понятного стартового пакета длительной работы через тёплые диагностические разговоры.</p>
        </div>
      </section>

      <section className="result-section levers-section" aria-labelledby="levers-title">
        <div className="result-section-heading">
          <span className="section-index">03</span>
          <div>
            <h3 id="levers-title">Что усиливает связку</h3>
            <p>Один ведущий и два поддерживающих элемента системы.</p>
          </div>
        </div>
        <div className="lever-grid">
          {growthLevers.map((lever, index) => (
            <article className={`lever-card ${index === 0 ? "leading" : ""}`} key={lever.title}>
              <span className="lever-role">{lever.role}</span>
              <h4>{lever.title}</h4>
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
                  <dd>{lever.change}</dd>
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
          <span className="section-index">04</span>
          <div>
            <h3 id="pause-title">Что пока не делать</h3>
            <p>Не распылять ресурс до подтверждения основной связки.</p>
          </div>
        </div>
        <div className="pause-grid">
          {notNowItems.map(([title, explanation]) => (
            <article className="pause-card" key={title}>
              <span aria-hidden="true">×</span>
              <div>
                <h4>{title}</h4>
                <p>{explanation}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="result-section repeat-section" aria-labelledby="repeat-title">
        <div className="result-section-heading">
          <span className="section-index">05</span>
          <div>
            <h3 id="repeat-title">Как сделать результат повторяемым</h3>
            <p>Последовательность, которая превращает ручную продажу в систему.</p>
          </div>
        </div>
        <ol className="repeat-steps">
          {repeatableSteps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
        <aside className="analysis-caveat">
          <span>Важно для точности вывода</span>
          <p>
            Если новые поля покажут, что у Екатерины не восемь обращений, а одно-два, вывод изменится. Тогда «Где деньги сейчас» будет не в технологии продажи, а в увеличении количества подходящих разговоров. Именно поэтому новые вопросы нам нужны.
          </p>
        </aside>
      </section>

      <EvolutionMap />

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

function AnalysisSection({ activeSlide, setActiveSlide }: { activeSlide: number; setActiveSlide: (slide: number) => void }) {
  const pointerStart = useRef<number | null>(null);
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  const [archetypeFlipped, setArchetypeFlipped] = useState(false);
  const slideCount = 3;
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
        aria-label="Открыть карту бизнес-архетипа Искатель"
        onClick={() => {
          setArchetypeFlipped(false);
          setArchetypeOpen(true);
        }}
      >
        <ArchetypeMedallion className="trigger-medallion" />
        <span>
          <small>Ваш архетип</small>
          <strong>Искатель</strong>
        </span>
      </button>

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

      <BusinessAnalysis />

      <ArchetypeDialog
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
