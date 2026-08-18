import type { P01MoneyChainFact } from "@/server/p01/types";
import type { BackendMetric, BackendRevenueScenario } from "./types";

export function buildP03BackendMetrics(facts: readonly P01MoneyChainFact[]): BackendMetric[] {
  const metrics: BackendMetric[] = [];
  facts.forEach((fact, index) => {
    const prefix = `money_chain.${index}.${fact.stage}`;
    if (fact.value !== null) {
      metrics.push({
        metric_code: `${prefix}.value`,
        role: "baseline",
        value: fact.value,
        unit: null,
        source: "client_fact",
        evidence_ids: [...fact.evidence_ids],
      });
    }
    if (fact.denominator !== null) {
      metrics.push({
        metric_code: `${prefix}.denominator`,
        role: "reference",
        value: fact.denominator,
        unit: "count",
        source: "client_fact",
        evidence_ids: [...fact.evidence_ids],
      });
    }
    if (fact.conversionPct !== null) {
      metrics.push({
        metric_code: `${prefix}.conversion_pct`,
        role: "baseline",
        value: fact.conversionPct,
        unit: "%",
        source: "derived_client_fact",
        evidence_ids: [...fact.evidence_ids],
      });
    }
  });
  return metrics;
}

/**
 * P-01 does not persist a typed price × volume tuple with unit provenance yet.
 * Returning null is deterministic and prevents P-03 from inventing arithmetic.
 */
export function buildP03BackendRevenueScenario(): BackendRevenueScenario | null {
  return null;
}
