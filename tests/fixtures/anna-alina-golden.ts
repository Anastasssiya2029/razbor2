import type { DiagnosticInputV1_2 } from "../../lib/diagnostic-input";
import type { BusinessArchetypeId } from "../../server/7k/config/archetypes.v1";
import type { MoneyNowScenarioId } from "../../server/7k/config/money-now.v2.2";
import type { TransitionMilestone } from "../../server/7k/transition-resolver";
import type { SevenKElementId, SevenKScores } from "../../server/7k/types";

export type GoldenStrategyExpectation = {
  priority: SevenKElementId;
  build: SevenKElementId[];
  later: SevenKElementId[];
  moneyNowScenario: MoneyNowScenarioId;
  moneyNowReason: string;
  transitionSequence: TransitionMilestone[];
};

export type SevenKGoldenCase = {
  id: "anna" | "alina";
  input: DiagnosticInputV1_2;
  currentScores: SevenKScores;
  currentTotal: number;
  currentArchetype: BusinessArchetypeId;
  targetScores: SevenKScores;
  targetTotal: number;
  strategy: GoldenStrategyExpectation;
};

export const ANNA_GOLDEN_CASE: SevenKGoldenCase = {
  id: "anna",
  input: {
    schemaVersion: "1.2",
    identity: {
      expertName: "Анна",
      niche: "Психолог по поиску предназначения",
    },
    current: {
      monthlyRevenueRub: 70_000,
      monthlyRevenueContext: "Средняя выручка за последние 6 месяцев, достаточно ровная.",
      payingClientsCount: 10,
      clientsCountPeriod: "month",
      weeklyHours: 30,
      products: "Только разовая консультация по работе с эмоциями стоимостью 3 500 ₽; пакетов и программ нет.",
      bestSeller: "Покупают разовую консультацию за 3 500 ₽; более дорогого предложения пока нет.",
      freeProducts: "Бесплатных продуктов нет.",
    },
    target: {
      monthlyRevenueRub: 200_000,
      businessModel:
        "Продуманная индивидуальная программа сопровождения 1:1 по поиску предназначения.",
      deadlineMonths: 12,
      delegation:
        "В ближайшей цели оставить клиентскую работу себе, использовать AI как помощь; продажи, маркетинг и блог не переводить сразу в автономные функции.",
      desiredSystemWeeklyHours: null,
    },
    project: {
      clients:
        "Женщины в найме, упёршиеся в финансовый и смысловой потолок и выбирающие следующий путь самореализации.",
      result:
        "Ясность предназначения и ближайшего вектора: менять работу, позицию, компанию или открывать своё дело.",
      sources:
        "Практически только рекомендации; поток неровный. В лучший месяц с тематического нетворкинга пришло около 20 человек.",
      clientPath:
        "WhatsApp → информация о цене → разовая платная встреча; системного следующего предложения и follow-up нет.",
      sales:
        "Отдельной технологии нет, продажи идут интуитивно; более дорогого следующего предложения после консультации нет.",
      socialAssets:
        "Около 20 контактов, блог примерно на 15 подписчиков и неактивный профиль специалиста.",
      team: "Команды нет; AI используется как помощник для черновиков постов.",
      uniqueness:
        "Эмпатия, профессионализм, приятный голос и мягкое пространство, но суперсилы ещё не собраны в цельное «почему я» и не перенесены в продукт и продажи.",
    },
    experience: {
      struggles:
        "Около двух лет не понимает, за что хвататься; считает главным препятствием нехватку клиентов.",
      bestPeriod:
        "Тематический нетворкинг два года назад привёл около 20 человек и дал 150 000 ₽ при тех же продуктах и ценах.",
      failures:
        "Полная передача постов AI дала неинтересный контент; теперь AI используется только как помощник с ручной доработкой.",
    },
  },
  currentScores: {
    authenticity: 2,
    audience: 3,
    product_method: 1,
    sales_technology: 2,
    funnel: 2,
    blog: 1,
    team: 1,
  },
  currentTotal: 12,
  currentArchetype: "explorer",
  targetScores: {
    authenticity: 4,
    audience: 4,
    product_method: 4,
    sales_technology: 5,
    funnel: 3,
    blog: 1,
    team: 1,
  },
  targetTotal: 22,
  strategy: {
    priority: "product_method",
    build: ["sales_technology", "funnel"],
    later: ["authenticity", "audience"],
    moneyNowScenario: "MN06",
    moneyNowReason:
      "Есть довольные клиенты и результат; рекомендации уже приводят людей, но не запрашиваются и не измеряются как регулярный источник.",
    transitionSequence: [
      { element_id: "product_method", from_score: 1, to_score: 4 },
      { element_id: "authenticity", from_score: 2, to_score: 4 },
      { element_id: "audience", from_score: 3, to_score: 4 },
      { element_id: "sales_technology", from_score: 2, to_score: 5 },
      { element_id: "funnel", from_score: 2, to_score: 3 },
    ],
  },
};

