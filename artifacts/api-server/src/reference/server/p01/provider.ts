import type {
  P01Provider,
  P01ProviderRequest,
  P01ProviderResponse,
} from "./types";
import { completeOpenRouterJson, type OpenRouterReasoningMode } from "@/server/ai/openrouter-json";

export type P01ProviderEnvironment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export class P01ProviderConfigurationError extends Error {
  readonly code = "P01_PROVIDER_CONFIGURATION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "P01ProviderConfigurationError";
  }
}

/**
 * Real OpenRouter transport (ported from the reference implementation) so
 * `usage.costUsd` reflects an actual provider bill instead of the AI
 * Integrations OpenAI proxy's always-null cost.
 */
export class OpenRouterP01Provider implements P01Provider {
  readonly provider = "openrouter";
  readonly model: string;

  constructor(private readonly options: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    appUrl?: string | null;
    appTitle?: string;
    structuredOutput?: boolean;
    reasoningMode?: OpenRouterReasoningMode;
    fetchImpl?: FetchLike;
  }) {
    this.model = options.model;
  }

  complete(request: P01ProviderRequest): Promise<P01ProviderResponse> {
    return completeOpenRouterJson({
      apiKey: this.options.apiKey,
      model: this.model,
      baseUrl: this.options.baseUrl,
      appUrl: this.options.appUrl ?? null,
      appTitle: this.options.appTitle ?? "7K Business Diagnostic",
      structuredOutput: this.options.structuredOutput ?? true,
      schemaName: request.schemaName ?? "p01_evidence_scorer_v1_3",
      outputSchema: request.outputSchema,
      systemPrompt: request.systemPrompt,
      fetchImpl: this.options.fetchImpl,
      reasoningMode: this.options.reasoningMode ?? "none",
    });
  }
}

export function createConfiguredP01Provider(
  environment: P01ProviderEnvironment,
  options: { fetchImpl?: FetchLike } = {},
): P01Provider {
  const provider = environment.P01_AI_PROVIDER?.trim().toLowerCase() || "openrouter";
  if (provider !== "openrouter") {
    throw new P01ProviderConfigurationError(`Unsupported P-01 provider: ${provider}`);
  }
  const apiKey = environment.OPENROUTER_API_KEY?.trim();
  const model = environment.P01_AI_MODEL?.trim();
  if (!apiKey) throw new P01ProviderConfigurationError("OPENROUTER_API_KEY is not configured");
  if (!model) throw new P01ProviderConfigurationError("P01_AI_MODEL is not configured");

  return new OpenRouterP01Provider({
    apiKey,
    model,
    baseUrl: environment.OPENROUTER_BASE_URL,
    appUrl: environment.P01_APP_URL?.trim() || null,
    appTitle: environment.P01_APP_TITLE?.trim() || "7K Business Diagnostic",
    structuredOutput: environment.P01_STRUCTURED_OUTPUT !== "false",
    reasoningMode: (environment.P01_AI_REASONING_MODE?.trim() || "none") as OpenRouterReasoningMode,
    fetchImpl: options.fetchImpl,
  });
}
