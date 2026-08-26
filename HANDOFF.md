# Technical handoff

## Current release-candidate scope

The repository contains the frozen diagnostic core through deterministic `analysis-result.v1`, D1 persistence, a fail-closed internal result endpoint, invitation-only application authentication, architect/admin/manager authorization, the manager diagnostic flow, saved analyses, manager checklist revisions, gifts, Google Sheets synchronization, Excel export, and the approved client PDF.

Do not change P-01 through P-04 or the 7K methodology during release hardening unless a reproducible contract bug is demonstrated and approved. Preserve `VERSION_MANIFEST.json`, immutable snapshots/hashes, the Matrix 70 task wording, and deterministic ordering rules.

## Production configuration

- Enabled AI stages use `openai/gpt-5.6-luna-pro` through OpenRouter. Money Now generation is disabled for new release-candidate runs, so P-03 takes the deterministic skip path without a provider call.
- P-01 request builder v2.2 extracts shared evidence once, evaluates seven score blocks in parallel, and retries only a failed score block. Request builders keep methodology before explicitly marked client/report data; P-02 no longer duplicates its output schema in the prompt.
- P-02 rejects an all-zero target gap before any provider call and this upstream failure is not eligible for the paid plan-only retry.
- The former backend-only Audience score cap has been replaced by a non-mutating review warning.
- Safe block-repair infrastructure is present but intentionally not wired into paid retries until a separately approved live comparison.
- Structured output is enabled for all four stages.
- Direct public execution of P-03 and P-04 is disabled; the authenticated owner uses the orchestrated run route.
- The internal result debug endpoint is disabled in production.
- Runtime credentials stay in the hosting secret store and must never be committed.

## Remaining release gates

Latest local verification on 2026-08-26: 451/451 contract tests passed, verified production build passed, deployable artifact validation passed, and rendered HTML check passed. Lint has zero errors and five pre-existing unused-symbol warnings outside this change.

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

The current `origin` may be the workspace hosting remote rather than GitHub. Do not overwrite it. After creating a GitHub repository:

```bash
git remote add github git@github.com:<owner>/<repository>.git
git push -u github main
```

If the branch differs, substitute `git branch --show-current`. Do not force-push or rewrite history.

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
