import type {
  P01Provider,
  P01ProviderRequest,
  P01ProviderResponse,
  P01ProviderUsage,
} from "./types";

export type P01ProviderEnvironment = Record<string, string | undefined>;

export class P01ProviderConfigurationError extends Error {
  readonly code = "P01_PROVIDER_CONFIGURATION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "P01ProviderConfigurationError";
  }
}

type FetchLike = typeof fetch;

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          return typeof item.text === "string" ? item.text : "";
        }
        return "";
      })
      .join("");
  }
  return "";
}

export class OpenRouterP01Provider implements P01Provider {
  readonly provider = "openrouter";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly appUrl: string | null;
  private readonly appTitle: string;
  private readonly fetchImpl: FetchLike;
  private readonly structuredOutput: boolean;

  constructor(options: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    appUrl?: string | null;
    appTitle?: string;
    structuredOutput?: boolean;
    fetchImpl?: FetchLike;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/u, "");
    this.appUrl = options.appUrl ?? null;
    this.appTitle = options.appTitle ?? "7K Business Diagnostic";
    this.structuredOutput = options.structuredOutput ?? true;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(request: P01ProviderRequest): Promise<P01ProviderResponse> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      "content-type": "application/json",
      "x-title": this.appTitle,
    };
    if (this.appUrl) headers["http-referer"] = this.appUrl;

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [{ role: "system", content: request.systemPrompt }],
        response_format: this.structuredOutput
          ? {
              type: "json_schema",
              json_schema: {
                name: "p01_evidence_scorer_v1_3",
                strict: true,
                schema: request.outputSchema,
              },
            }
          : { type: "json_object" },
      }),
    });
    const rawResponse: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`OpenRouter request failed with HTTP ${response.status}`);
    }
    const body = rawResponse as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: Record<string, unknown>;
    };
    const text = extractText(body.choices?.[0]?.message?.content);
    if (!text) throw new Error("OpenRouter returned an empty P-01 response");

    const usageSource = body.usage ?? {};
    const usage: P01ProviderUsage = {
      inputTokens: numberOrNull(usageSource.prompt_tokens ?? usageSource.input_tokens),
      outputTokens: numberOrNull(usageSource.completion_tokens ?? usageSource.output_tokens),
      totalTokens: numberOrNull(usageSource.total_tokens),
      costUsd: numberOrNull(usageSource.cost),
    };
    return { text, rawResponse, usage };
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
    fetchImpl: options.fetchImpl,
  });
}

