import { completeOpenRouterJson } from "@/server/ai/openrouter-json";
import type { P03Provider, P03ProviderRequest, P03ProviderResponse } from "./types";

export type P03ProviderEnvironment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export class P03ProviderConfigurationError extends Error {
  readonly code = "P03_PROVIDER_CONFIGURATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "P03ProviderConfigurationError";
  }
}

export class OpenRouterP03Provider implements P03Provider {
  readonly provider = "openrouter";
  readonly model: string;
  constructor(private readonly options: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    appUrl?: string | null;
    appTitle?: string;
    structuredOutput?: boolean;
    fetchImpl?: FetchLike;
  }) {
    this.model = options.model;
  }

  complete(request: P03ProviderRequest): Promise<P03ProviderResponse> {
    return completeOpenRouterJson({
      apiKey: this.options.apiKey,
      model: this.model,
      baseUrl: this.options.baseUrl,
      appUrl: this.options.appUrl ?? null,
      appTitle: this.options.appTitle ?? "7K Business Diagnostic",
      structuredOutput: this.options.structuredOutput ?? true,
      schemaName: "p03_money_now_prescription_v1_4",
      outputSchema: request.outputSchema,
      systemPrompt: request.systemPrompt,
      fetchImpl: this.options.fetchImpl,
    });
  }
}

export function createConfiguredP03Provider(
  environment: P03ProviderEnvironment,
  options: { fetchImpl?: FetchLike } = {},
): P03Provider {
  const provider = environment.P03_AI_PROVIDER?.trim().toLowerCase() || "openrouter";
  if (provider !== "openrouter") {
    throw new P03ProviderConfigurationError(`Unsupported P-03 provider: ${provider}`);
  }
  const apiKey = environment.OPENROUTER_API_KEY?.trim();
  const model = environment.P03_AI_MODEL?.trim();
  if (!apiKey) throw new P03ProviderConfigurationError("OPENROUTER_API_KEY is not configured");
  if (!model) throw new P03ProviderConfigurationError("P03_AI_MODEL is not configured");
  return new OpenRouterP03Provider({
    apiKey,
    model,
    baseUrl: environment.OPENROUTER_BASE_URL,
    appUrl: environment.P03_APP_URL?.trim() || null,
    appTitle: environment.P03_APP_TITLE?.trim() || "7K Business Diagnostic",
    structuredOutput: environment.P03_STRUCTURED_OUTPUT !== "false",
    fetchImpl: options.fetchImpl,
  });
}

