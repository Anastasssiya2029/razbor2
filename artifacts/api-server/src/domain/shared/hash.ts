import crypto from "node:crypto";

/** Deterministic JSON stringify: object keys sorted recursively, arrays kept in order. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, v]) => [key, sortValue(v)]));
  }
  return value;
}

export function hashOf(value: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}
