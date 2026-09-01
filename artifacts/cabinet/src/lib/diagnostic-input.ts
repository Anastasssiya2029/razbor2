import diagnosticInputSchema from "../schemas/diagnostic-input.v1.2.schema.json";
import { validateFlatDiagnosticNumericFields } from "./diagnostic-numeric-fields";

export const DIAGNOSTIC_SCHEMA_VERSION = "1.2" as const;
export const METHODOLOGY_VERSION = "7k.v1.4" as const;
export const FLAT_FORM_SCHEMA_VERSION = "diagnostic-flat-form.v1.2" as const;

export const ANALYSIS_STATUSES = [
  "draft",
  "queued",
  "scoring",
  "targeting",
  "strategizing",
  "money_now",
  "resolving_tasks",
  "writing_report",
  "ready",
  "analysis_failed",
] as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];
export type ClientsCountPeriod = "month" | "launch";

export type DiagnosticInputV1_2 = {
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  identity: {
    expertName: string | null;
    niche: string | null;
  };
  current: {
    monthlyRevenueRub: number | null;
    monthlyRevenueContext: string | null;
    payingClientsCount: number | null;
    clientsCountPeriod: ClientsCountPeriod | null;
    weeklyHours: number | null;
    products: string | null;
    bestSeller: string | null;
    freeProducts: string | null;
  };
  target: {
    monthlyRevenueRub: number | null;
    businessModel: string | null;
    deadlineMonths: number | null;
    delegation: string | null;
    desiredSystemWeeklyHours: number | null;
  };
  project: {
    clients: string | null;
    result: string | null;
    sources: string | null;
    clientPath: string | null;
    sales: string | null;
    socialAssets: string | null;
    team: string | null;
    uniqueness: string | null;
  };
  experience: {
    struggles: string | null;
    bestPeriod: string | null;
    failures: string | null;
  };
};

export type DiagnosticContractIssue = {
  path: string;
  code: string;
  message: string;
};

export class DiagnosticContractError extends Error {
  readonly issues: DiagnosticContractIssue[];

  constructor(issues: DiagnosticContractIssue[]) {
    super("Diagnostic input does not satisfy DiagnosticInput v1.2");
    this.name = "DiagnosticContractError";
    this.issues = issues;
  }
}

export type NormalizedDiagnosticSubmission = {
  input: DiagnosticInputV1_2;
  rawPayload: unknown;
  sourceSchemaVersion: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return value == null ? null : String(value).trim() || null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function issue(path: string, code: string, message: string): DiagnosticContractError {
  return new DiagnosticContractError([{ path, code, message }]);
}

function numberOrNull(value: unknown, path: string): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (Number.isFinite(value) && value >= 0) return value;
    throw issue(path, "invalid_number", "Ожидается неотрицательное конечное число.");
  }
  if (typeof value !== "string") {
    throw issue(path, "invalid_number", "Ожидается число или пустое значение.");
  }

  const source = value.trim();
  if (!source) return null;
  const match = source.match(/-?\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?/u);
  if (!match) throw issue(path, "invalid_number", "В ответе не найдено число.");

  const normalized = match[0].replace(/[\s\u00a0\u202f]/gu, "").replace(",", ".");
  let parsed = Number(normalized);
  if (/\b(?:тыс\.?|тысяч[аи]?)\b/iu.test(source)) parsed *= 1_000;
  if (/\b(?:млн\.?|миллион(?:а|ов)?)\b/iu.test(source)) parsed *= 1_000_000;
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw issue(path, "invalid_number", "Ожидается неотрицательное конечное число.");
  }
  return parsed;
}

function revenueContextOrNull(value: unknown): string | null {
  const source = textOrNull(value);
  if (!source) return null;
  const withoutNumberAndUnits = source
    .replace(/-?\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?/u, "")
    .replace(/\b(?:руб(?:лей|ля|ль)?|р\.?|тыс\.?|тысяч[аи]?|млн\.?|миллион(?:а|ов)?)\b/giu, "")
    .replace(/[₽.,:;()\-–—\s]/gu, "");
  return withoutNumberAndUnits ? source : null;
}

function deadlineMonthsOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 1 && value <= 120) return value;
    throw issue("/target/deadlineMonths", "invalid_deadline", "Срок должен быть целым числом месяцев от 1 до 120.");
  }
  const source = String(value).trim().toLocaleLowerCase("ru-RU");
  const fixed: Record<string, number> = {
    "6 месяцев": 6,
    "1 год": 12,
    "2 года": 24,
    "3 года": 36,
  };
  if (source in fixed) return fixed[source];
  const amount = source.match(/\d+/u)?.[0];
  if (!amount) throw issue("/target/deadlineMonths", "invalid_deadline", "В сроке не найдено число.");
  const numeric = Number(amount);
  const months = /год|лет/u.test(source) ? numeric * 12 : numeric;
  if (!Number.isInteger(months) || months < 1 || months > 120) {
    throw issue("/target/deadlineMonths", "invalid_deadline", "Срок должен быть от 1 до 120 месяцев.");
  }
  return months;
}

function clientsPeriodOrNull(value: unknown): ClientsCountPeriod | null {
  if (value === "month" || value === "launch") return value;
  if (value == null || value === "") return null;
  const normalized = String(value).trim().toLocaleLowerCase("ru-RU");
  if (/месяц/u.test(normalized)) return "month";
  if (/запуск/u.test(normalized)) return "launch";
  throw issue("/current/clientsCountPeriod", "invalid_period", "Допустимые значения: month или launch.");
}

const TIME_FREEDOM_PATTERN =
  /свобод\w*\s+времен|сократ\w*\s+(?:личн\w*\s+)?участ|выйти\s+из\s+операцион|без\s+(?:моего|личного)\s+участ|уменьш\w*\s+нагруз|работать\s+\d+\s*час/iu;

function hasExplicitTimeFreedomGoal(values: Record<string, unknown>): boolean {
  if (values.desiredSystemWeeklyHoursApplicable === true || values.timeFreedomGoal === true) return true;
  const context = [values.delegate, values.delegation, values.goalModel, values.businessModel]
    .map(textOrNull)
    .filter(Boolean)
    .join(" ");
  return TIME_FREEDOM_PATTERN.test(context);
}

function flatValuesFrom(payload: Record<string, unknown>): Record<string, unknown> {
  const rawAnswers = isRecord(payload.rawAnswers) ? payload.rawAnswers : payload;
  return isRecord(rawAnswers.values) ? rawAnswers.values : rawAnswers;
}

function flatMetadataFrom(payload: Record<string, unknown>): Record<string, unknown> {
  return isRecord(payload.rawAnswers) ? payload.rawAnswers : payload;
}

