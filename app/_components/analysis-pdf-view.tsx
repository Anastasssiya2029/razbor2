import Image from "next/image";
import type { AnalysisResultV1 } from "@/server/analysis-result/types";
import { BUSINESS_ARCHETYPE_BY_ID } from "@/server/7k/config/archetypes.v2";
import { SEVEN_K_ELEMENTS } from "@/server/7k/config/elements.v1";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId } from "@/server/7k/types";
import { archetypeDefinitions } from "@/lib/business-analysis";
import { growthRole, orderedGrowthElements, resolveGrowthPriorityPlan } from "@/lib/growth-priority-plan";
import { ELEMENT_NEUROMARKETERS, NEUROMARKETERS } from "@/lib/neuromarketers";
import { declineRussianNameGenitive } from "@/lib/russian-name";
import { applyManagerPlan, buildCanonicalChecklist, type ManagerPlanVersion } from "@/lib/analysis-checklist";

type Props = {
  result: AnalysisResultV1;
  managerPlan?: ManagerPlanVersion | null;
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

function checklistRole(plan: ReturnType<typeof resolveGrowthPriorityPlan>, elementId: SevenKElementId): string {
  return elementId === "funnel" && plan.deferred.includes(elementId)
    ? "Рабочий путь клиента"
    : growthRole(plan, elementId);
}

function PdfBrand({ page }: { page: number }) {
  return <>
    <header className="analysis-pdf-brand">
      <div><b>Школа <i>♥</i> аутентичного <em>▼</em> маркетинга</b><span>СУХАРЕВОЙ АНАСТАСИИ</span></div>
    </header>
    <footer className="analysis-pdf-footer"><span>kurs-neuro.ru</span><span>{String(page).padStart(2, "0")}</span></footer>
  </>;
}

function PdfSystemModel({ result }: { result: AnalysisResultV1 }) {
  return <div className="analysis-pdf-system-model" aria-label="Бизнес-модель под денежную цель">
    {SEVEN_K_ELEMENTS.map((element) => {
      const current = result.current.scores[element.id];
      const target = result.target.targetScores[element.id];
      return <div className={`analysis-pdf-model-column ${current === target ? "paused" : ""}`} key={element.id}>
        <strong>{target}</strong>
        <div className="analysis-pdf-bricks">
          {Array.from({ length: 10 }, (_, index) => {
            const level = 10 - index;
            const state = level <= current
              ? `current ${element.id === "authenticity" || element.id === "audience" ? "soft" : "hard"}`
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

export function AnalysisPdfView({ result, managerPlan, deadlineLabel, currentRevenueRub, targetRevenueRub }: Props) {
  const growthPlan = resolveGrowthPriorityPlan(result);
  const clientNameGenitive = result.clientContext.expertName
    ? declineRussianNameGenitive(result.clientContext.expertName)
    : "клиента";
  const archetypeId = result.archetype.finalArchetype;
  const archetype = BUSINESS_ARCHETYPE_BY_ID[archetypeId];
  const archetypeCopy = archetypeDefinitions[archetypeId];
  const pausedElements = SEVEN_K_ELEMENT_IDS.filter(
    (elementId) => result.target.targetScores[elementId] === result.current.scores[elementId],
  );
  const supportCopy = growthPlan.supporting.length > 0
    ? "Поддерживают ключевую связку: помогают точнее упаковать предложение, удерживать контакт с аудиторией и усиливать поток качественных лидов."
    : "Дополнительные элементы подключаются только после проверки ключевой связки.";
  const pausedCopy = pausedElements.length > 0
    ? "Сохраняем текущий уровень и возвращаемся к этим элементам после проверки ключевой денежной связки."
    : "Нет отдельных направлений, которые нужно удерживать без развития на этом этапе.";
  const checklistOrder = orderedGrowthElements(growthPlan);
  const checklistCards = applyManagerPlan(
    buildCanonicalChecklist(result),
    managerPlan,
    result.provenance.assemblyInputHash,
  ).toSorted((left, right) => checklistOrder.indexOf(left.elementId) - checklistOrder.indexOf(right.elementId));
  const printedAt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());

  return <section className="analysis-pdf" aria-hidden="true">
    <article className="analysis-pdf-page analysis-pdf-cover-page">
      <PdfBrand page={1} />
      <div className="analysis-pdf-cover-content">
        <span className="analysis-pdf-pill">ПЕРСОНАЛЬНАЯ СТРАТЕГИЯ 7К</span>
        <h1>Индивидуальный план<br />системного роста для {clientNameGenitive}</h1>
        <div className="analysis-pdf-money-card">
          <small>ПЕРЕХОД К ДЕНЕЖНОЙ ЦЕЛИ</small>
          <div>
            <strong>{currentRevenueRub == null ? "—" : money(currentRevenueRub)}</strong>
            <i>→</i>
            <strong>{targetRevenueRub == null ? "—" : money(targetRevenueRub)}</strong>
            <em>{(deadlineLabel ? `за ${deadlineLabel}` : "по выбранному сроку").toLocaleUpperCase("ru-RU")}</em>
          </div>
        </div>
        <div className="analysis-pdf-seven-k-intro">
          <h2>БИЗНЕС-МОДЕЛЬ 7К — семь ключевых вопросов</h2>
          <p>на которые нужно ответить бизнесу, чтобы понять, что ограничивает рост и как увеличить доход.</p>
          <div className="analysis-pdf-pyramid">
            {SEVEN_K_QUESTIONS.map((item, index) => <div className={item.number <= 3 ? "foundation" : ""} key={item.number}>
              <b style={{ width: `${42 + index * 8}%` }}>{item.number}. {item.label}</b>
              <span>{item.question}</span>
            </div>)}
          </div>
        </div>
      </div>
      <time className="analysis-pdf-date">{printedAt}</time>
    </article>

    <article className="analysis-pdf-page analysis-pdf-model-page">
      <PdfBrand page={2} />
      <div className="analysis-pdf-page-content">
        <h2>Бизнес-модель под денежную цель</h2>
        <p className="analysis-pdf-lead">Чтобы выйти на денежную цель, нужно усилить ключевые, на текущий момент, элементы бизнес-модели и сохранить то, что уже работает.</p>
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
          <section><small>ПОКА НЕ ТРОГАЕМ</small><h3>{names(pausedElements)}</h3><p>{pausedCopy}</p></section>
        </div>
      </div>
    </article>

    <article className="analysis-pdf-page analysis-pdf-archetype-page">
      <PdfBrand page={3} />
      <div className="analysis-pdf-page-content">
        <h2>Бизнес-архетип текущей модели</h2>
        <p className="analysis-pdf-lead">Архетип показывает способ находить решения на текущем уровне, а не описывает характер человека.</p>
        <div className="analysis-pdf-archetype-grid">
          <section className="analysis-pdf-archetype-face">
            <Image src={ARCHETYPE_IMAGES[archetypeId]} alt="" width={720} height={960} unoptimized />
            <h3>{archetype.name.toLocaleUpperCase("ru-RU")}</h3>
            <blockquote>{archetypeCopy.quote}</blockquote>
            <p>{result.report.archetype.summary}</p>
          </section>
          <section className="analysis-pdf-archetype-message">
            <h3>Что поможет<br />перейти дальше</h3>
            <h4>{archetypeCopy.transitionKey}</h4>
            <hr />
            <ul>{archetypeCopy.actions.map((action) => <li key={action}>{action}</li>)}</ul>
            <strong>{archetypeId === "explorer"
              ? "Следующий шаг — перестать копить чужие решения и собрать первый работающий элемент собственной системы."
              : `Следующий шаг — ${archetypeCopy.transitionKey.charAt(0).toLocaleLowerCase("ru-RU")}${archetypeCopy.transitionKey.slice(1)}`}</strong>
          </section>
        </div>
      </div>
    </article>

    {checklistCards.map((card, cardIndex) => {
      const specialistIds = ELEMENT_NEUROMARKETERS[card.elementId];
      return <article className="analysis-pdf-page analysis-pdf-checklist-page" key={card.elementId}>
        <PdfBrand page={cardIndex + 4} />
        <div className="analysis-pdf-page-content">
          <div className="analysis-pdf-checklist-title">
            <h2>Чек-лист перехода</h2>
            <strong>{String(cardIndex + 1).padStart(2, "0")} / {String(checklistCards.length).padStart(2, "0")}</strong>
          </div>
          <p className="analysis-pdf-checklist-subtitle">Задачи можно распечатать и отмечать по мере выполнения.</p>
          <section className="analysis-pdf-checklist-card">
            <div className="analysis-pdf-checklist-main">
              <small>{checklistRole(growthPlan, card.elementId).toLocaleUpperCase("ru-RU")}</small>
              <h3>{elementName(card.elementId)}</h3>
              <b>Балл: {card.fromScore} → {card.toScore}</b>
              <ol className={`analysis-pdf-task-list task-count-${Math.min(card.tasks.length, 4)} ${card.tasks.length > 3 ? "dense" : ""}`}>
                {card.tasks.map((task) => <li key={task.id}>
                  <i />
                  <div>
                    <strong>{task.task}</strong>
                    <span>Готово, когда:</span>
                    <p>{task.doneWhen}</p>
                  </div>
                </li>)}
              </ol>
            </div>
            <aside className="analysis-pdf-neuro-card">
              <small>ПОМОЖЕТ ВНЕДРИТЬ</small>
              <div className={`analysis-pdf-neuro-list ${specialistIds.length > 1 ? "multiple" : ""}`}>
                {specialistIds.map((specialistId) => {
                  const specialist = NEUROMARKETERS[specialistId];
                  return <article key={specialistId}>
                    <Image src={specialist.image} alt="" width={240} height={240} unoptimized />
                    <h3>{specialist.name}</h3>
                    <b>{elementName(card.elementId)}</b>
                    <p>{specialist.description}</p>
                  </article>;
                })}
              </div>
              <span>Нейропомощник создан по авторской технологии</span>
            </aside>
          </section>
        </div>
      </article>;
    })}
  </section>;
}
