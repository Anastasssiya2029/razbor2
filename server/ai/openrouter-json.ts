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

export type OpenRouterErrorStage =
  | "routing"
  | "rate_limit"
  | "request_validation"
  | "provider";

export type OpenRouterSafeErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE_FORMAT"
  | "AUTHENTICATION_FAILED"
  | "INSUFFICIENT_CREDITS"
  | "ACCESS_FORBIDDEN"
  | "MODEL_NOT_FOUND"
  | "REQUEST_TIMEOUT"
  | "RATE_LIMITED"
  | "UPSTREAM_FAILURE"
  | "PROVIDER_UNAVAILABLE";

export type OpenRouterHttpErrorArtifact = {
  kind: "openrouter_http_error";
  httpStatus: number;
  error: {
    code: OpenRouterSafeErrorCode | null;
    message: string;
    messageRedacted: boolean;
  };
  requestId: string | null;
  stage: OpenRouterErrorStage;
};

export class OpenRouterHttpError extends Error {
  readonly artifact: OpenRouterHttpErrorArtifact;

  constructor(artifact: OpenRouterHttpErrorArtifact) {
    super(`OpenRouter request failed with HTTP ${artifact.httpStatus}`);
    this.name = "OpenRouterHttpError";
    this.artifact = artifact;
  }
}

type FetchLike = typeof fetch;

const PROVIDER_UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "$schema",
  "$id",
  "uniqueItems",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeProviderSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeProviderSchema);
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (PROVIDER_UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) continue;
    if (key === "const") {
      result.enum = [sanitizeProviderSchema(child)];
      continue;
    }
    if (key === "oneOf") {
      result.anyOf = sanitizeProviderSchema(child);
      continue;
    }
    result[key] = sanitizeProviderSchema(child);
  }
  return result;
}

function isSchemaNode(value: Record<string, unknown>): boolean {
  return ["type", "enum", "anyOf", "items", "properties", "$ref"].some((key) => key in value);
}

function compactProviderSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const signatures = new Map<string, { count: number; value: Record<string, unknown> }>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!isRecord(value)) return;
    const signature = JSON.stringify(value);
    if (signature.length >= 80 && isSchemaNode(value)) {
      const current = signatures.get(signature);
      signatures.set(signature, { count: (current?.count ?? 0) + 1, value });
    }
    Object.values(value).forEach(collect);
  };
  collect(schema);

  const names = new Map<string, string>();
  const definitions: Record<string, unknown> = {};
  const pending: Array<{ name: string; value: Record<string, unknown> }> = [];
  const transform = (value: unknown, skipSelf = false): unknown => {
    if (Array.isArray(value)) return value.map((child) => transform(child));
    if (!isRecord(value)) return value;
    const signature = JSON.stringify(value);
    const repeated = signatures.get(signature);
    if (!skipSelf && repeated && repeated.count > 1) {
      let name = names.get(signature);
      if (!name) {
        name = `shared_${names.size + 1}`;
        names.set(signature, name);
        pending.push({ name, value: repeated.value });
      }
      return { $ref: `#/$defs/${name}` };
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, transform(child)]),
    );
  };

  const compacted = transform(schema, true) as Record<string, unknown>;
  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index];
    definitions[item.name] = transform(item.value, true);
  }
  if (Object.keys(definitions).length > 0) compacted.$defs = definitions;
  return compacted;
}

export function prepareOpenRouterStructuredSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return compactProviderSchema(sanitizeProviderSchema(schema) as Record<string, unknown>);
}

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