function normalizeFlatSubmission(payload: Record<string, unknown>): DiagnosticInputV1_2 {
  const values = flatValuesFrom(payload);
  const meta = flatMetadataFrom(payload);
  const currentRevenue = values.currentIncome;
  const payingClientsCount = numberOrNull(values.clientsCount, "/current/payingClientsCount");
  const explicitTimeFreedom =
    meta.desiredSystemWeeklyHoursApplicable === true || hasExplicitTimeFreedomGoal({ ...values, ...meta });
  const numericIssues = validateFlatDiagnosticNumericFields(values, {
    desiredSystemHoursApplicable: explicitTimeFreedom,
  });
  if (numericIssues.length > 0) {
    throw new DiagnosticContractError(
      numericIssues.map(({ path, code, message }) => ({ path, code, message })),
    );
  }

  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    identity: {
      expertName: textOrNull(values.expertName),
      niche: textOrNull(values.niche),
    },
    current: {
      monthlyRevenueRub: numberOrNull(currentRevenue, "/current/monthlyRevenueRub"),
      monthlyRevenueContext: revenueContextOrNull(currentRevenue),
      payingClientsCount,
      clientsCountPeriod:
        payingClientsCount === null
          ? null
          : clientsPeriodOrNull(meta.clientsCountPeriod ?? values.clientsCountPeriod),
      weeklyHours: numberOrNull(values.weeklyTime, "/current/weeklyHours"),
      products: textOrNull(values.products),
      bestSeller: textOrNull(values.bestSeller),
      freeProducts: textOrNull(values.freeProducts),
    },
    target: {
      monthlyRevenueRub: numberOrNull(values.goalIncome, "/target/monthlyRevenueRub"),
      businessModel: textOrNull(values.goalModel),
      deadlineMonths: deadlineMonthsOrNull(meta.deadline ?? values.deadline),
      delegation: textOrNull(values.delegate),
      desiredSystemWeeklyHours: explicitTimeFreedom
        ? numberOrNull(values.systemTime, "/target/desiredSystemWeeklyHours")
        : null,
    },
    project: {
      clients: textOrNull(values.clients),
      result: textOrNull(values.result),
      sources: textOrNull(values.sources),
      clientPath: textOrNull(values.clientPath),
      sales: textOrNull(values.sales),
      socialAssets: textOrNull(values.socialAssets),
      team: textOrNull(values.team),
      uniqueness: textOrNull(values.uniqueness),
    },
    experience: {
      struggles: textOrNull(values.struggles),
      bestPeriod: textOrNull(values.bestPeriod),
      failures: textOrNull(values.failures),
    },
  };
}

function normalizeLegacyNestedSubmission(payload: Record<string, unknown>): DiagnosticInputV1_2 {
  const identity = isRecord(payload.identity) ? payload.identity : {};
  const current = isRecord(payload.current) ? payload.current : {};
  const target = isRecord(payload.target) ? payload.target : {};
  const project = isRecord(payload.project) ? payload.project : {};
  const experience = isRecord(payload.experience) ? payload.experience : {};
  const payingClientsCount = numberOrNull(current.payingClientsCount, "/current/payingClientsCount");
  const explicitTimeFreedom = hasExplicitTimeFreedomGoal({
    ...target,
    desiredSystemWeeklyHoursApplicable: payload.desiredSystemWeeklyHoursApplicable,
  });

  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    identity: {
      expertName: textOrNull(identity.expertName),
      niche: textOrNull(identity.niche),
    },
    current: {
      monthlyRevenueRub: numberOrNull(current.monthlyRevenueRub, "/current/monthlyRevenueRub"),
      monthlyRevenueContext: textOrNull(current.monthlyRevenueContext),
      payingClientsCount,
      clientsCountPeriod:
        payingClientsCount === null ? null : clientsPeriodOrNull(current.clientsCountPeriod),
      weeklyHours: numberOrNull(current.weeklyHours, "/current/weeklyHours"),
      products: textOrNull(current.products),
      bestSeller: textOrNull(current.bestSeller),
      freeProducts: textOrNull(current.freeProducts),
    },
    target: {
      monthlyRevenueRub: numberOrNull(target.monthlyRevenueRub, "/target/monthlyRevenueRub"),
      businessModel: textOrNull(target.businessModel),
      deadlineMonths: deadlineMonthsOrNull(target.deadlineMonths),
      delegation: textOrNull(target.delegation),
      desiredSystemWeeklyHours: explicitTimeFreedom
        ? numberOrNull(target.desiredSystemWeeklyHours, "/target/desiredSystemWeeklyHours")
        : null,
    },
    project: {
      clients: textOrNull(project.clients),
      result: textOrNull(project.result),
      sources: textOrNull(project.sources),
      clientPath: textOrNull(project.clientPath),
      sales: textOrNull(project.sales),
      socialAssets: textOrNull(project.socialAssets),
      team: textOrNull(project.team),
      uniqueness: textOrNull(project.uniqueness),
    },
    experience: {
      struggles: textOrNull(experience.struggles),
      bestPeriod: textOrNull(experience.bestPeriod),
      failures: textOrNull(experience.failures),
    },
  };
}

