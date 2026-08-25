# Technical handoff

## Current release-candidate scope

The repository contains the frozen diagnostic core through deterministic `analysis-result.v1`, D1 persistence, a fail-closed internal result endpoint, invitation-only application authentication, architect/admin/manager authorization, the manager diagnostic flow, saved analyses, manager checklist revisions, gifts, Google Sheets synchronization, Excel export, and the approved client PDF.

Do not change P-01 through P-04 or the 7K methodology during release hardening unless a reproducible contract bug is demonstrated and approved. Preserve `VERSION_MANIFEST.json`, immutable snapshots/hashes, the Matrix 70 task wording, and deterministic ordering rules.

## Production configuration

- P-01, P-02, P-03 and P-04 use `openai/gpt-5.6-luna-pro` through OpenRouter.
- Structured output is enabled for all four stages.
- Direct public execution of P-03 and P-04 is disabled; the authenticated owner uses the orchestrated run route.
- The internal result debug endpoint is disabled in production.
- Runtime credentials stay in the hosting secret store and must never be committed.

## Remaining release gates

1. Run the complete contract/E2E suite, lint, verified production build, and rendered artifact test from a clean release candidate.
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
git status --short
git log -1 --oneline
```

Expected: all tests green, no live provider calls in CI, a valid deployable artifact, and a clean release tree containing neither local transfer notes nor generated `output/` and `tmp/` artifacts.