const SAFE_ERROR_CODE_RULES: ReadonlyArray<{
  values: readonly unknown[];
  statuses: readonly number[];
  code: OpenRouterSafeErrorCode;
}> = [
  {
    values: [400, 409, 413, 415, 422, "INVALID_REQUEST"],
    statuses: [400, 409, 413, 415, 422],
    code: "INVALID_REQUEST",
  },
  {
    values: ["INVALID_RESPONSE_FORMAT"],
    statuses: [400, 422],
    code: "INVALID_RESPONSE_FORMAT",
  },
  {
    values: [401, "AUTHENTICATION_FAILED", "INVALID_CREDENTIALS"],
    statuses: [401],
    code: "AUTHENTICATION_FAILED",
  },
  { values: [402, "INSUFFICIENT_CREDITS"], statuses: [402], code: "INSUFFICIENT_CREDITS" },
  { values: [403, "ACCESS_FORBIDDEN"], statuses: [403], code: "ACCESS_FORBIDDEN" },
  { values: [404, "MODEL_NOT_FOUND"], statuses: [404], code: "MODEL_NOT_FOUND" },
  { values: [408, "REQUEST_TIMEOUT"], statuses: [408], code: "REQUEST_TIMEOUT" },
  { values: [429, "RATE_LIMITED"], statuses: [429], code: "RATE_LIMITED" },
  {
    values: [500, 502, 504, "UPSTREAM_FAILURE"],
    statuses: [500, 502, 504],
    code: "UPSTREAM_FAILURE",
  },
  { values: [503, "PROVIDER_UNAVAILABLE"], statuses: [503], code: "PROVIDER_UNAVAILABLE" },
];

function safeErrorCode(value: unknown, status: number): OpenRouterSafeErrorCode | null {
  return (
    SAFE_ERROR_CODE_RULES.find(
      (rule) => rule.statuses.includes(status) && rule.values.includes(value),
    )?.code ?? null
  );
}

const ERROR_STAGE_BY_STATUS: Readonly<Partial<Record<number, OpenRouterErrorStage>>> = {
  400: "request_validation",
  401: "routing",
  402: "routing",
  403: "routing",
  404: "routing",
  409: "request_validation",
  413: "request_validation",
  415: "request_validation",
  422: "request_validation",
  429: "rate_limit",
};

function errorStage(status: number): OpenRouterErrorStage {
  return ERROR_STAGE_BY_STATUS[status] ?? "provider";
}

function localErrorMessage(stage: OpenRouterErrorStage): string {
  switch (stage) {
    case "routing":
      return "OpenRouter authentication or routing failed.";
    case "rate_limit":
      return "OpenRouter rate limit was reached.";
    case "request_validation":
      return "OpenRouter rejected the request.";
    case "provider":
      return "OpenRouter provider failed to process the request.";
  }
}

function upstreamMessageWasRedacted(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function openRouterHttpErrorFromResponse(
  response: Pick<Response, "status">,
  rawResponse: unknown,
): OpenRouterHttpError {
  const rawError =
    rawResponse && typeof rawResponse === "object" && "error" in rawResponse
      ? (rawResponse as { error?: unknown }).error
      : null;
  const errorRecord =
    rawError && typeof rawError === "object" && !Array.isArray(rawError)
      ? (rawError as Record<string, unknown>)
      : {};
  const code = safeErrorCode(errorRecord.code, response.status);
  const stage = errorStage(response.status);
  return new OpenRouterHttpError({
    kind: "openrouter_http_error",
    httpStatus: response.status,
    error: {
      code,
      message: localErrorMessage(stage),
      messageRedacted: upstreamMessageWasRedacted(errorRecord.message),
    },
    requestId: null,
    stage,
  });
}

export function openRouterErrorArtifact(error: unknown): OpenRouterHttpErrorArtifact | null {
  return error instanceof OpenRouterHttpError ? error.artifact : null;
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
  const systemPrompt = options.structuredOutput
    ? options.systemPrompt
    : `${options.systemPrompt}\n\n<OUTPUT_JSON_SCHEMA>\n${JSON.stringify(options.outputSchema)}\n</OUTPUT_JSON_SCHEMA>\nВерни только JSON, который точно соответствует OUTPUT_JSON_SCHEMA.`;
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model,
      reasoning: { effort: "none", exclude: true },
      messages: [{ role: "system", content: systemPrompt }],
      response_format: options.structuredOutput
        ? {
            type: "json_schema",
            json_schema: {
              name: options.schemaName,
              strict: true,
              schema: prepareOpenRouterStructuredSchema(options.outputSchema),
            },
          }
        : { type: "json_object" },
    }),
  });
  const rawResponse: unknown = await response.json().catch(() => null);
  if (!response.ok) throw openRouterHttpErrorFromResponse(response, rawResponse);
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