type JsonSchemaNode = {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchemaNode>;
  additionalProperties?: boolean;
  minimum?: number;
  maximum?: number;
};

function valueMatchesType(value: unknown, type: string): boolean {
  if (type === "null") return value === null;
  if (type === "object") return isRecord(value);
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "boolean") return typeof value === "boolean";
  return true;
}

function collectSchemaIssues(
  value: unknown,
  schema: JsonSchemaNode,
  path = "",
): DiagnosticContractIssue[] {
  const issues: DiagnosticContractIssue[] = [];
  const types = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : [];
  if (types.length > 0 && !types.some((type) => valueMatchesType(value, type))) {
    return [{ path: path || "/", code: "type", message: `Ожидается тип: ${types.join(" | ")}.` }];
  }
  if ("const" in schema && value !== schema.const) {
    issues.push({ path: path || "/", code: "const", message: `Ожидается значение ${String(schema.const)}.` });
  }
  if (schema.enum && !schema.enum.some((allowed) => allowed === value)) {
    issues.push({ path: path || "/", code: "enum", message: "Значение не входит в допустимый список." });
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({ path: path || "/", code: "minimum", message: `Минимум: ${schema.minimum}.` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({ path: path || "/", code: "maximum", message: `Максимум: ${schema.maximum}.` });
    }
  }
  if (isRecord(value) && schema.properties) {
    for (const required of schema.required ?? []) {
      if (!(required in value)) {
        issues.push({
          path: `${path}/${required}` || "/",
          code: "required",
          message: "Обязательное структурное поле отсутствует.",
        });
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) {
          issues.push({ path: `${path}/${key}`, code: "additionalProperties", message: "Неизвестное поле." });
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      if (key in value) issues.push(...collectSchemaIssues(value[key], propertySchema, `${path}/${key}`));
    }
  }
  return issues;
}

export function validateDiagnosticInput(input: unknown): DiagnosticInputV1_2 {
  const issues = collectSchemaIssues(input, diagnosticInputSchema as JsonSchemaNode);
  if (issues.length > 0) throw new DiagnosticContractError(issues);
  const validatedInput = input as DiagnosticInputV1_2;
  if (validatedInput.current.payingClientsCount !== null && validatedInput.current.clientsCountPeriod === null) {
    throw new DiagnosticContractError([
      {
        path: "/current/clientsCountPeriod",
        code: "required_when_clients_present",
        message: "Укажите, относится количество клиентов к месяцу или запуску.",
      },
    ]);
  }
  return validatedInput;
}

/**
 * Единственная разрешённая server-side граница перед будущими AI-модулями.
 * AI-адаптеры должны принимать результат этой функции, а не raw payload.
 */
export function assertDiagnosticInputForAi(input: unknown): DiagnosticInputV1_2 {
  return validateDiagnosticInput(input);
}

export function normalizeDiagnosticSubmission(payload: unknown): NormalizedDiagnosticSubmission {
  if (!isRecord(payload)) {
    throw new DiagnosticContractError([{ path: "/", code: "type", message: "Ожидается JSON-объект." }]);
  }

  const sourceSchemaVersion =
    textOrNull(payload.sourceSchemaVersion) ?? textOrNull(payload.schemaVersion) ?? "legacy-flat";
  const candidate =
    payload.schemaVersion === DIAGNOSTIC_SCHEMA_VERSION && isRecord(payload.identity)
      ? payload
      : isRecord(payload.identity) && isRecord(payload.current)
        ? normalizeLegacyNestedSubmission(payload)
        : normalizeFlatSubmission(payload);

  return {
    input: validateDiagnosticInput(candidate),
    rawPayload: payload,
    sourceSchemaVersion,
  };
}

export function isAnalysisStatus(value: unknown): value is AnalysisStatus {
  return typeof value === "string" && (ANALYSIS_STATUSES as readonly string[]).includes(value);
}
