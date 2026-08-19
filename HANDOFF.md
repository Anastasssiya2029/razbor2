# GitHub handoff

## Frozen handoff scope

This Stage 10 tree contains the validated diagnostic core through deterministic `analysis-result.v1`, the D1 repository adapters, a fail-closed internal result endpoint, and a mock-only E2E suite.

Do not change P-01 through P-04 or the 7K methodology during hosting migration unless a reproducible contract bug is demonstrated. Preserve `VERSION_MANIFEST.json` and immutable snapshots/hashes.

## Future work

1. **Replit/Supabase adaptation:** implement repository adapters, preserve unique run constraints and migrate immutable history safely.
2. **Authentication and rate limits:** identities, tenancy, role checks, spend limits and production authorization.
3. **Production orchestrator/job queue:** durable lifecycle, retries, idempotent scheduling and dead-letter handling.
4. **Entitlement/paywall:** backend teaser/full-result/download rights.
5. **Client UI:** map `analysis-result.v1` without changing the core contract.
6. **PDF:** server renderer and entitlement-specific templates.
7. **Live model selection:** evaluate and pin each AI stage separately; keep live smoke outside CI.
8. **Secrets and observability:** secret rotation, redacted logs, stage cost/latency and contract-conflict alerts.

## GitHub connection

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

Expected: all tests green, no live provider calls in CI, and a clean tree after the Stage 10 commit.
