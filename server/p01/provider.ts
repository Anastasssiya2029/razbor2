import type {
  P01Provider,
  P01ProviderRequest,
  P01ProviderResponse,
} from "./types";
import { completeOpenRouterJson } from "@/server/ai/openrouter-json";
import type { OpenRouterReasoningMode } from "@/server/ai/openrouter-json";

export type P01ProviderEnvironment = Record<string, string | undefined>;

export class P01ProviderConfigurationError extends Error {
  readonly code = "P01_PROVIDER_CONFIGURATION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "P01ProviderConfigurationError";
  }
}

type FetchLike = typeof fetch;

export class OpenRouterP01Provider implements P01Provider {
  readonly provider = "openrouter";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly appUrl: string | null;
  private readonly appTitle: string;
  private readonly fetchImpl: FetchLike;
  private readonly structuredOutput: boolean;
  private readonly reasoningMode: OpenRouterReasoningMode;

  constructor(options: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    appUrl?: string | null;
    appTitle?: string;
    structuredOutput?: boolean;
    reasoningMode?: OpenRouterReasoningMode;
    fetchImpl?: FetchLike;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/u, "");
    this.appUrl = options.appUrl ?? null;
    this.appTitle = options.appTitle ?? "7K Business Diagnostic";
    this.structuredOutput = options.structuredOutput ?? true;
    this.reasoningMode = options.reasoningMode ?? "none";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(request: P01ProviderRequest): Promise<P01ProviderResponse> {
    return completeOpenRouterJson({
      apiKey: this.apiKey,
      model: this.model,
      baseUrl: this.baseUrl,
      appUrl: this.appUrl,
      appTitle: this.appTitle,
      structuredOutput: this.structuredOutput,
      schemaName: request.schemaName ?? "p01_evidence_scorer_v1_3",
      outputSchema: request.outputSchema,
      systemPrompt: request.systemPrompt,
      fetchImpl: this.fetchImpl,
      reasoningMode: this.reasoningMode,
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
