import { isSevenKElementId, type SevenKElementId } from "./types";

const LEGACY_PRODUCT_METHOD_ID = "products_method" as const;

export function adaptLegacyElementId(value: unknown): SevenKElementId | unknown {
  if (value === LEGACY_PRODUCT_METHOD_ID) return "product_method";
  return isSevenKElementId(value) ? value : value;
}

/**
 * Read-only boundary for already materialized historical analysis results.
 * Raw historical diagnostic snapshots are never passed through this adapter.
 */
export function adaptLegacyMaterializedAnalysisResult(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(adaptLegacyMaterializedAnalysisResult);
  }
  if (typeof value !== "object" || value === null) {
    return adaptLegacyElementId(value);
  }

  const source = value as Record<string, unknown>;
  const adapted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    const canonicalKey = key === LEGACY_PRODUCT_METHOD_ID ? "product_method" : key;
    if (canonicalKey in adapted && canonicalKey === "product_method") continue;
    adapted[canonicalKey] = adaptLegacyMaterializedAnalysisResult(child);
  }
  return adapted;
}

