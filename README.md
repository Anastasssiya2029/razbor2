# 7K Business Diagnostic Core

Frozen Stage 10 implementation of the 7K business diagnostic pipeline. The service accepts a validated `DiagnosticInput v1.2`, persists every stage independently, keeps AI and deterministic decisions separated, and builds one immutable `analysis-result.v1` from persisted validated snapshots.

This repository is the host-independent diagnostic core plus the current D1 adapter. It is not yet the final client product.

## Pipeline

```text
DiagnosticInput v1.2
  -> P-01 Evidence + Current 7K
  -> deterministic Target Configuration + Business Archetype
  -> P-02 Transition Strategist
  -> deterministic Task Resolver (Matrix 70)
  -> deterministic Money Now Selector
  -> P-03 Money Now Prescription
  -> P-04 Report Writer
  -> deterministic AnalysisResult assembler
```

AI is limited to P-01, P-02, P-03 and P-04. Target scores, archetype, fixed tasks, Money Now scenario selection and final assembly are deterministic. The final assembler never calls a model and never recalculates a business decision.

## Frozen versions

- Diagnostic input: `1.2`
- P-01: `P-01.v1.4.2`, schema `1.4`
- Target/Archetype: `target-archetype-stage.v1`, `target-rules.v2.2`, `archetypes.v1`
- P-02: `P-02.v1.3`, schema `1.3`
- Task Resolver: `task-resolver-stage.v1`, `transitions-70.v1`
- Money Now selector: `money-now-selector-stage.v1`, contract `money-now-selector-contract.v1.2`, methodology `money-now.v2.2`
- Money Now prescription: methodology `money-now.v2.3`
- P-03: `P-03.v1.5`, schema `1.5`
- P-04: `P-04.v1.2`, schema `1.2`
- Final result: `analysis-result.v1`, assembler `analysis-result-assembler.v1`

The machine-readable manifest is [VERSION_MANIFEST.json](./VERSION_MANIFEST.json).

## Install, run and test

Requirements: Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
```

Run the complete contract/E2E suite:

```bash
npm run test:contract
```

Run the full repository verification, including the production build and rendered artifact check:

```bash
npm test
```

Target only the Stage 10 E2E suite:

```bash
node --import tsx --test tests/analysis-result-e2e.test.ts
```

## Environment variables

Copy `.env.example` and set values only in the deployment secret store. Never commit real credentials.

- `OPENROUTER_API_KEY`: shared server-only transport key.
- `OPENROUTER_BASE_URL`: optional OpenRouter base URL override.
- `P01_AI_PROVIDER`, `P02_AI_PROVIDER`, `P03_AI_PROVIDER`, `P04_AI_PROVIDER`: provider adapters; currently `openrouter`.
- `P01_AI_MODEL`, `P02_AI_MODEL`, `P03_AI_MODEL`, `P04_AI_MODEL`: explicit model IDs; none is hardcoded.
- `P01_STRUCTURED_OUTPUT`, `P02_STRUCTURED_OUTPUT`, `P03_STRUCTURED_OUTPUT`, `P04_STRUCTURED_OUTPUT`: set `false` only for a provider/model without JSON Schema output.
- `P03_PUBLIC_EXECUTION_ENABLED`, `P03_ORCHESTRATOR_TOKEN`: fail-closed P-03 HTTP execution guard.
- `P04_PUBLIC_EXECUTION_ENABLED`, `P04_ORCHESTRATOR_TOKEN`: fail-closed P-04 HTTP execution guard.
- `ANALYSIS_DEBUG_ENABLED`, `ANALYSIS_DEBUG_TOKEN`: fail-closed final result debug guard.

The current deployment adapter expects a database binding named `DB`. The core is isolated behind repository interfaces; a future Supabase adapter can replace the D1 repositories without changing business contracts.

## Endpoints

Pipeline endpoints:

- `POST /api/diagnostics`
- `POST /api/analysis-runs/:analysisRunId/p01`
- `POST /api/analysis-runs/:analysisRunId/target-archetype`
- `POST /api/analysis-runs/:analysisRunId/p02`
- `POST /api/analysis-runs/:analysisRunId/resolve-tasks`
- `POST /api/analysis-runs/:analysisRunId/select-money-now`
- `POST /api/analysis-runs/:analysisRunId/p03` (disabled unless its feature flag and token are configured)
- `POST /api/analysis-runs/:analysisRunId/p04` (disabled unless its feature flag and token are configured)

Internal/debug final result:

```text
GET /api/internal/analysis-runs/:analysisRunId/result
x-analysis-debug-token: <ANALYSIS_DEBUG_TOKEN>
```

The endpoint is disabled unless `ANALYSIS_DEBUG_ENABLED=true` and a non-empty token is configured. It returns the deterministic final JSON, including fixed route tasks/`doneWhen`, P-04 narrative and the complete selected P-03 outcome. It excludes raw answers, normalized diagnostic input, alternative selector traces, provider raw responses and secrets.

## Data and immutability guarantees

- Raw client answers and normalized input are persisted separately from AI results.
- Each stage stores versioned inputs, outputs and hashes.
- Fixed Matrix 70 `task` and `doneWhen` text is copied byte-identically into the final route.
- The Stage 7 scenario and P-03 prescription are attached directly; P-04 cannot rewrite them.
- `finalFocus.first_action` must equal the first fixed task exactly.
- Final assembly has no timestamp, model call or random business field, so equal snapshots produce equal JSON.
- Existing `analysis_results` storage is append-only per analysis run. A different snapshot/version produces a conflict instead of overwriting history.

## Not production-ready

Stage 10 intentionally does not include:

- Replit or Supabase adaptation;
- production orchestrator/job queue;
- authentication, authorization, tenancy or rate limits for the whole pipeline;
- entitlement/paywall;
- polished client UI;
- PDF generation;
- final OpenRouter model selection;
- production secrets management and observability.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module boundaries and [HANDOFF.md](./HANDOFF.md) for the next implementation steps.
