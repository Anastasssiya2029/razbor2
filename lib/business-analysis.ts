export type SystemElementId =
  | "authenticity"
  | "audience"
  | "products_method"
  | "sales_technology"
  | "funnel"
  | "blog"
  | "team";

export type ArchetypeId = "altruist" | "explorer" | "creator" | "hero" | "magician" | "ruler";

export type SystemScore = {
  id: SystemElementId;
  currentScore: number;
  targetScore: number;
  reasoning: string;
};

export type ElementRecommendation = {
  elementId: SystemElementId;
  notBuilt: string;
  impact: string;
  minimumChange: string;
  criterion: string;
};

export type BusinessAnalysisResult = {
  schemaVersion: "business_analysis_v1";
  moneyNow: {
    headline: string;
    chain: string[];
  };
  whyHere: Array<{
    title: string | null;
    explanation: string;
  }>;
  moneyImpact: null | {
    intro: string;
    formula: {
      baseLabel: string;
      baseValue: string;
      multiplierLabel: string;
      resultLabel: string;
      resultValue: string;
    };
    scenarios: Array<{
      label: string;
      value: string;
    }>;
    capacityModel: {
      label: string;
      formula: string;
      result: string;
    };
    disclaimer: string;
  };
  change30Days: {
    headline: string;
    explanation: string;
  };
  growthLink: {
    leading: ElementRecommendation;
    supporting: ElementRecommendation[];
  };
  doNotDo: Array<{
    title: string;
    explanation: string;
  }>;
  repeatabilitySteps: string[];
  importantCaveat: string | null;
  archetype: {
    id: ArchetypeId;
    evidence: string[];
  };
  systemScores: SystemScore[];
};

type SystemElementDefinition = {
  id: number;
  name: string;
  labelLines: string[];
  tone: "gold" | "coral";
};

export const systemElementOrder: SystemElementId[] = [
  "authenticity",
  "audience",
  "products_method",
  "sales_technology",
  "funnel",
  "blog",
  "team",
];

export const systemElementDefinitions: Record<SystemElementId, SystemElementDefinition> = {
  authenticity: { id: 1, name: "Аутентичность", labelLines: ["Аутентичность"], tone: "gold" },
  audience: { id: 2, name: "Своя ЦА", labelLines: ["Своя ЦА"], tone: "gold" },
  products_method: {
    id: 3,
    name: "Продукты и авторский метод",
    labelLines: ["Продукты и", "авторский метод"],
    tone: "coral",
  },
  sales_technology: {
    id: 4,
    name: "Технология продаж",
    labelLines: ["Технология", "продаж"],
    tone: "coral",
  },
  funnel: {
    id: 5,
    name: "Воронка продаж и связки",
    labelLines: ["Воронка продаж", "и связки"],
    tone: "coral",
  },
  blog: { id: 6, name: "Блог", labelLines: ["Блог"], tone: "coral" },
  team: { id: 7, name: "Команда", labelLines: ["Команда"], tone: "coral" },
};

type ArchetypeDefinition = {
  id: ArchetypeId;
  name: string;
  quote: string;
  nextId: ArchetypeId | null;
  transitionKey: string;
  actions: string[];
};

export const archetypeOrder: ArchetypeId[] = ["altruist", "explorer", "creator", "hero", "magician", "ruler"];

