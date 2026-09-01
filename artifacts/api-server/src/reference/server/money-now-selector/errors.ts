import { MoneyNowSelectorInvariantError } from "@/server/7k/money-now-selector";
import type { MoneyNowSelectorFailureKind } from "./types";

export class MoneyNowSelectorStageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly kind: MoneyNowSelectorFailureKind,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = "MoneyNowSelectorStageError";
  }
}

export function asMoneyNowSelectorStageError(error: unknown): MoneyNowSelectorStageError {
  if (error instanceof MoneyNowSelectorStageError) return error;
  if (error instanceof MoneyNowSelectorInvariantError) {
    return new MoneyNowSelectorStageError(error.code, error.message, "integrity");
  }
  return new MoneyNowSelectorStageError(
    "MONEY_NOW_SELECTOR_TECHNICAL_ERROR",
    error instanceof Error ? error.message : "Unexpected deterministic Money Now Selector failure.",
    "technical",
  );
}
