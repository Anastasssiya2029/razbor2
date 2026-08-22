import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { DiagnosticInputV1_2 } from "../lib/diagnostic-input";
import {
  OpenRouterHttpError,
  completeOpenRouterJson,
  openRouterErrorArtifact,
  openRouterHttpErrorFromResponse,
  prepareOpenRouterStructuredSchema,
} from "../server/ai/openrouter-json";
import { P01RunExecutionError, runP01EvidenceScorer } from "../server/p01/runner";
import type { P01Provider, P01ProviderRequest, P01ProviderResponse } from "../server/p01/types";

const OUTPUT_SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};

test("provider schema is compacted without weakening local validation", () => {
  const repeated = {
    type: "object",
    properties: {
      state: { enum: ["yes", "no"], maxLength: 3 },
      score: { type: "integer", minimum: 0, maximum: 10 },
    },
    required: ["state", "score"],
    additionalProperties: false,
  };
  const compacted = prepareOpenRouterStructuredSchema({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { first: repeated, second: repeated },
    required: ["first", "second"],
    additionalProperties: false,
  });
  const serialized = JSON.stringify(compacted);
  assert.doesNotMatch(serialized, /\$schema|minLength|maxLength|minimum|maximum/u);
  assert.match(serialized, /#\/\$defs\/shared_1/u);
  assert.ok(isRecordForTest(compacted.$defs));
});

function isRecordForTest(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MALICIOUS_SENTINELS = [
  "Client Anna reported revenue 100000 and unstable leads",
  "body-controlled-id",
  "metadata-secret-sentinel",
  "header-secret-sentinel",
  "object-message-secret",
  "array-message-secret",
  "UNKNOWN_CLIENT_ANNA_REVENUE_100000",
  "ClientAnnaReportedRevenue100000AndUnstableLeads",
] as const;

function assertNoMaliciousSentinels(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const sentinel of MALICIOUS_SENTINELS) {
    assert.equal(serialized.includes(sentinel), false, sentinel);
  }
}

function transportOptions(fetchImpl: typeof fetch) {
  return {
    apiKey: "test-api-key-not-a-real-credential",
    model: "test/model",
    appUrl: "https://example.test",
    appTitle: "Transport instrumentation test",
    structuredOutput: true,
    schemaName: "test_schema",
    outputSchema: OUTPUT_SCHEMA,
    systemPrompt: "SYSTEM_PROMPT_SENT_TO_PROVIDER",
    fetchImpl,
  };
}

function diagnosticInput(): DiagnosticInputV1_2 {
  return {
    schemaVersion: "1.2",
    identity: { expertName: "Test Expert", niche: "Consulting" },
    current: {
      monthlyRevenueRub: 100_000,
      monthlyRevenueContext: null,
      payingClientsCount: 2,
      clientsCountPeriod: "month",
      weeklyHours: 30,
      products: "Consulting package",
      bestSeller: "Consulting package",
      freeProducts: null,
    },
    target: {
      monthlyRevenueRub: 300_000,
      businessModel: "Package",
      deadlineMonths: 12,
      delegation: "Operations",
      desiredSystemWeeklyHours: 20,
    },
    project: {
      clients: "Experts",
      result: "Sales system",
      sources: "Referrals",
      clientPath: "Call to offer",
      sales: "Calls",
      socialAssets: "Channel",
      team: "Solo",
      uniqueness: "Structured approach",
    },
    experience: { struggles: "Unstable leads", bestPeriod: null, failures: null },
  };
}

test("OpenRouter HTTP errors emit only the fail-closed typed artifact", () => {
  const response = new Response(null, {
    status: 400,
    headers: {
      "x-request-id": "req-safe-123",
      server: MALICIOUS_SENTINELS[3],
    },
  });
  const error = openRouterHttpErrorFromResponse(response, {
    error: {
      code: "INVALID_RESPONSE_FORMAT",
      message: MALICIOUS_SENTINELS[0],
      metadata: {
        provider_name: MALICIOUS_SENTINELS[0],
        raw: MALICIOUS_SENTINELS[2],
      },
    },
  });

  assert.ok(error instanceof OpenRouterHttpError);
  assert.deepEqual(openRouterErrorArtifact(error), {
    kind: "openrouter_http_error",
    httpStatus: 400,
    error: {
      code: "INVALID_RESPONSE_FORMAT",
      message: "OpenRouter rejected the request.",
      messageRedacted: true,
    },
    requestId: null,
    stage: "request_validation",
  });
  assert.deepEqual(Object.keys(error.artifact).sort(), ["error", "httpStatus", "kind", "requestId", "stage"]);
  assert.deepEqual(Object.keys(error.artifact.error).sort(), ["code", "message", "messageRedacted"]);
  assertNoMaliciousSentinels(error.artifact);
});

test("free-form metadata, headers, credentials, and unknown codes are never persisted", () => {
  const error = openRouterHttpErrorFromResponse(new Response(null, {
    status: 500,
    headers: {
      server: MALICIOUS_SENTINELS[0],
      "x-request-id": "sk-or-v1-header-secret-sentinel",
    },
  }), {
    error: {
      code: MALICIOUS_SENTINELS[6],
      message: "Authorization: Bearer message-secret-sentinel",
      metadata: {
        provider_name: MALICIOUS_SENTINELS[0],
        request_id: MALICIOUS_SENTINELS[1],
        raw: MALICIOUS_SENTINELS[2],
      },
    },
  });

  assert.equal(error.artifact.error.code, null);
  assert.equal(error.artifact.error.message, "OpenRouter provider failed to process the request.");
  assert.equal(error.artifact.error.messageRedacted, true);
  assert.equal(error.artifact.requestId, null);
  assert.equal("metadata" in error.artifact.error, false);
  assert.equal("responseHeaders" in error.artifact, false);
  assertNoMaliciousSentinels(error.artifact);
  assert.doesNotMatch(JSON.stringify(error.artifact), /message-secret-sentinel|header-secret-sentinel/u);
});

test("non-string upstream messages produce only a local generic message and redaction flag", () => {
  const messages: unknown[] = [
    { prompt: MALICIOUS_SENTINELS[4] },
    [MALICIOUS_SENTINELS[5]],
    42,
    false,
  ];

  for (const message of messages) {
    const error = openRouterHttpErrorFromResponse(
      new Response(null, { status: 500 }),
      { error: { code: 500, message } },
    );
    assert.equal(error.artifact.error.message, "OpenRouter provider failed to process the request.");
    assert.equal(error.artifact.error.messageRedacted, true);
    assertNoMaliciousSentinels(error.artifact);
  }

  for (const message of [null, undefined]) {
    const error = openRouterHttpErrorFromResponse(
      new Response(null, { status: 500 }),
      { error: { code: 500, message } },
    );
    assert.equal(error.artifact.error.messageRedacted, false);
  }
});

test("arbitrary upstream messages are replaced with a local generic summary", () => {
  const error = openRouterHttpErrorFromResponse(
    new Response(null, { status: 500 }),
    { error: { code: "UPSTREAM_FAILURE", message: MALICIOUS_SENTINELS[0] } },
  );

  assert.equal(error.artifact.error.message, "OpenRouter provider failed to process the request.");
  assert.equal(error.artifact.error.messageRedacted, true);
  assertNoMaliciousSentinels(error.artifact);
});

test("request IDs are never persisted without a proven exact provider contract", () => {
  const bodyOnlyRequestId = openRouterHttpErrorFromResponse(
    new Response(null, { status: 500 }),
    { error: { metadata: { request_id: MALICIOUS_SENTINELS[1] } } },
  );
  assert.equal(bodyOnlyRequestId.artifact.requestId, null);
  assertNoMaliciousSentinels(bodyOnlyRequestId.artifact);

  const rejectedRequestIds = [
    MALICIOUS_SENTINELS[7],
    "r".repeat(129),
    "invalid request id",
    "123e4567-e89b-12d3-a456-426614174000",
  ];
  for (const rejectedRequestId of rejectedRequestIds) {
    const invalid = openRouterHttpErrorFromResponse(
      new Response(null, { status: 500, headers: { "x-request-id": rejectedRequestId } }),
      { error: null },
    );
    assert.equal(invalid.artifact.requestId, null, rejectedRequestId);
    assert.equal(JSON.stringify(invalid.artifact).includes(rejectedRequestId), false, rejectedRequestId);
  }
});

test("stage is derived only from HTTP status while error code remains strictly allowlisted", () => {
  const statusCases = [
    {
      status: 401,
      upstreamCode: "INVALID_RESPONSE_FORMAT",
      expectedCode: null,
      stage: "routing",
      message: "OpenRouter authentication or routing failed.",
    },
    {
      status: 404,
      upstreamCode: "INVALID_RESPONSE_FORMAT",
      expectedCode: null,
      stage: "routing",
      message: "OpenRouter authentication or routing failed.",
    },
    {
      status: 429,
      upstreamCode: "RATE_LIMITED",
      expectedCode: "RATE_LIMITED",
      stage: "rate_limit",
      message: "OpenRouter rate limit was reached.",
    },
    {
      status: 422,
      upstreamCode: "INVALID_RESPONSE_FORMAT",
      expectedCode: "INVALID_RESPONSE_FORMAT",
      stage: "request_validation",
      message: "OpenRouter rejected the request.",
    },
    {
      status: 500,
      upstreamCode: "UPSTREAM_FAILURE",
      expectedCode: "UPSTREAM_FAILURE",
      stage: "provider",
      message: "OpenRouter provider failed to process the request.",
    },
  ] as const;

  for (const item of statusCases) {
    const error = openRouterHttpErrorFromResponse(
      new Response(null, { status: item.status }),
      { error: { code: item.upstreamCode, message: "response_format json_schema" } },
    );
    assert.equal(error.artifact.error.code, item.expectedCode);
    assert.equal(error.artifact.stage, item.stage);
    assert.equal(error.artifact.error.message, item.message);
    assert.equal(error.artifact.error.messageRedacted, true);
    assert.equal(JSON.stringify(error.artifact).includes("response_format json_schema"), false);
  }

  const status400Cases = [
    { upstreamCode: "INVALID_RESPONSE_FORMAT", expectedCode: "INVALID_RESPONSE_FORMAT" },
    { upstreamCode: "INVALID_REQUEST", expectedCode: "INVALID_REQUEST" },
    { upstreamCode: MALICIOUS_SENTINELS[6], expectedCode: null },
    { upstreamCode: undefined, expectedCode: null },
  ] as const;
  for (const item of status400Cases) {
    const error = openRouterHttpErrorFromResponse(
      new Response(null, { status: 400 }),
      { error: { code: item.upstreamCode, message: "response_format json_schema" } },
    );
    assert.equal(error.artifact.error.code, item.expectedCode);
    assert.equal(error.artifact.stage, "request_validation");
    assert.equal(error.artifact.error.message, "OpenRouter rejected the request.");
    assert.equal(error.artifact.error.messageRedacted, true);
    assert.equal(JSON.stringify(error.artifact).includes("response_format json_schema"), false);
  }

  const unknownCode = openRouterHttpErrorFromResponse(
    new Response(null, { status: 500 }),
    { error: { code: MALICIOUS_SENTINELS[6], message: "ignored upstream message" } },
  );
  assert.equal(unknownCode.artifact.error.code, null);
  assertNoMaliciousSentinels(unknownCode.artifact);
});

test("mocked error transport preserves frozen request semantics and performs one fetch", async () => {
  let calls = 0;
  let capturedBody: unknown;
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    capturedBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        error: {
          code: "INVALID_REQUEST",
          message: "token=transport-credential-unique",
          metadata: { provider_name: "Example" },
          raw: "SYSTEM_PROMPT_SENT_TO_PROVIDER",
        },
      }),
      { status: 400, headers: { "x-request-id": "transport-request-1" } },
    );
  }) as typeof fetch;

  await assert.rejects(
    completeOpenRouterJson(transportOptions(fetchImpl)),
    (error: unknown) => {
      assert.ok(error instanceof OpenRouterHttpError);
      assert.equal(error.artifact.requestId, null);
      const serialized = JSON.stringify(error.artifact);
      assert.doesNotMatch(serialized, /transport-credential-unique|SYSTEM_PROMPT_SENT_TO_PROVIDER/u);
      return true;
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(capturedBody, {
    model: "test/model",
    messages: [{ role: "system", content: "SYSTEM_PROMPT_SENT_TO_PROVIDER" }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "test_schema", strict: true, schema: OUTPUT_SCHEMA },
    },
  });
  assert.equal("provider" in (capturedBody as Record<string, unknown>), false);
  assert.equal("temperature" in (capturedBody as Record<string, unknown>), false);
  assert.equal("seed" in (capturedBody as Record<string, unknown>), false);

  const providerSource = readFileSync("server/p01/provider.ts", "utf8");
  assert.match(providerSource, /schemaName: "p01_evidence_scorer_v1_3"/u);
  assert.doesNotMatch(providerSource, /require_parameters/u);
});

