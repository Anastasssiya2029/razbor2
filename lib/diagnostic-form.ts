export const DEFAULT_CLIENT_PATH =
  "Источник → предложение или запрос → бесплатная встреча → предложение → совместная работа → допродажа";

const SPACE_PATTERN = /[\s\u00a0\u202f]/gu;

export function formatMoneyInput(value: string): string {
  const digits = value.replace(/\D/gu, "").replace(/^0+(?=\d)/u, "").slice(0, 15);
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
}

export function formatRubles(value: string | number | null | undefined, fallback = "_____"): string {
  if (value == null || value === "") return fallback;
  const source = String(value).replace(SPACE_PATTERN, "");
  const match = source.match(/\d+/u);
  if (!match) return fallback;
  const number = Number(match[0]);
  if (!Number.isFinite(number)) return fallback;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
    .format(number)
    .replace(/[\u00a0\u202f]/gu, " ")} ₽`;
}

export function emptyDiagnosticValues(): Record<string, string> {
  return { clientPath: DEFAULT_CLIENT_PATH };
}

export function valuesForSubmission(values: Record<string, string>): Record<string, string> {
  if (values.clientPath?.trim() !== DEFAULT_CLIENT_PATH) return { ...values };
  return { ...values, clientPath: "" };
}
