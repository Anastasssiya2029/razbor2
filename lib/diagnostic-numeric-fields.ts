export const MAX_WEEKLY_HOURS = 168;

export type DiagnosticNumericFieldName =
  | "currentIncome"
  | "goalIncome"
  | "weeklyTime"
  | "systemTime";

export type DiagnosticNumericFieldIssue = {
  sourceKey: DiagnosticNumericFieldName;
  path: string;
  code: string;
  message: string;
};

const NUMBER_PATTERN = /-?\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?/gu;
const PLAIN_NUMBER_PATTERN = /^\s*-?\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?\s*$/u;
const PLAIN_MONEY_PATTERN =
  /^\s*-?\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?\s*(?:₽|р\.?|руб(?:ль|ля|лей)?|тыс\.?|тысяч[аи]?|млн\.?|миллион(?:а|ов)?)?\s*$/iu;
const MONEY_UNIT_AFTER_NUMBER_PATTERN =
  /^\s*(?:₽|р\.?\b|руб(?:ль|ля|лей)?\b|тыс\.?\b|тысяч[аи]?\b|млн\.?\b|миллион(?:а|ов)?\b)/iu;
const HOUR_UNIT_AFTER_NUMBER_PATTERN = /^\s*(?:ч(?:ас(?:а|ов)?)?\.?)(?:\s|\/|$)/iu;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function parsedFirstNumber(source: string): number | null {
  const match = [...source.matchAll(NUMBER_PATTERN)][0];
  if (!match) return null;
  const parsed = Number(match[0].replace(/[\s\u00a0\u202f]/gu, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function issue(
  sourceKey: DiagnosticNumericFieldName,
  path: string,
  code: string,
  message: string,
): DiagnosticNumericFieldIssue {
  return { sourceKey, path, code, message };
}

function validateMoney(
  value: unknown,
  sourceKey: "currentIncome" | "goalIncome",
  path: string,
  label: string,
): DiagnosticNumericFieldIssue | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0
      ? null
      : issue(sourceKey, path, "invalid_money", `${label}: укажите неотрицательную сумму в рублях.`);
  }

  const source = text(value);
  if (!source) return null;
  const matches = [...source.matchAll(NUMBER_PATTERN)];
  const first = matches[0];
  const parsed = parsedFirstNumber(source);
  if (!first || parsed === null || parsed < 0) {
    return issue(sourceKey, path, "invalid_money", `${label}: укажите сумму числом, например 70 000.`);
  }

  const remainder = source.slice((first.index ?? 0) + first[0].length);
  const unambiguous = PLAIN_MONEY_PATTERN.test(source) || MONEY_UNIT_AFTER_NUMBER_PATTERN.test(remainder);
  if (!unambiguous) {
    return issue(
      sourceKey,
      path,
      "ambiguous_money",
      `${label}: укажите сначала сумму в рублях, например 70 000 ₽. Не используйте здесь срок или описание периода.`,
    );
  }
  return null;
}

function validateWeeklyHours(
  value: unknown,
  sourceKey: "weeklyTime" | "systemTime",
  path: string,
  label: string,
  required: boolean,
): DiagnosticNumericFieldIssue | null {
  if (value == null || text(value) === "") {
    return required
      ? issue(sourceKey, path, "required_weekly_hours", `${label}: укажите количество часов в неделю.`)
      : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= MAX_WEEKLY_HOURS
      ? null
      : issue(sourceKey, path, "invalid_weekly_hours", `${label}: укажите число от 0 до 168 часов в неделю.`);
  }

  const source = text(value);
  const matches = [...source.matchAll(NUMBER_PATTERN)];
  const first = matches[0];
  const parsed = parsedFirstNumber(source);
  if (!first || parsed === null || parsed < 0 || parsed > MAX_WEEKLY_HOURS || matches.length !== 1) {
    return issue(sourceKey, path, "invalid_weekly_hours", `${label}: укажите одно число от 0 до 168 часов в неделю.`);
  }
  const remainder = source.slice((first.index ?? 0) + first[0].length);
  if (!PLAIN_NUMBER_PATTERN.test(source) && !HOUR_UNIT_AFTER_NUMBER_PATTERN.test(remainder)) {
    return issue(sourceKey, path, "ambiguous_weekly_hours", `${label}: укажите часы числом, например 30.`);
  }
  return null;
}

export function validateFlatDiagnosticNumericFields(
  values: Record<string, unknown>,
  options: { desiredSystemHoursApplicable: boolean },
): DiagnosticNumericFieldIssue[] {
  return [
    validateMoney(values.currentIncome, "currentIncome", "/current/monthlyRevenueRub", "Текущий доход в месяц"),
    validateMoney(values.goalIncome, "goalIncome", "/target/monthlyRevenueRub", "Целевой доход в месяц"),
    validateWeeklyHours(values.weeklyTime, "weeklyTime", "/current/weeklyHours", "Текущее время на проект", false),
    options.desiredSystemHoursApplicable
      ? validateWeeklyHours(
          values.systemTime,
          "systemTime",
          "/target/desiredSystemWeeklyHours",
          "Желаемое время на проект",
          true,
        )
      : null,
  ].filter((item): item is DiagnosticNumericFieldIssue => item !== null);
}
