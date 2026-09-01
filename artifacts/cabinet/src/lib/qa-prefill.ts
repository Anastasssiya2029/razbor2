import type { ClientsCountPeriod } from "./diagnostic-input";

export const QA_PREFILL_HASH_PREFIX = "#qa-prefill=";

export type QaPrefillPayload = {
  version: "diagnostic-form-prefill.v1";
  values: Record<string, string>;
  deadline: "6 месяцев" | "1 год" | "2 года" | "3 года";
  clientsCountPeriod: ClientsCountPeriod;
  desiredSystemHoursApplicable: boolean;
};

const DEADLINES = new Set<QaPrefillPayload["deadline"]>([
  "6 месяцев",
  "1 год",
  "2 года",
  "3 года",
]);

export function hasQaPrefillHash(hash: string): boolean {
  return hash.startsWith(QA_PREFILL_HASH_PREFIX);
}

export function readQaPrefillHash(hash: string): QaPrefillPayload | null {
  if (!hasQaPrefillHash(hash)) return null;

  try {
    const encoded = hash.slice(QA_PREFILL_HASH_PREFIX.length);
    if (!encoded) return null;
    const base64 = encoded.replace(/-/gu, "+").replace(/_/gu, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const candidate = JSON.parse(new TextDecoder().decode(bytes)) as Partial<QaPrefillPayload>;

    if (
      candidate.version !== "diagnostic-form-prefill.v1"
      || !candidate.values
      || typeof candidate.values !== "object"
      || Array.isArray(candidate.values)
      || !Object.values(candidate.values).every((value) => typeof value === "string")
      || !DEADLINES.has(candidate.deadline as QaPrefillPayload["deadline"])
      || (candidate.clientsCountPeriod !== "month" && candidate.clientsCountPeriod !== "launch")
      || typeof candidate.desiredSystemHoursApplicable !== "boolean"
    ) {
      return null;
    }

    return candidate as QaPrefillPayload;
  } catch {
    return null;
  }
}
