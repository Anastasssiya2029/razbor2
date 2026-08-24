import Image from "next/image";
import type { AnalysisResultV1 } from "@/server/analysis-result";
import { BUSINESS_ARCHETYPE_BY_ID } from "@/server/7k/config/archetypes.v1";
import { SEVEN_K_ELEMENTS } from "@/server/7k/config/elements.v1";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId } from "@/server/7k/types";
import { resolveTransitionSequence } from "@/server/7k/transition-resolver";
import { SEVEN_K_BUSINESS_LEVERS } from "@/lib/7k-business-levers";
import { archetypeDefinitions, systemScoreTone } from "@/lib/business-analysis";
import { growthRole, orderedGrowthElements, resolveGrowthPriorityPlan } from "@/lib/growth-priority-plan";
import { ELEMENT_NEUROMARKETERS, NEUROMARKETERS } from "@/lib/neuromarketers";
import { declineRussianNameGenitive } from "@/lib/russian-name";

type Props = {
  result: AnalysisResultV1;
  deadlineLabel?: string | null;
  currentRevenueRub?: number | null;
  targetRevenueRub?: number | null;
};

const ARCHETYPE_IMAGES = {
  altruist: "/archetype-altruist.jpg",
  explorer: "/archetype-explorer.jpg",
  creator: "/archetype-creator.jpg",
  hero: "/archetype-hero.png",
  magician: "/archetype-magician.png",
  ruler: "/archetype-ruler.png",
} as const;

const SEVEN_K_QUESTIONS = [
  { number: 7, label: "Команда", question: "Как сделать бизнес автономным?" },
  { number: 6, label: "Блог", question: "Как я проявляюсь в мире?" },
  { number: 5, label: "Воронка и связки", question: "Как ко мне приходят мои клиенты?" },
  { number: 4, label: "Технология продаж", question: "Как я продаю? Как я превращаю ценность в деньги?" },
  { number: 3, label: "Продукты и метод", question: "Какую ценность я создаю?" },
  { number: 2, label: "Своя ЦА", question: "Кто мои люди?" },
  { number: 1, label: "Аутентичность", question: "Кто я?" },
] as const;

