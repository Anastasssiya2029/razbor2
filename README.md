# 7K Business Diagnostic Service

Internal manager-facing service for conducting a 7K business diagnostic during a client meeting. The manager signs in, records the client's answers, runs the staged analysis, reviews the result, adjusts a manager-owned checklist copy when needed, and exports the individual plan to PDF or the analysis register to Excel.

The current release candidate combines the frozen diagnostic core, D1 persistence, application authentication and roles, manager/admin interfaces, saved analyses, Google Sheets synchronization, gifts, Excel export, and the approved multi-page PDF template.

## Release scope

- Internal use by invited employees; clients do not receive separate accounts in this release.
- The manager fills the diagnostic form during a live client meeting.
- Desktop and tablet layouts are supported. The release browser matrix is current Google Chrome, Yandex Browser, and Safari on macOS/iPadOS.
- Enabled production AI stages are pinned to `openai/gpt-5.6-luna-pro` through OpenRouter with structured output enabled.
- Money Now generation is disabled for new release-candidate runs. P-03 therefore follows its deterministic skip path and makes no paid provider call.
- Live provider calls are never part of CI. A paid release smoke test requires explicit product-owner approval.

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

For the current release candidate, `ANALYSIS_FEATURES.moneyNowGeneration` is `false`. P-01 first extracts the shared evidence/business context once, then scores the seven elements in independent parallel structured-output calls. A failed score block is retried alone; the full evidence pass is not replayed. P-04 also uses a reduced provider schema. The backend hydrates the legacy persisted Money Now contract with neutral `unknown` / `not_reported` values, keeping historical snapshots readable without charging for unused generation.

## Application flow

```text
Invited employee signs in
  -> manager fills three diagnostic sections during the meeting
  -> diagnostic and partial progress are persisted
  -> authenticated owner starts/resumes the analysis pipeline
  -> current/target views and then the full plan become available
  -> manager may save a separate editable checklist revision
  -> result is reopened from the cabinet
  -> individual plan is downloaded as PDF
  -> analysis register is exported to Excel / synchronized to Google Sheets
```

The persisted canonical checklist is never overwritten by manager edits. Replaying a completed stage with the same immutable input returns the stored result instead of making a duplicate model call.

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

The request assembly contracts are separately versioned as `p01-request-builder.v2.2`, `p02-request-builder.v2.1` and `p04-request-builder.v2`. They place stable methodology before explicitly marked untrusted client/report data. P-01 v2.2 separates shared evidence extraction from independent per-element scoring, keeps exact evidence references, and forces an upper-level calibration pass before fixing each score. P-02 v2.1 treats persisted current/target values as backend-owned, rejects an empty target gap before a provider call, and canonicalizes its duplicate candidate audit before validation. P-02 sends its JSON Schema only through the provider structured-output channel instead of duplicating the schema in the prompt.

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

Run lint and validate the deployable Sites artifact separately:

```bash
npm run lint
npm run validate:artifact
```

The real Anna/Alina score comparison is deliberately outside CI and fails closed unless paid execution is explicitly unlocked:

```bash
ALLOW_PAID_AI_EVAL=true GOLDEN_CASE=alina npm run eval:p01:golden
```

Use `GOLDEN_CASE=anna` or `all` only after separate approval. The command prints scores, latency, retries, token usage and provider cost without exposing credentials.

Target only the Stage 10 E2E suite:

```bash
node --import tsx --test tests/analysis-result-e2e.test.ts
```

## Environment variables

Copy `.env.example` and set values only in the deployment secret store. Never commit real credentials.

- `OPENROUTER_API_KEY`: shared server-only transport key.
- `OPENROUTER_BASE_URL`: optional OpenRouter base URL override.
- `P01_AI_PROVIDER`, `P02_AI_PROVIDER`, `P03_AI_PROVIDER`, `P04_AI_PROVIDER`: provider adapters; currently `openrouter`.
- `P01_AI_MODEL`, `P02_AI_MODEL`, `P03_AI_MODEL`, `P04_AI_MODEL`: explicit model IDs. The release candidate uses `openai/gpt-5.6-luna-pro` for every stage; values remain runtime configuration rather than application constants.
- `P01_STRUCTURED_OUTPUT`, `P02_STRUCTURED_OUTPUT`, `P03_STRUCTURED_OUTPUT`, `P04_STRUCTURED_OUTPUT`: set `false` only for a provider/model without JSON Schema output.
- `P03_PUBLIC_EXECUTION_ENABLED`, `P03_ORCHESTRATOR_TOKEN`: fail-closed P-03 HTTP execution guard.
- `P04_PUBLIC_EXECUTION_ENABLED`, `P04_ORCHESTRATOR_TOKEN`: fail-closed P-04 HTTP execution guard.
- `ANALYSIS_DEBUG_ENABLED`, `ANALYSIS_DEBUG_TOKEN`: fail-closed final result debug guard.

The current deployment adapter expects a database binding named `DB`. The core is isolated behind repository interfaces; a future Supabase adapter can replace the D1 repositories without changing business contracts.

## Authentication and roles

Application access is invitation-only and backed by the external identity provider. The app session cookie is `HttpOnly`, `Secure` in production, `SameSite=Lax`, and expires after seven days. Disabled users cannot create or reuse sessions.

| Role | Analyses | Team access | Role changes |
|---|---|---|---|
| `architect` | All analyses | Add employees | May assign any role |
| `admin` | All analyses | Add managers | Cannot change roles |
| `manager` | Own analyses only | No access | No access |

Analysis routes enforce ownership or an all-analyses role on the server. The gift draw and full-pipeline execution remain owner-only. Managers receive only their own rows in Excel; architect/admin exports include all permitted analyses.

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
- P-01 does not silently cap an AI-supported Audience score based on a narrow subset of form fields. When deep client knowledge is not visible in those fields, it records a review warning and preserves the scored evidence.
- A block-repair primitive exists for future bounded retries: it accepts only allow-listed top-level replacements, verifies the base hash, and runs the complete stage validation before accepting a candidate. It is not connected to paid production retries until a separately approved model comparison proves it reliable.

## Release readiness

Authentication, authorization, the manager/admin UI, persistent analysis lifecycle, final PDF generation, Excel export, Google Sheets synchronization, and production runtime configuration are implemented. The service is still in release verification rather than generally available status.

The remaining release gates are:

- complete automated regression and business-rule verification;
- Chrome, Yandex Browser, and real Safari desktop/tablet acceptance;
- access-isolation, retry, duplicate-call, and failure-recovery checks;
- one explicitly approved paid end-to-end OpenRouter smoke test;
- manager pilot acceptance, operational instructions, rollback and monitoring checks.

There is no client self-service role, entitlement/paywall, or general-purpose public signup in the current release scope. See [ARCHITECTURE.md](./ARCHITECTURE.md) for module boundaries and [HANDOFF.md](./HANDOFF.md) for the current technical handoff.