test("mocked successful transport retains the frozen parsed response path", async () => {
  let calls = 0;
  const rawResponse = {
    choices: [{ message: { content: '{"ok":true}' } }],
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, cost: 0.001 },
  };
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(JSON.stringify(rawResponse), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const result = await completeOpenRouterJson(transportOptions(fetchImpl));
  assert.equal(calls, 1);
  assert.equal(result.text, '{"ok":true}');
  assert.deepEqual(result.rawResponse, rawResponse);
  assert.deepEqual(result.usage, {
    inputTokens: 10,
    outputTokens: 4,
    totalTokens: 14,
    costUsd: 0.001,
  });
});

test("JSON-object fallback receives the exact local output schema without extra requests", async () => {
  let calls = 0;
  let capturedBody: Record<string, unknown> | null = null;
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const result = await completeOpenRouterJson({
    ...transportOptions(fetchImpl),
    structuredOutput: false,
  });

  assert.equal(calls, 1);
  assert.equal(result.text, '{"ok":true}');
  const messages = capturedBody?.messages as Array<{ role: string; content: string }>;
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.role, "system");
  assert.match(messages[0]?.content ?? "", /<OUTPUT_JSON_SCHEMA>/u);
  assert.match(messages[0]?.content ?? "", /"required":\["ok"\]/u);
  assert.deepEqual(capturedBody?.response_format, { type: "json_object" });
});

