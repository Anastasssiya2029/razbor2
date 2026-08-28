import {
  MONEY_NOW_FACT_CODES,
  type MoneyNowFactCode,
} from "../../server/7k/config/money-now-fact-extraction.v1";
import type {
  P01MoneyNowFact,
  P01MoneyNowFacts,
} from "../../server/p01/types";

export function unknownMoneyNowFacts(
  overrides: Partial<Record<MoneyNowFactCode, Partial<P01MoneyNowFact>>> = {},
): P01MoneyNowFacts {
  return Object.fromEntries(
    MONEY_NOW_FACT_CODES.map((factCode) => [
      factCode,
      {
        state: "unknown",
        confidence: "low",
        summary: null,
        evidence_ids: [],
        ...overrides[factCode],
      },
    ]),
  ) as P01MoneyNowFacts;
}