function money(value: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function elementName(elementId: SevenKElementId, compact = false): string {
  if (compact && elementId === "product_method") return "Продукты и метод";
  if (compact && elementId === "funnel") return "Воронка и связки";
  return SEVEN_K_ELEMENTS.find((element) => element.id === elementId)?.name ?? elementId;
}

function names(elementIds: readonly SevenKElementId[]): string {
  return elementIds.length > 0
    ? elementIds.map((elementId) => elementName(elementId, true)).join(" + ")
    : "Нет отдельных направлений";
}

function PdfBrand({ page, totalPages }: { page: number; totalPages: number }) {
  return <>
    <header className="analysis-pdf-brand">
      <div><b>Школа <i>♥</i> аутентичного <em>▼</em> маркетинга</b><span>СУХАРЕВОЙ АНАСТАСИИ</span></div>
    </header>
    <footer className="analysis-pdf-footer"><span>kurs-neuro.ru</span><span>{String(page).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}</span></footer>
  </>;
}

function PdfSystemModel({ result }: { result: AnalysisResultV1 }) {
  return <div className="analysis-pdf-system-model" aria-label="Бизнес-модель под денежную цель">
    {SEVEN_K_ELEMENTS.map((element) => {
      const current = result.current.scores[element.id];
      const target = result.target.targetScores[element.id];
      return <div className="analysis-pdf-model-column" key={element.id}>
        <strong>{target}</strong>
        <div className="analysis-pdf-bricks">
          {Array.from({ length: 10 }, (_, index) => {
            const level = 10 - index;
            const state = level <= current
              ? `current ${systemScoreTone(current)}`
              : level <= target
                ? "added"
                : "empty";
            return <i className={state} key={level} />;
          })}
        </div>
        <span>{element.displayOrder}</span>
        <small>{elementName(element.id, true)}</small>
      </div>;
    })}
  </div>;
}

export function AnalysisPdfView({ result, deadlineLabel, currentRevenueRub, targetRevenueRub }: Props) {
  const growthPlan = resolveGrowthPriorityPlan(result);
  const clientNameGenitive = result.clientContext.expertName
    ? declineRussianNameGenitive(result.clientContext.expertName)
    : "клиента";
  const archetypeId = result.archetype.finalArchetype;
  const archetype = BUSINESS_ARCHETYPE_BY_ID[archetypeId];
  const archetypeCopy = archetypeDefinitions[archetypeId];
  const growingElements = orderedGrowthElements(growthPlan);
  const pausedElements = SEVEN_K_ELEMENT_IDS.filter(
    (elementId) => result.target.targetScores[elementId] === result.current.scores[elementId],
  );
  const pausedCopy = result.report.whyNotNow
    .filter((item) => pausedElements.includes(item.element_id))
    .map((item) => item.text)
    .slice(0, 2)
    .join(" ");
  const supportCopy = growthPlan.supporting.length > 0
    ? `Помогают упаковать ключевую связку: ${growthPlan.supporting.map((elementId) => SEVEN_K_BUSINESS_LEVERS[elementId].toLocaleLowerCase("ru-RU")).join(" и ")}.`
    : "Дополнительные элементы подключаются только после проверки ключевой связки.";
  const checklistCards = growingElements.map((elementId, index) => {
    const fromScore = result.current.scores[elementId];
    const toScore = result.target.targetScores[elementId];
    const transitions = resolveTransitionSequence([{ element_id: elementId, from_score: fromScore, to_score: toScore }]).tasks;
    const routeCard = result.route.cards.find((card) => card.elementId === elementId);
    const narrative = routeCard
      ? result.report.routeCards.find((item) => item.card_id === routeCard.cardId)
      : null;
    return { elementId, fromScore, toScore, transitions, narrative, order: index + 1 };
  });
  const totalPages = 3 + checklistCards.length;
  const printedAt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());

  return <section className="analysis-pdf" aria-hidden="true">
    <article className="analysis-pdf-page analysis-pdf-cover-page">
      <PdfBrand page={1} totalPages={totalPages} />
      <div className="analysis-pdf-cover-content">
        <span className="analysis-pdf-pill">ПЕРСОНАЛЬНАЯ СТРАТЕГИЯ 7К</span>
        <h1>Индивидуальный план<br />системного роста для {clientNameGenitive}</h1>
        <div className="analysis-pdf-money-card">
          <small>ПЕРЕХОД К ДЕНЕЖНОЙ ЦЕЛИ</small>
          <div>
            <strong>{currentRevenueRub == null ? "—" : money(currentRevenueRub)}</strong>
            <i>→</i>
            <strong>{targetRevenueRub == null ? "—" : money(targetRevenueRub)}</strong>
            <em>{deadlineLabel ? `за ${deadlineLabel}` : "по выбранному сроку"}</em>
          </div>
        </div>
        <div className="analysis-pdf-seven-k-intro">
          <h2>7К — семь ключевых вопросов бизнеса</h2>
          <p>Ответы на них показывают, что уже приносит деньги, что ограничивает рост и что нужно достроить следующим.</p>
          <div className="analysis-pdf-pyramid">
            {SEVEN_K_QUESTIONS.map((item, index) => <div className={item.number <= 3 ? "foundation" : ""} key={item.number}>
              <b style={{ width: `${42 + index * 8}%` }}>К{item.number}. {item.label}</b>
              <span>{item.question}</span>
            </div>)}
          </div>
        </div>
      </div>
      <time className="analysis-pdf-date">{printedAt}</time>
    </article>

    <article className="analysis-pdf-page analysis-pdf-model-page">
      <PdfBrand page={2} totalPages={totalPages} />
      <div className="analysis-pdf-page-content">
        <h2>Бизнес-модель под денежную цель</h2>
        <p className="analysis-pdf-lead">{result.report.targetConfiguration.summary}</p>
        <div className="analysis-pdf-legend">
          <span><i className="current" />Текущий уровень</span>
          <span><i className="added" />Что нужно достроить</span>
          <span><i className="empty" />Потенциал роста</span>
        </div>
        <PdfSystemModel result={result} />
        <section className="analysis-pdf-key-card">
          <small>КЛЮЧЕВАЯ СВЯЗКА</small>
          <h3>{names(growthPlan.core)}</h3>
          <p>{result.report.growthPoint.coach_explanation}</p>
        </section>
        <div className="analysis-pdf-secondary-cards">
          <section><small>ПОДДЕРЖИВАЮЩИЕ ЭЛЕМЕНТЫ</small><h3>{names(growthPlan.supporting)}</h3><p>{supportCopy}</p></section>
          <section><small>ПОКА НЕ ТРОГАЕМ</small><h3>{names(pausedElements)}</h3><p>{pausedCopy || "Возвращаемся к этим направлениям после проверки ключевой денежной связки."}</p></section>
        </div>
      </div>
    </article>

    <article className="analysis-pdf-page analysis-pdf-archetype-page">
      <PdfBrand page={3} totalPages={totalPages} />
      <div className="analysis-pdf-page-content">
        <span className="analysis-pdf-pill">БИЗНЕС-АРХЕТИП ТЕКУЩЕЙ МОДЕЛИ</span>
        <h2>{archetype.name}</h2>
        <div className="analysis-pdf-archetype-grid">
          <section className="analysis-pdf-archetype-face">
            <Image src={ARCHETYPE_IMAGES[archetypeId]} alt="" width={720} height={960} unoptimized />
            <h3>{archetype.name}</h3>
            <p>{result.report.archetype.summary}</p>
          </section>
          <section className="analysis-pdf-archetype-message">
            <small>ПОСЛАНИЕ ДЛЯ ПЕРЕХОДА</small>
            <blockquote>«{archetypeCopy.quote}»</blockquote>
            <h3>{archetypeCopy.transitionKey}</h3>
            <ul>{archetypeCopy.actions.map((action) => <li key={action}>{action}</li>)}</ul>
          </section>
        </div>
      </div>
    </article>

    {checklistCards.map((card, cardIndex) => {
      const specialistIds = ELEMENT_NEUROMARKETERS[card.elementId];
      return <article className="analysis-pdf-page analysis-pdf-checklist-page" key={card.elementId}>
        <PdfBrand page={cardIndex + 4} totalPages={totalPages} />
        <div className="analysis-pdf-page-content">
          <span className="analysis-pdf-pill">ЧЕК-ЛИСТ ПЕРЕХОДА · {growthRole(growthPlan, card.elementId).toLocaleUpperCase("ru-RU")}</span>
          <div className="analysis-pdf-checklist-heading">
            <span>{card.order}</span>
            <div><h2>{elementName(card.elementId)}</h2><strong>Балл: {card.fromScore} → {card.toScore}</strong></div>
          </div>
          {card.narrative?.why_now && <p className="analysis-pdf-checklist-intro">{card.narrative.why_now}</p>}
          <ol className={`analysis-pdf-task-list ${card.transitions.length > 5 ? "dense" : ""}`}>
            {card.transitions.map((task) => <li key={task.task_id}>
              <i />
              <div><strong>{task.task}</strong><span>Готово, когда: {task.done_when}</span></div>
            </li>)}
          </ol>
          <section className="analysis-pdf-neuro-card">
            <small>ПОМОЖЕТ ВНЕДРИТЬ</small>
            <div className="analysis-pdf-neuro-list">
              {specialistIds.map((specialistId) => {
                const specialist = NEUROMARKETERS[specialistId];
                return <article key={specialistId}>
                  <Image src={specialist.image} alt="" width={160} height={160} unoptimized />
                  <div><h3>{specialist.name}</h3><p>{specialist.description}</p><span>Нейропомощник создан по авторской технологии</span></div>
                </article>;
              })}
            </div>
          </section>
        </div>
      </article>;
    })}
  </section>;
}
