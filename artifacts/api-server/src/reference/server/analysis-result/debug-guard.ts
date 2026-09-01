export const ANALYSIS_RESULT_DEBUG_GUARD_VERSION = "analysis-result-debug-guard.v1" as const;
export const ANALYSIS_RESULT_DEBUG_HEADER = "x-analysis-debug-token" as const;

export type AnalysisResultDebugEnvironment = Record<string, string | undefined>;

export type AnalysisResultDebugDecision =
  | { allowed: true }
  | {
      allowed: false;
      status: 401 | 503;
      code: "ANALYSIS_DEBUG_DISABLED" | "ANALYSIS_DEBUG_NOT_CONFIGURED" | "ANALYSIS_DEBUG_UNAUTHORIZED";
      message: string;
    };

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function authorizeAnalysisResultDebugRequest(
  request: Request,
  environment: AnalysisResultDebugEnvironment,
): AnalysisResultDebugDecision {
  if (environment.ANALYSIS_DEBUG_ENABLED !== "true") {
    return {
      allowed: false,
      status: 503,
      code: "ANALYSIS_DEBUG_DISABLED",
      message: "Internal analysis result debug output is disabled.",
    };
  }
  const expectedToken = environment.ANALYSIS_DEBUG_TOKEN?.trim();
  if (!expectedToken) {
    return {
      allowed: false,
      status: 503,
      code: "ANALYSIS_DEBUG_NOT_CONFIGURED",
      message: "Internal analysis result debug protection is not configured.",
    };
  }
  const suppliedToken = request.headers.get(ANALYSIS_RESULT_DEBUG_HEADER)?.trim() ?? "";
  if (!suppliedToken || !constantTimeEqual(suppliedToken, expectedToken)) {
    return {
      allowed: false,
      status: 401,
      code: "ANALYSIS_DEBUG_UNAUTHORIZED",
      message: "Internal analysis result debug output requires server authorization.",
    };
  }
  return { allowed: true };
}

export async function loadAnalysisResultDebugEnvironment(): Promise<AnalysisResultDebugEnvironment> {
  const env = process.env;
  return env as unknown as AnalysisResultDebugEnvironment;
}
