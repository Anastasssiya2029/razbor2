# Architecture

## Design rules

The diagnostic core uses three boundaries:

1. **Validated persisted snapshots.** Every stage reads the previous successful persisted result, verifies IDs, versions and hashes, then creates one immutable result for the analysis run.
2. **AI modules with narrow authority.** P-01 extracts evidence/scores, P-02 identifies the transition strategy, P-03 writes a prescription inside a fixed library, and P-04 writes narrative. Each output is schema- and invariant-validated.
3. **Deterministic methodology.** Target Configuration, Business Archetype, Task Resolver, Money Now selection and final AnalysisResult assembly are pure/versioned backend logic.

No later stage repairs or silently guesses a missing upstream decision.

New release-candidate runs currently disable the Money Now generation branch through `server/analysis-features.ts`. P-01 extracts one shared evidence/business context and then evaluates the seven 7K elements independently in parallel; P-01/P-04 provider schemas omit Money Now. Compatibility adapters hydrate fail-closed persisted values. The deterministic selector returns no eligible scenario and P-03 uses its existing zero-provider-call skip path. Historical completed runs remain readable.

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
| `server/ai/block-repair.ts` | Hash-bound, allow-listed atomic block replacement primitive; not enabled in the paid retry path | No |
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

## Provider request boundary

The prompt text, request assembly and output schema are separate contracts. Request builders v2 put stable methodology first and place escaped client/report payloads in an explicit untrusted data block at the end. P-02 does not embed a second JSON Schema copy in prompt text; the provider receives the canonical schema through structured output.

P-01 retries transport/schema failures only for the failed subrequest. A semantic score failure triggers at most one re-evaluation of that element and then complete merged schema/invariant validation; the shared evidence context and the other six scores are preserved. P-02 still permits one bounded full strategy re-evaluation, but an empty deterministic target gap is rejected before provider configuration or a paid call. The inactive general block-repair primitive deliberately avoids arbitrary JSON Patch paths: it checks the exact base hash, replaces only allow-listed top-level blocks on a clone, and accepts the result only after full schema and cross-module invariant validation.

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

Contract and E2E tests use persisted fixtures and never call a live provider. They cover the diagnostic form, role policy, access-aware application surfaces, staged analysis, deterministic business rules, replay behavior, exports, manager revisions, gifts, and PDF composition. `npm run eval:p01:golden` is a separate fail-closed Anna/Alina provider comparison and requires both `ALLOW_PAID_AI_EVAL=true` and explicit approval.
