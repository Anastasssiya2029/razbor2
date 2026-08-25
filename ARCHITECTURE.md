# Architecture

## Design rules

The diagnostic core uses three boundaries:

1. **Validated persisted snapshots.** Every stage reads the previous successful persisted result, verifies IDs, versions and hashes, then creates one immutable result for the analysis run.
2. **AI modules with narrow authority.** P-01 extracts evidence/scores, P-02 identifies the transition strategy, P-03 writes a prescription inside a fixed library, and P-04 writes narrative. Each output is schema- and invariant-validated.
3. **Deterministic methodology.** Target Configuration, Business Archetype, Task Resolver, Money Now selection and final AnalysisResult assembly are pure/versioned backend logic.

No later stage repairs or silently guesses a missing upstream decision.

## Module map

| Module | Responsibility | AI |
|---|---|---:|
| `lib/diagnostic-input.ts` | Normalize/validate `DiagnosticInput v1.2` | No |
| `server/p01` | Evidence ledger, Current 7K, Money Now facts/history | Yes |
| `server/stage4` | Target Configuration + Business Archetype | No |
| `server/p02` | Bottleneck, root cause, priority/build, milestones, checkpoint | Yes |
| `server/task-resolver` | Resolve P-02 milestones to Matrix 70 tasks | No |
| `server/money-now-selector` | Contract-driven MN01-MN16 eligibility/ranking | No |
| `server/p03` | Prescription for the immutable selected scenario | Yes |
| `server/p04` | Narrative over immutable upstream snapshots | Yes |
| `server/analysis-result` | Validate and join final `analysis-result.v1` | No |
| `server/auth` | Invitation registry, identity binding, sessions and role policy | No |
| `server/analysis-runs` | Owner-authorized orchestration, overview and access checks | No |
| `server/manager-plan` | Versioned manager checklist copy without canonical mutation | No |
| `server/exports`, `server/google-sheets` | Authorized register export and synchronization | No |
| `app` | Manager meeting form, cabinet, team administration and result/PDF surfaces | No |

## Final AnalysisResult

`server/analysis-result/assembler.ts` accepts only:

- a successful persisted P-03 v1.5 result or deterministic skipped outcome;
- a successful persisted P-04 v1.2 record containing the validated upstream projections and hashes;
- a `ready` analysis run.

The assembler:

- verifies the frozen version manifest;
- validates the persisted P-04 output again against its persisted context/policy/source registry;
- verifies P-03 identity, result equality and hash;
- attaches Current 7K, Target, Archetype, P-02 strategy, full immutable route, Stage 7 scenario, full P-03 outcome and P-04 report;
- validates the final JSON against `schemas/analysis-result.v1.schema.json`;
- rejects raw/provider/secret fields;
- writes through `AnalysisResultRepository` with immutable per-run semantics.

No time-dependent field is included in the JSON. `provenance.assemblyInputHash` is calculated only from frozen versions and persisted inputs.

## Persistence boundary

The domain service depends on repository interfaces:

- `AnalysisResultRepository`
- `P01Repository`
- `TargetArchetypeRepository`
- `P02Repository`
- `TaskResolverRepository`
- `MoneyNowSelectorRepository`
- `P03Repository`
- `P04Repository`

The current implementations use Drizzle/D1. Future Replit/Supabase work should implement the same interfaces and preserve immutable IDs, snapshots, uniqueness by analysis run and exact hashes. It must not modify the pure calculators, schemas or versioned registries.

## Security boundary

Provider raw responses stay in stage-specific server tables and are not copied into `analysis-result.v1`. The internal result route is fail-closed:

- feature flag must be exactly `true`;
- server token must exist;
- `x-analysis-debug-token` must match using constant-time comparison.

Application authorization is separate from this debug control:

- `architect` and `admin` may view all analyses;
- `manager` may access only an analysis owned by the same application user;
- full pipeline execution and gift drawing require the analysis owner;
- user and export endpoints apply role-aware server checks;
- sessions are random, stored as hashes, bound to active users, and expire after seven days.

Direct P-03 and P-04 HTTP endpoints have independent fail-closed feature-flag and orchestrator-token guards. The normal manager flow does not enable those public endpoints.

## Testing

Contract and E2E tests use persisted fixtures and never call a live provider. They cover the diagnostic form, role policy, access-aware application surfaces, staged analysis, deterministic business rules, replay behavior, exports, manager revisions, gifts, and PDF composition. A live provider smoke test is intentionally separate, paid, and requires explicit approval.