export const archetypeDefinitions: Record<ArchetypeId, ArchetypeDefinition> = {
  altruist: {
    id: "altruist",
    name: "Альтруист",
    quote: "Я даю много пользы и жду, что клиенты сами увидят мою ценность.",
    nextId: "explorer",
    transitionKey: "Увидеть свою уникальность и начать осознанно искать путь к клиенту.",
    actions: [
      "Назвать ценность своей работы и перестать обесценивать уже полученные результаты.",
      "Выбрать людей, которым эта ценность нужна больше всего.",
      "Сделать первые прямые предложения вместо ожидания внешней оценки.",
    ],
  },
  explorer: {
    id: "explorer",
    name: "Искатель",
    quote: "Я больше не жду, что клиенты придут сами. Я ищу способ, который приведёт новых клиентов.",
    nextId: "creator",
    transitionKey: "Перестать искать, начать действовать и создавать.",
    actions: [
      "Выбрать одно направление вместо нового круга поиска инструментов.",
      "Перевести знания в собственный продукт и понятное предложение.",
      "Дать созданному время на проверку, прежде чем снова менять стратегию.",
    ],
  },
  creator: {
    id: "creator",
    name: "Творец",
    quote: "Я постоянно что-то создаю, но пока не вижу стабильной финансовой отдачи.",
    nextId: "hero",
    transitionKey: "Связать созданное в работающий путь клиента и довести его до результата.",
    actions: [
      "Выбрать один основной продукт и один понятный результат для клиента.",
      "Соединить контент, предложение и продажу в одну проверяемую связку.",
      "Повторять выбранную связку достаточно долго, чтобы увидеть закономерность.",
    ],
  },
  hero: {
    id: "hero",
    name: "Герой",
    quote: "Результат уже есть, но я по-прежнему тащу весь бизнес на себе.",
    nextId: "magician",
    transitionKey: "Перестать побеждать усилием и описать собственную работающую формулу.",
    actions: [
      "Отделить обязательные действия от привычки всё контролировать лично.",
      "Зафиксировать повторяющиеся решения и критерии качества.",
      "Передать первые устойчивые процессы без потери результата.",
    ],
  },
  magician: {
    id: "magician",
    name: "Волшебник",
    quote: "Я знаю свою работающую формулу, но пока остаюсь её главным носителем.",
    nextId: "ruler",
    transitionKey: "Передать формулу системе и дать сильным людям право действовать.",
    actions: [
      "Собрать метод в понятные принципы, стандарты и точки контроля.",
      "Вырастить людей, которые способны принимать решения по этим принципам.",
      "Сместить свою роль от исполнения к развитию всей системы.",
    ],
  },
  ruler: {
    id: "ruler",
    name: "Правитель",
    quote: "Система работает без моего постоянного участия, а я усиливаю направление и масштаб.",
    nextId: null,
    transitionKey: "Укреплять культуру, лидерство и масштаб уже доказавшей себя системы.",
    actions: [
      "Сохранять ясные принципы, по которым система принимает решения.",
      "Развивать лидеров и новые центры ответственности.",
      "Масштабировать только то, что уже даёт устойчивый результат.",
    ],
  },
};

export type ResolvedSystemElement = SystemElementDefinition & {
  elementId: SystemElementId;
  current: number;
  added: number;
};

export type SystemScoreTone = "low" | "medium" | "high";

export function systemScoreTone(score: number): SystemScoreTone {
  if (score <= 3) return "low";
  if (score <= 6) return "medium";
  return "high";
}

export function resolveSystemElements(scores: SystemScore[]): ResolvedSystemElement[] {
  const scoresById = new Map(scores.map((score) => [score.id, score]));

  return systemElementOrder.map((elementId) => {
    const definition = systemElementDefinitions[elementId];
    const score = scoresById.get(elementId);
    const current = Math.max(0, Math.min(10, Math.round(score?.currentScore ?? 0)));
    const target = Math.max(current, Math.min(10, Math.round(score?.targetScore ?? current)));

    return {
      ...definition,
      elementId,
      current,
      added: target - current,
    };
  });
}

export const businessAnalysisGenerationInstructions = [
  "Проанализируй только факты из диагностики. Не придумывай выручку, конверсию, число обращений или клиентов.",
  "Верни только JSON по схеме business_analysis_v1, без Markdown, HTML, пояснений до или после JSON.",
  "Если денежный эффект нельзя корректно посчитать из входных данных, верни moneyImpact: null.",
  "Выбери один archetype.id из фиксированного списка. Не создавай название, цитату или рекомендации архетипа: интерфейс подставит каноническую карту.",
  "Верни ровно семь systemScores, по одному для каждого фиксированного элемента, и объясни каждый балл во внутреннем поле reasoning.",
  "Верни одну ведущую и ровно две поддерживающие рекомендации: ключевая связка всегда состоит из трёх элементов.",
  "Каждый вывод должен приводить к одному ближайшему проверяемому изменению, а не к общей мотивационной рекомендации.",
] as const;

