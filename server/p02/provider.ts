import { completeOpenRouterJson, type OpenRouterReasoningMode } from "@/server/ai/openrouter-json";
import type { P02Provider, P02ProviderRequest, P02ProviderResponse } from "./types";

export type P02ProviderEnvironment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export class P02ProviderConfigurationError extends Error {
  readonly code = "P02_PROVIDER_CONFIGURATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "P02ProviderConfigurationError";
  }
}

export class OpenRouterP02Provider implements P02Provider {
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

  complete(request: P02ProviderRequest): Promise<P02ProviderResponse> {
    return completeOpenRouterJson({
      apiKey: this.options.apiKey,
      model: this.model,
      baseUrl: this.options.baseUrl,
      appUrl: this.options.appUrl ?? null,
      appTitle: this.options.appTitle ?? "7K Business Diagnostic",
      structuredOutput: this.options.structuredOutput ?? true,
      schemaName: "p02_transition_strategist_v1_3",
      outputSchema: request.outputSchema,
      systemPrompt: request.systemPrompt,
      fetchImpl: this.options.fetchImpl,
      reasoningMode: this.options.reasoningMode ?? "none",
    });
  }
}

export function createConfiguredP02Provider(
  environment: P02ProviderEnvironment,
  options: { fetchImpl?: FetchLike } = {},
): P02Provider {
  const provider = environment.P02_AI_PROVIDER?.trim().toLowerCase() || "openrouter";
  if (provider !== "openrouter") throw new P02ProviderConfigurationError(`Unsupported P-02 provider: ${provider}`);
  const apiKey = environment.OPENROUTER_API_KEY?.trim();
  const model = environment.P02_AI_MODEL?.trim();
  if (!apiKey) throw new P02ProviderConfigurationError("OPENROUTER_API_KEY is not configured");
  if (!model) throw new P02ProviderConfigurationError("P02_AI_MODEL is not configured");
  return new OpenRouterP02Provider({
    apiKey,
    model,
    baseUrl: environment.OPENROUTER_BASE_URL,
    appUrl: environment.P02_APP_URL?.trim() || null,
    appTitle: environment.P02_APP_TITLE?.trim() || "7K Business Diagnostic",
    structuredOutput: environment.P02_STRUCTURED_OUTPUT !== "false",
    reasoningMode: (environment.P02_AI_REASONING_MODE?.trim() || "none") as OpenRouterReasoningMode,
    fetchImpl: options.fetchImpl,
  });
}