export const ALINA_GOLDEN_CASE: SevenKGoldenCase = {
  id: "alina",
  input: {
    schemaVersion: "1.2",
    identity: {
      expertName: "Алина",
      niche: "Маркетолог, наставник",
    },
    current: {
      monthlyRevenueRub: 300_000,
      monthlyRevenueContext: "Выручка волатильна: примерно от 60 000 ₽ до 700 000 ₽.",
      payingClientsCount: 10,
      clientsCountPeriod: "month",
      weeklyHours: 60,
      products:
        "Продукт в записи 30 000 ₽, сопровождение 150 000 ₽ и тариф с личным участием Алины 300 000 ₽.",
      bestSeller: "Чаще всего покупают самостоятельный тариф за 30 000 ₽.",
      freeProducts: "Бесплатный урок в боте и бесплатный разбор.",
    },
    target: {
      monthlyRevenueRub: 800_000,
      businessModel:
        "Автоматизированная модель с доступным продуктом в записи и отдельным разбором.",
      deadlineMonths: 6,
      delegation:
        "Оставить продукт и контроль команды; передать устойчивые функции и перейти от личной операционки к владельцам направлений.",
      desiredSystemWeeklyHours: 25,
    },
    project: {
      clients:
        "Эксперты, уже пробовавшие отдельные инструменты, которым нужна целостная система маркетинга и продаж; есть правила квалификации «свой/не свой».",
      result:
        "Понимание и внедрение повторяемой бизнес-системы; на дорогих тарифах — окупаемость и стабильные 300 000 ₽.",
      sources:
        "Основной стабильный источник — платные Telegram-рассылки/посевы: около 10 000 контактов → 50 человек в бот → около 3 покупок.",
      clientPath:
        "Рассылка → бот → переписка и квалификация → разбор → продажа → follow-up; при отказе возможен возврат позже.",
      sales:
        "Есть формализованные переписки, квалификация, продающие встречи, работа с возражениями, follow-up и цифровой учёт.",
      socialAssets:
        "Telegram-канал около 1 600 подписчиков и база бота около 3 000 человек; базе давно не делали предложений и рассылок.",
      team:
        "Около 15 человек, владельцы метрик, регламенты и онбординги; часть процессов делегирована, но маркетинговая и управленческая операционка остаётся на Алине.",
      uniqueness:
        "Метод «Маркетинг-бит» соединяет творческое и технологичное; это проявляется в продукте, упаковке, AI-инструментах, речи и продажах и подтверждается клиентами.",
    },
    experience: {
      struggles:
        "Последние полгода операционка и маркетинг остаются на Алине, есть зависимость от одной воронки и непонятно сезонное падение конверсии.",
      bestPeriod:
        "В декабре около 1,5 млн ₽ при трёх менеджерах и активном заполнении их окон; позже больший поток лидов не восстановил записи на разбор.",
      failures:
        "Неудачные делегирование копирайтинга, слишком короткое наставничество, дорогой подрядчик по рассылкам и отсутствие летней продуктовой подготовки.",
    },
  },
  currentScores: {
    authenticity: 7,
    audience: 6,
    product_method: 8,
    sales_technology: 9,
    funnel: 7,
    blog: 6,
    team: 6,
  },
  currentTotal: 49,
  currentArchetype: "magician",
  targetScores: {
    authenticity: 7,
    audience: 8,
    product_method: 8,
    sales_technology: 9,
    funnel: 8,
    blog: 6,
    team: 8,
  },
  targetTotal: 54,
  strategy: {
    priority: "team",
    build: ["funnel", "audience"],
    later: [],
    moneyNowScenario: "MN08",
    moneyNowReason:
      "Есть собственная база бота около 3 000 человек, которой давно не делали предложений; продукт в записи позволяет провести тест без увеличения личного сопровождения.",
    transitionSequence: [
      { element_id: "team", from_score: 6, to_score: 8 },
      { element_id: "audience", from_score: 6, to_score: 8 },
      { element_id: "funnel", from_score: 7, to_score: 8 },
    ],
  },
};

export const SEVEN_K_GOLDEN_CASES = [ANNA_GOLDEN_CASE, ALINA_GOLDEN_CASE] as const;