export const businessAnalysisJsonSchema = {
  name: "business_analysis_v1",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "schemaVersion",
      "moneyNow",
      "whyHere",
      "moneyImpact",
      "change30Days",
      "growthLink",
      "doNotDo",
      "repeatabilitySteps",
      "importantCaveat",
      "archetype",
      "systemScores",
    ],
    properties: {
      schemaVersion: { type: "string", const: "business_analysis_v1" },
      moneyNow: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "chain"],
        properties: {
          headline: { type: "string", minLength: 20, maxLength: 500 },
          chain: { type: "array", minItems: 2, maxItems: 4, items: { type: "string", minLength: 2, maxLength: 100 } },
        },
      },
      whyHere: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "explanation"],
          properties: {
            title: { type: ["string", "null"], maxLength: 90 },
            explanation: { type: "string", minLength: 15, maxLength: 400 },
          },
        },
      },
      moneyImpact: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            required: ["intro", "formula", "scenarios", "capacityModel", "disclaimer"],
            properties: {
              intro: { type: "string", minLength: 10, maxLength: 250 },
              formula: {
                type: "object",
                additionalProperties: false,
                required: ["baseLabel", "baseValue", "multiplierLabel", "resultLabel", "resultValue"],
                properties: {
                  baseLabel: { type: "string", minLength: 1, maxLength: 80 },
                  baseValue: { type: "string", minLength: 1, maxLength: 80 },
                  multiplierLabel: { type: "string", minLength: 1, maxLength: 40 },
                  resultLabel: { type: "string", minLength: 1, maxLength: 80 },
                  resultValue: { type: "string", minLength: 1, maxLength: 80 },
                },
              },
              scenarios: {
                type: "array",
                minItems: 2,
                maxItems: 4,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "value"],
                  properties: {
                    label: { type: "string", minLength: 1, maxLength: 80 },
                    value: { type: "string", minLength: 1, maxLength: 80 },
                  },
                },
              },
              capacityModel: {
                type: "object",
                additionalProperties: false,
                required: ["label", "formula", "result"],
                properties: {
                  label: { type: "string", minLength: 1, maxLength: 80 },
                  formula: { type: "string", minLength: 1, maxLength: 160 },
                  result: { type: "string", minLength: 1, maxLength: 100 },
                },
              },
              disclaimer: { type: "string", minLength: 15, maxLength: 500 },
            },
          },
        ],
      },
      change30Days: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "explanation"],
        properties: {
          headline: { type: "string", minLength: 10, maxLength: 220 },
          explanation: { type: "string", minLength: 10, maxLength: 400 },
        },
      },
      growthLink: {
        type: "object",
        additionalProperties: false,
        required: ["leading", "supporting"],
        properties: {
          leading: { $ref: "#/$defs/elementRecommendation" },
          supporting: { type: "array", minItems: 2, maxItems: 2, items: { $ref: "#/$defs/elementRecommendation" } },
        },
      },
      doNotDo: {
        type: "array",
        minItems: 2,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "explanation"],
          properties: {
            title: { type: "string", minLength: 3, maxLength: 120 },
            explanation: { type: "string", minLength: 5, maxLength: 240 },
          },
        },
      },
      repeatabilitySteps: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: { type: "string", minLength: 5, maxLength: 240 },
      },
      importantCaveat: { type: ["string", "null"], maxLength: 600 },
      archetype: {
        type: "object",
        additionalProperties: false,
        required: ["id", "evidence"],
        properties: {
          id: { type: "string", enum: archetypeOrder },
          evidence: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 5, maxLength: 240 } },
        },
      },
      systemScores: {
        type: "array",
        minItems: 7,
        maxItems: 7,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "currentScore", "targetScore", "reasoning"],
          properties: {
            id: { type: "string", enum: systemElementOrder },
            currentScore: { type: "integer", minimum: 0, maximum: 10 },
            targetScore: { type: "integer", minimum: 0, maximum: 10 },
            reasoning: { type: "string", minLength: 10, maxLength: 400 },
          },
        },
      },
    },
    $defs: {
      elementRecommendation: {
        type: "object",
        additionalProperties: false,
        required: ["elementId", "notBuilt", "impact", "minimumChange", "criterion"],
        properties: {
          elementId: { type: "string", enum: systemElementOrder },
          notBuilt: { type: "string", minLength: 10, maxLength: 500 },
          impact: { type: "string", minLength: 10, maxLength: 500 },
          minimumChange: { type: "string", minLength: 10, maxLength: 500 },
          criterion: { type: "string", minLength: 10, maxLength: 500 },
        },
      },
    },
  },
} as const;

