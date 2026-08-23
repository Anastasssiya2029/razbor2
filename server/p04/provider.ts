import { completeOpenRouterJson, type OpenRouterReasoningMode } from "@/server/ai/openrouter-json";
import type { P04Provider, P04ProviderRequest, P04ProviderResponse } from "./types";

export type P04ProviderEnvironment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export class P04ProviderConfigurationError extends Error {
  readonly code = "P04_PROVIDER_CONFIGURATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "P04ProviderConfigurationError";
  }
}

export class OpenRouterP04Provider implements P04Provider {
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

  complete(request: P04ProviderRequest): Promise<P04ProviderResponse> {
    return completeOpenRouterJson({
      apiKey: this.options.apiKey,
      model: this.model,
      baseUrl: this.options.baseUrl,
      appUrl: this.options.appUrl ?? null,
      appTitle: this.options.appTitle ?? "7K Business Diagnostic",
      structuredOutput: this.options.structuredOutput ?? true,
      schemaName: "p04_report_writer_v1_2",
      outputSchema: request.outputSchema,
      systemPrompt: request.systemPrompt,
      fetchImpl: this.options.fetchImpl,
      reasoningMode: this.options.reasoningMode ?? "none",
    });
  }
}

export function createConfiguredP04Provider(
  environment: P04ProviderEnvironment,
  options: { fetchImpl?: FetchLike } = {},
): P04Provider {
  const provider = environment.P04_AI_PROVIDER?.trim().toLowerCase() || "openrouter";
  if (provider !== "openrouter") {
    throw new P04ProviderConfigurationError(`Unsupported P-04 provider: ${provider}`);
  }
  const apiKey = environment.OPENROUTER_API_KEY?.trim();
  const model = environment.P04_AI_MODEL?.trim();
  if (!apiKey) throw new P04ProviderConfigurationError("OPENROUTER_API_KEY is not configured");
  if (!model) throw new P04ProviderConfigurationError("P04_AI_MODEL is not configured");
  return new OpenRouterP04Provider({
    apiKey,
    model,
    baseUrl: environment.OPENROUTER_BASE_URL,
    appUrl: environment.P04_APP_URL?.trim() || null,
    appTitle: environment.P04_APP_TITLE?.trim() || "7K Business Diagnostic",
    structuredOutput: environment.P04_STRUCTURED_OUTPUT !== "false",
    reasoningMode: (environment.P04_AI_REASONING_MODE?.trim() || "none") as OpenRouterReasoningMode,
    fetchImpl: options.fetchImpl,
  });
}
