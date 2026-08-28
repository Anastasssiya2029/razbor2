import { parseProviderJson } from "@/server/ai/provider-json";
import { validateP01CoreContext } from "./split-request";
import {
  P01InvariantError,
  P01SchemaValidationError,
  p01SanityErrors,
  validateP01Invariants,
  validateP01Schema,
  type P01ValidationIssue,
} from "./validation";

export type P01FailureDetail = P01ValidationIssue;

function providerText(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim() ? raw : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const choices = (raw as Record<string, unknown>).choices;
  if (!Array.isArray(choices)) return null;
  for (const choice of choices) {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) continue;
    const message = (choice as Record<string, unknown>).message;
    if (!message || typeof message !== "object" || Array.isArray(message)) continue;
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string" && content.trim()) return content;
  }
  return null;
}

function contextCandidates(raw: unknown): unknown[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const record = raw as Record<string, unknown>;
  return [record["context.reevaluation"], record["context.initial"]].filter(
    (value) => value !== undefined,
  );
}

function recoverSplitSanity(raw: unknown): P01FailureDetail[] {
  for (const candidate of contextCandidates(raw)) {
    try {
      const text = providerText(candidate);
      if (!text) continue;
      const context = validateP01CoreContext(parseProviderJson(text));
      return context.sanityChecks.flatMap((check, index) =>
        check.severity === "error"
          ? [{
              path: `/sanityChecks/${index}`,
              code: `sanity.${check.code}`,
              message: check.message,
            }]
          : [],
      );
    } catch {
      // Try the next persisted context response. Recovery must never mask status reads.
    }
  }
  return [];
}

function recoverMonolithic(raw: unknown): P01FailureDetail[] {
  const text = providerText(raw);
  if (!text) return [];
  try {
    const result = validateP01Schema(parseProviderJson(text));
    try {
      validateP01Invariants(result);
    } catch (error) {
      if (error instanceof P01InvariantError) return structuredClone(error.issues);
      return [];
    }
    return p01SanityErrors(result);
  } catch (error) {
    if (error instanceof P01SchemaValidationError) return structuredClone(error.issues);
    return [];
  }
}

export function recoverP01FailureDetails(
  failureCode: string | null,
  providerRawResponse: unknown,
): P01FailureDetail[] {
  if (!failureCode?.startsWith("P01_")) return [];
  if (failureCode === "P01_SANITY_ERROR") {
    const split = recoverSplitSanity(providerRawResponse);
    if (split.length > 0) return split;
  }
  return recoverMonolithic(providerRawResponse);
}

export function parseStoredP01FailureDetails(value: string | null): P01FailureDetail[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      if (
        typeof record.path !== "string" ||
        typeof record.code !== "string" ||
        typeof record.message !== "string"
      ) return [];
      return [{ path: record.path, code: record.code, message: record.message }];
    });
  } catch {
    return [];
  }
}