export const demoBusinessAnalysis: BusinessAnalysisResult = {
  schemaVersion: "business_analysis_v1",
  moneyNow: {
    headline:
      "Деньги находятся в уже доступных тёплых контактах и в переводе человека из разовой дешёвой сессии в понятный стартовый формат длительной работы.",
    chain: ["Тёплый контакт", "Диагностический разговор", "Пакет из четырёх встреч"],
  },
  whyHere: [
    { title: null, explanation: "Снижение цены не увеличило поток, следовательно, проблема не доказана как «клиентам дорого»." },
    { title: null, explanation: "Когда Екатерина делала личные приглашения, продажи происходили." },
    { title: null, explanation: "Клиенты уже оставались в работе несколько месяцев, следовательно, длительная помощь востребована." },
    { title: null, explanation: "У неё есть свободная ёмкость, поэтому пока не нужны группа, команда и автоматизация." },
  ],
  moneyImpact: {
    intro: "Проверяемая экономика без необходимости сразу строить большой блог.",
    formula: {
      baseLabel: "1 встреча",
      baseValue: "2 500 ₽",
      multiplierLabel: "× 4",
      resultLabel: "Стартовый пакет",
      resultValue: "10 000 ₽",
    },
    scenarios: [
      { label: "2 продажи", value: "20 000 ₽" },
      { label: "3 продажи", value: "30 000 ₽" },
      { label: "4 продажи", value: "40 000 ₽" },
    ],
    capacityModel: {
      label: "Модель цели",
      formula: "6 активных клиентов × 4 встречи × 2 500 ₽",
      result: "≈ 60 000 ₽ в месяц",
    },
    disclaimer:
      "Это не обещание, что шесть клиентов появятся за 30 дней. Это показывает, что для цели 60 000 ₽ Екатерине не нужен огромный блог. Ей нужно постепенно собрать примерно шесть стабильных клиентских мест.",
  },
  change30Days: {
    headline: "Перестать предлагать только отдельную сессию за 1 000 ₽.",
    explanation:
      "Подтвердить продажу одного понятного стартового пакета длительной работы через тёплые диагностические разговоры.",
  },
  growthLink: {
    leading: {
      elementId: "sales_technology",
      notBuilt: "Нет повторяемого перехода от разговора о проблеме к предложению длительной работы.",
      impact: "Человек либо покупает одну встречу, либо уходит, не увидев понятного пути.",
      minimumChange: "Одна структура встречи и одно предложение стартового пакета.",
      criterion:
        "Проведено не менее десяти однотипных разговоров; понятно, сколько людей покупает и какие возражения повторяются.",
    },
    supporting: [
      {
        elementId: "products_method",
        notBuilt: "Нет первого законченного продукта между «одной сессией» и «терапией неизвестной длительности».",
        impact: "Клиенту трудно покупать неопределённый процесс.",
        minimumChange: "Пакет из четырёх встреч с понятной задачей, логикой и первым результатом.",
        criterion: "Екатерина объясняет продукт за минуту, а клиент понимает, что произойдёт на четырёх встречах.",
      },
      {
        elementId: "authenticity",
        notBuilt:
          "Екатерина не опирается на десятилетний путь обучения и реальные длительные результаты. Она всё ещё называет себя начинающей и снижает цену из внутреннего сомнения.",
        impact: "Она не делает достаточного количества предложений и отступает в цене до проверки реакции клиента.",
        minimumChange:
          "Собрать опыт, сильные стороны, ценность, собственный способ помощи, право на цену и короткую самопрезентацию.",
        criterion: "Она спокойно называет стоимость 2 500 ₽, презентует пакет 10 000 ₽ и не снижает цену заранее.",
      },
    ],
  },
  doNotDo: [
    { title: "Не строить автоворонку", explanation: "Пока не подтверждено само предложение." },
    { title: "Не запускать платную рекламу", explanation: "Она масштабирует и продажи, и текущие потери." },
    { title: "Не создавать большую группу", explanation: "Индивидуальная модель ещё не заполнена." },
    {
      title: "Не делать блог главным проектом месяца",
      explanation: "Он может поддерживать доверие, но деньги сейчас ближе к тёплым контактам.",
    },
    { title: "Не создавать длинную линейку продуктов", explanation: "Нужен один подтверждённый основной формат." },
  ],
  repeatabilitySteps: [
    "Подтвердить продажу стартового пакета.",
    "Собрать причины покупок и отказов.",
    "Уточнить на этом материале свою аудиторию и авторский метод.",
    "Создать регулярный способ получать тёплые обращения: рекомендации, партнёры, блог или короткие продукты.",
    "Только после стабильной ручной продажи автоматизировать отдельные шаги.",
  ],
  importantCaveat:
    "Если новые поля покажут, что у Екатерины не восемь обращений, а одно-два, вывод изменится. Тогда «Где деньги сейчас» будет не в технологии продажи, а в увеличении количества подходящих разговоров. Именно поэтому новые вопросы нам нужны.",
  archetype: {
    id: "explorer",
    evidence: [
      "Продажи появлялись после личных приглашений, но устойчивый способ привлечения ещё не выбран.",
      "Сейчас Екатерина ищет рабочий путь к стабильным обращениям и проверяемой продаже.",
    ],
  },
  systemScores: [
    { id: "authenticity", currentScore: 5, targetScore: 6, reasoning: "Есть сильный опыт, но он пока не полностью присвоен и проявлен в цене." },
    { id: "audience", currentScore: 4, targetScore: 6, reasoning: "Есть работающие контакты, но портрет подходящего клиента требует уточнения." },
    { id: "products_method", currentScore: 3, targetScore: 6, reasoning: "Нет законченного стартового продукта между одной сессией и длительной работой." },
    { id: "sales_technology", currentScore: 2, targetScore: 4, reasoning: "Продажи происходят вручную, но повторяемая структура разговора ещё не собрана." },
    { id: "funnel", currentScore: 1, targetScore: 1, reasoning: "Автоматическая воронка пока не является ближайшим ограничением роста." },
    { id: "blog", currentScore: 2, targetScore: 2, reasoning: "Блог может поддерживать доверие, но не является ближайшей точкой денег." },
    { id: "team", currentScore: 1, targetScore: 2, reasoning: "Свободная личная ёмкость ещё не заполнена, поэтому команда пока не приоритет." },
  ],
};
