# Technical handoff

## Current release-candidate scope

The repository contains the frozen diagnostic core through deterministic `analysis-result.v1`, D1 persistence, a fail-closed internal result endpoint, invitation-only application authentication, architect/admin/manager authorization, the manager diagnostic flow, saved analyses, manager checklist revisions, gifts, Google Sheets synchronization, Excel export, and the approved client PDF.

Do not change P-01 through P-04 or the 7K methodology during release hardening unless a reproducible contract bug is demonstrated and approved. Preserve `VERSION_MANIFEST.json`, immutable snapshots/hashes, the Matrix 70 task wording, and deterministic ordering rules. The latest approved scoring correction is methodology `7K-2026-08-v5.7`, scoring resource `scoring-rules.v3.4`, P-01 request builder `v2.4`, and target rules `v2.3`.

## Production configuration

- Enabled AI stages use `openai/gpt-5.6-luna-pro` through OpenRouter. Money Now generation is disabled for new release-candidate runs, so P-03 takes the deterministic skip path without a provider call.
- P-01 request builder v2.4 extracts shared evidence once, evaluates seven score blocks in parallel, and retries only a failed score block. Request builders keep methodology before explicitly marked client/report data; P-02 no longer duplicates its output schema in the prompt.
- Scoring v3.4 removed the incorrect universal cap “without a current example max 2”. Each 7K element has its own evidence policy. Authenticity level 4 can be supported by a coherent formula of strengths and working method; level 5 additionally needs a current observed client effect. Product level 5 requires an explicit A→B path, stages, format and result.
- Delegation capabilities apply deterministic team prerequisites. Plain diagnostic wording such as “делегировать продажи” restores the owner role and modifier when the AI capability list is incomplete.
- P-02 rejects an all-zero target gap before any provider call and this upstream failure is not eligible for the paid plan-only retry.
- The former backend-only Audience score cap has been replaced by a non-mutating review warning.
- Safe block-repair infrastructure is present but intentionally not wired into paid retries until a separately approved live comparison.
- Structured output is enabled for all four stages.
- Direct public execution of P-03 and P-04 is disabled; the authenticated owner uses the orchestrated run route.
- The internal result debug endpoint is disabled in production.
- `advanceAnalysisPipeline` groups each paid stage with following deterministic stages. When Money Now is disabled, the normal resumable flow takes three HTTP advances: P-01 + target, P-02 + tasks + skipped P-03, then P-04 + assembly.
- Each run request writes a bounded PII-free timing/status event to `analysisRuns.modelMetadataJson`; this is diagnostics only and does not alter client-facing copy or business decisions.
- The cabinet exposes `GET /api/analysis-runs/:analysisRunId/answers.xls`. It downloads that client's 24 original questionnaire answers in a readable, formula-safe workbook and is protected by the same role-aware analysis access check.
- Runtime credentials stay in the hosting secret store and must never be committed.

## Remaining release gates

Latest local verification on 2026-08-28: 498/498 contract tests passed and the verified production build passed. No live provider call was made for this verification.

1. Repeat the complete contract/E2E suite, lint, verified production build, and rendered artifact test from the final clean release candidate.
2. Verify the manager's full meeting flow, reload/resume behavior, error recovery, and duplicate-click idempotency without using live AI until approved.
3. Verify architect/admin/manager isolation on every user-facing and pipeline route, including Excel and manager-plan revisions.
4. Accept the UI and PDF in current desktop/tablet Chrome, Yandex Browser, and real Safari on macOS/iPadOS.
5. With explicit budget approval, run a limited live OpenRouter smoke test and record stage latency, retries, token usage, cost, and final PDF.
6. Complete the manager pilot, operational instructions, backup/rollback check, and first-48-hour monitoring plan.

## Deferred beyond the manager release

- client self-service accounts and public signup;
- entitlement/paywall;
- a general-purpose production job queue for larger concurrency;
- a future Supabase data adapter if D1 is replaced;
- model changes that have not passed golden-case comparison and a separately approved paid smoke test.

## Repository connection

The current `origin` is the workspace hosting remote at `git.chatgpt-team.site`, not GitHub. Do not overwrite it. After the product owner supplies the exact GitHub repository URL and confirms visibility, add a second remote:

```bash
git remote add github git@github.com:<owner>/<repository>.git
git push -u github fix/p01-transport-instrumentation
```

Do not force-push or rewrite history. The external reviewer should start with `README.md`, `ARCHITECTURE.md`, this file, and `VERSION_MANIFEST.json`; then inspect `server/7k/config/scoring-rules.v3.0.ts`, `server/p01/split-request.ts`, `server/analysis-runs/pipeline.ts`, and the contract tests.

## Acceptance commands

```bash
npm ci
npm run test:contract
npm test
npm run lint
npm run validate:artifact
git status --short
git log -1 --oneline
```

After explicit paid-test approval only:

```bash
ALLOW_PAID_AI_EVAL=true GOLDEN_CASE=alina npm run eval:p01:golden
```

Expected: all tests green, no live provider calls in CI, a valid deployable artifact, and a clean release tree containing neither local transfer notes nor generated `output/` and `tmp/` artifacts.
