export const P04_PUBLIC_GUARD_VERSION = "p04-public-guard.v1" as const;
export const P04_ORCHESTRATOR_HEADER = "x-p04-orchestrator-token" as const;

export type P04PublicGuardEnvironment = Record<string, string | undefined>;

export type P04PublicGuardDecision =
  | { allowed: true }
  | {
      allowed: false;
      status: 401 | 503;
      code:
        | "P04_PUBLIC_EXECUTION_DISABLED"
        | "P04_PROTECTION_NOT_CONFIGURED"
        | "P04_UNAUTHORIZED";
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

/**
 * Fail-closed protection for the HTTP endpoint that can spend AI credits.
 * Internal server orchestration can call runP04Stage() directly.
 */
export function authorizeP04PublicRequest(
  request: Request,
  environment: P04PublicGuardEnvironment,
): P04PublicGuardDecision {
  if (environment.P04_PUBLIC_EXECUTION_ENABLED !== "true") {
    return {
      allowed: false,
      status: 503,
      code: "P04_PUBLIC_EXECUTION_DISABLED",
      message: "P-04 execution is not available through the public endpoint.",
    };
  }
  const expectedToken = environment.P04_ORCHESTRATOR_TOKEN?.trim();
  if (!expectedToken) {
    return {
      allowed: false,
      status: 503,
      code: "P04_PROTECTION_NOT_CONFIGURED",
      message: "P-04 protected execution is not configured.",
    };
  }
  const suppliedToken = request.headers.get(P04_ORCHESTRATOR_HEADER)?.trim() ?? "";
  if (!suppliedToken || !constantTimeEqual(suppliedToken, expectedToken)) {
    return {
      allowed: false,
      status: 401,
      code: "P04_UNAUTHORIZED",
      message: "P-04 protected execution requires server authorization.",
    };
  }
  return { allowed: true };
}

export async function loadP04PublicGuardEnvironment(): Promise<P04PublicGuardEnvironment> {
  const { env } = await import("cloudflare:workers");
  return env as unknown as P04PublicGuardEnvironment;
}
