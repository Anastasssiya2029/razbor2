// Human-readable Russian labels for the raw diagnostic answers, mirroring the
// fields actually collected on the cabinet's diagnostic-new.tsx form. Used
// only for the client-answers Excel export -- never surfaced to the AI
// pipeline, which consumes the normalized/validated DiagnosticInput shape
// instead. Keep this list in sync with the flat form fields in
// artifacts/cabinet/src/pages/diagnostic-new.tsx.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `diagnostics.raw_answers` stores the whole submitted payload as posted by the
 * client, i.e. `{ intent, sourceSchemaVersion, rawAnswers: { values, deadline,
 * clientsCountPeriod, desiredSystemWeeklyHoursApplicable } }`. Unwrap the outer
 * `rawAnswers` envelope (older/legacy rows may already be unwrapped or flat).
 */
function answersOf(stored: Record<string, unknown>): Record<string, unknown> {
  return isRecord(stored.rawAnswers) ? (stored.rawAnswers as Record<string, unknown>) : stored;
}

/** The flat form fields live under `rawAnswers.values`; older/legacy payloads may be flat already. */
function valuesOf(stored: Record<string, unknown>): Record<string, unknown> {
  const answers = answersOf(stored);
  return isRecord(answers.values) ? (answers.values as Record<string, unknown>) : answers;
}

function textField(stored: Record<string, unknown>, key: string): string {
  const value = valuesOf(stored)[key];
  if (value == null || value === "") return "—";
  return String(value);
}

function clientsCountPeriod(stored: Record<string, unknown>): string {
  const answers = answersOf(stored);
  const raw = answers.clientsCountPeriod ?? valuesOf(stored).clientsCountPeriod;
  if (raw === "month") return "За месяц";
  if (raw === "launch") return "За запуск";
  return raw ? String(raw) : "—";
}

function deadline(stored: Record<string, unknown>): string {
  const answers = answersOf(stored);
  const raw = answers.deadline ?? valuesOf(stored).deadline;
  return raw ? String(raw) : "—";
}

function timeFreedomGoal(stored: Record<string, unknown>): string {
  const answers = answersOf(stored);
  const raw = answers.desiredSystemWeeklyHoursApplicable;
  if (raw === true) return "Да";
  if (raw === false) return "Нет";
  return "—";
}

export type AnswerQuestion = {
  question: string;
  getValue: (rawAnswers: Record<string, unknown>) => string;
};

/** Ordered to match the on-screen form: Сейчас -> Цель -> Инфо о проекте -> Опыт. */
export const ANSWER_QUESTIONS: AnswerQuestion[] = [
  { question: "Имя эксперта", getValue: (r) => textField(r, "expertName") },
  { question: "Ниша", getValue: (r) => textField(r, "niche") },
  { question: "Доход в месяц (сейчас)", getValue: (r) => textField(r, "currentIncome") },
  { question: "Количество клиентов", getValue: (r) => textField(r, "clientsCount") },
  { question: "Количество указано", getValue: clientsCountPeriod },
  { question: "Время на проект в неделю", getValue: (r) => textField(r, "weeklyTime") },
  { question: "Какие продукты продаёте", getValue: (r) => textField(r, "products") },
  { question: "Что чаще покупают", getValue: (r) => textField(r, "bestSeller") },
  { question: "Есть ли бесплатные продукты", getValue: (r) => textField(r, "freeProducts") },
  { question: "Доход в месяц (цель)", getValue: (r) => textField(r, "goalIncome") },
  { question: "На чём хотите зарабатывать (модель)", getValue: (r) => textField(r, "goalModel") },
  { question: "Срок", getValue: deadline },
  { question: "Что хотите делегировать", getValue: (r) => textField(r, "delegate") },
  { question: "Свобода времени входит в цель", getValue: timeFreedomGoal },
  { question: "Время на проект (система есть)", getValue: (r) => textField(r, "systemTime") },
  { question: "Кто клиенты", getValue: (r) => textField(r, "clients") },
  { question: "Результат", getValue: (r) => textField(r, "result") },
  { question: "Откуда приходят", getValue: (r) => textField(r, "sources") },
  { question: "Путь клиента", getValue: (r) => textField(r, "clientPath") },
  { question: "Продажи", getValue: (r) => textField(r, "sales") },
  { question: "Социальные активы", getValue: (r) => textField(r, "socialAssets") },
  { question: "Команда", getValue: (r) => textField(r, "team") },
  { question: "Уникальность", getValue: (r) => textField(r, "uniqueness") },
  { question: "Трудности", getValue: (r) => textField(r, "struggles") },
  { question: "Лучший период", getValue: (r) => textField(r, "bestPeriod") },
  { question: "Ошибки и провалы", getValue: (r) => textField(r, "failures") },
];
