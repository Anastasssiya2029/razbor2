export const P03_PUBLIC_GUARD_VERSION = "p03-public-guard.v1" as const;
export const P03_ORCHESTRATOR_HEADER = "x-p03-orchestrator-token" as const;

export type P03PublicGuardEnvironment = Record<string, string | undefined>;

export type P03PublicGuardDecision =
  | { allowed: true }
  | {
      allowed: false;
      status: 401 | 503;
      code: "P03_PUBLIC_EXECUTION_DISABLED" | "P03_PROTECTION_NOT_CONFIGURED" | "P03_UNAUTHORIZED";
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
 * Explicit fail-closed protection for the HTTP endpoint that can spend AI
 * credits. Internal server orchestration can call runP03Stage() directly.
 */
export function authorizeP03PublicRequest(
  request: Request,
  environment: P03PublicGuardEnvironment,
): P03PublicGuardDecision {
  if (environment.P03_PUBLIC_EXECUTION_ENABLED !== "true") {
    return {
      allowed: false,
      status: 503,
      code: "P03_PUBLIC_EXECUTION_DISABLED",
      message: "P-03 execution is not available through the public endpoint.",
    };
  }

  const expectedToken = environment.P03_ORCHESTRATOR_TOKEN?.trim();
  if (!expectedToken) {
    return {
      allowed: false,
      status: 503,
      code: "P03_PROTECTION_NOT_CONFIGURED",
      message: "P-03 protected execution is not configured.",
    };
  }

  const suppliedToken = request.headers.get(P03_ORCHESTRATOR_HEADER)?.trim() ?? "";
  if (!suppliedToken || !constantTimeEqual(suppliedToken, expectedToken)) {
    return {
      allowed: false,
      status: 401,
      code: "P03_UNAUTHORIZED",
      message: "P-03 protected execution requires server authorization.",
    };
  }
  return { allowed: true };
}

export async function loadP03PublicGuardEnvironment(): Promise<P03PublicGuardEnvironment> {
  const { env } = await import("cloudflare:workers");
  return env as unknown as P03PublicGuardEnvironment;
}