class FailingProvider implements P01Provider {
  readonly provider = "mock";
  readonly model = "mock-p01";
  attempts = 0;

  constructor(private readonly transportError: OpenRouterHttpError) {}

  async complete(_request: P01ProviderRequest): Promise<P01ProviderResponse> {
    this.attempts += 1;
    throw this.transportError;
  }
}

class SequencedFailingProvider implements P01Provider {
  readonly provider = "mock";
  readonly model = "mock-p01";
  attempts = 0;

  constructor(private readonly failures: Error[]) {}

  async complete(_request: P01ProviderRequest): Promise<P01ProviderResponse> {
    const failure = this.failures[this.attempts];
    this.attempts += 1;
    if (!failure) throw new Error("Missing configured test failure");
    throw failure;
  }
}

async function captureP01RunError(provider: P01Provider): Promise<P01RunExecutionError> {
  let caught: unknown;
  try {
    await runP01EvidenceScorer(diagnosticInput(), {
      provider,
      hashInput: async () => "offline-test-hash",
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof P01RunExecutionError);
  return caught;
}

test("P-01 runner keeps the existing retry limit and propagates only the safe server-side artifact", async () => {
  const transportError = openRouterHttpErrorFromResponse(
    new Response(null, { status: 400, headers: { "x-request-id": "runner-request-1" } }),
    {
      error: {
        code: "INVALID_REQUEST",
        message: "Authorization: Basic cnVubmVyLXVuaXF1ZS1jcmVkZW50aWFs",
        metadata: { provider_name: "Example", raw: "runner-raw-unique" },
      },
    },
  );
  const provider = new FailingProvider(transportError);
  const caught = await captureP01RunError(provider);

  assert.equal(caught.failureCode, "P01_TRANSPORT_ERROR");
  assert.equal(caught.metadata.technicalRetryCount, 1);
  assert.equal(provider.attempts, 2);
  assert.deepEqual(caught.providerRawResponse, transportError.artifact);
  const serialized = JSON.stringify(caught.providerRawResponse);
  assert.doesNotMatch(
    serialized,
    /cnVubmVyLXVuaXF1ZS1jcmVkZW50aWFs|runner-raw-unique|SYSTEM_PROMPT|DiagnosticInput|response_format|\$schema/u,
  );

  const service = readFileSync("server/p01/analysis-run-service.ts", "utf8");
  const route = readFileSync("app/api/analysis-runs/[analysisRunId]/p01/route.ts", "utf8");
  assert.match(service, /providerRawResponse: error\.providerRawResponse/u);
  assert.doesNotMatch(route, /providerRawResponse|provider_raw_response/u);
});

test("P-01 runner clears a typed artifact when the final retry is an untyped network error", async () => {
  const typedError = openRouterHttpErrorFromResponse(
    new Response(null, { status: 502, headers: { "x-request-id": "first-typed-request" } }),
    { error: { code: "UPSTREAM_FAILURE", message: "Provider unavailable" } },
  );
  const provider = new SequencedFailingProvider([
    typedError,
    new TypeError("network unavailable"),
  ]);

  const caught = await captureP01RunError(provider);

  assert.equal(caught.failureCode, "P01_TRANSPORT_ERROR");
  assert.equal(caught.metadata.technicalRetryCount, 1);
  assert.equal(provider.attempts, 2);
  assert.equal(caught.providerRawResponse, null);
});

test("P-01 runner retains only the final typed artifact after an untyped first failure", async () => {
  const finalTypedError = openRouterHttpErrorFromResponse(
    new Response(null, { status: 503, headers: { "x-request-id": "final-typed-request" } }),
    { error: { code: "PROVIDER_UNAVAILABLE", message: "Provider unavailable" } },
  );
  const provider = new SequencedFailingProvider([
    new TypeError("network unavailable"),
    finalTypedError,
  ]);

  const caught = await captureP01RunError(provider);

  assert.equal(caught.failureCode, "P01_TRANSPORT_ERROR");
  assert.equal(caught.metadata.technicalRetryCount, 1);
  assert.equal(provider.attempts, 2);
  assert.deepEqual(caught.providerRawResponse, finalTypedError.artifact);
});
