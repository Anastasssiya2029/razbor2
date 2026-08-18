export type AiProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
};

export type OpenRouterJsonResponse = {
  text: string;
  rawResponse: unknown;
  usage: AiProviderUsage;
};

type FetchLike = typeof fetch;

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
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

export async function completeOpenRouterJson(options: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  appUrl?: string | null;
  appTitle: string;
  structuredOutput: boolean;
  schemaName: string;
  outputSchema: Record<string, unknown>;
  systemPrompt: string;
  fetchImpl?: FetchLike;
}): Promise<OpenRouterJsonResponse> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${options.apiKey}`,
    "content-type": "application/json",
    "x-title": options.appTitle,
  };
  if (options.appUrl) headers["http-referer"] = options.appUrl;
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/u, "");
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model,
      temperature: 0,
      messages: [{ role: "system", content: options.systemPrompt }],
      response_format: options.structuredOutput
        ? {
            type: "json_schema",
            json_schema: {
              name: options.schemaName,
              strict: true,
              schema: options.outputSchema,
            },
          }
        : { type: "json_object" },
    }),
  });
  const rawResponse: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`OpenRouter request failed with HTTP ${response.status}`);
  const body = rawResponse as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: Record<string, unknown>;
  };
  const text = extractText(body.choices?.[0]?.message?.content);
  if (!text) throw new Error("OpenRouter returned an empty structured response");
  const usageSource = body.usage ?? {};
  return {
    text,
    rawResponse,
    usage: {
      inputTokens: numberOrNull(usageSource.prompt_tokens ?? usageSource.input_tokens),
      outputTokens: numberOrNull(usageSource.completion_tokens ?? usageSource.output_tokens),
      totalTokens: numberOrNull(usageSource.total_tokens),
      costUsd: numberOrNull(usageSource.cost),
    },
  };
}

