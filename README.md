# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout and then validates the Sites artifact. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build, validate, and verify the rendered development-preview metadata
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## P-01 Evidence + Current 7K

Submitting `POST /api/diagnostics` stores the immutable raw answers and the
normalized `DiagnosticInput v1.2`, then creates an analysis run in `queued`.
The response exposes the server-side `POST /api/analysis-runs/:analysisRunId/p01`
next step. That endpoint runs only the current P-01 contract and moves a successful run to
`targeting`; it does not execute Money Now selection, P-02, P-03 or P-04.

The returned next step, `POST /api/analysis-runs/:analysisRunId/target-archetype`,
loads the persisted validated P-01 result and deterministically reuses the
stage-2 Target Configuration and Business Archetype calculators. A successful
run moves from `targeting` to `strategizing`, meaning only that it is ready for
P-02. P-02 is not started automatically.

Runtime configuration:

- `P01_AI_PROVIDER=openrouter` (currently the supported adapter; default);
- `OPENROUTER_API_KEY` (required, server-only);
- `P01_AI_MODEL` (required; no model is hardcoded);
- `OPENROUTER_BASE_URL` (optional);
- `P01_STRUCTURED_OUTPUT=false` only for a model without JSON Schema support;
- `P01_APP_URL` and `P01_APP_TITLE` (optional OpenRouter attribution headers).

Provider raw responses and usage metadata are stored only in the server-side
`p01_analysis_results` table and are never returned by the P-01 API route.

## P-02 Transition Strategist v1.3

`POST /api/analysis-runs/:analysisRunId/p02` is accepted only while the run is
`strategizing`. The server builds an allowlisted strategy context from the
persisted validated P-01 v1.3 result and a separate allowlisted Target
Configuration projection from persisted Stage 4. Raw diagnostic answers,
Money Now signals/history, the selected Money Now scenario, Business Archetype,
Matrix 70 task text and provider raw responses are not injected into P-02.

The output is checked against schema `1.3` and backend semantic invariants. A
valid result moves the run to `resolving_tasks`; this status only means that the
strategy is ready for the future deterministic Task Resolver. The resolver,
Money Now selector, P-03, P-04 and final report are not started here.

P-02 runtime configuration is independent from P-01:

- `P02_AI_PROVIDER=openrouter` (supported adapter; default);
- `OPENROUTER_API_KEY` (shared server-only transport key);
- `P02_AI_MODEL` (required; no model is hardcoded);
- `P02_STRUCTURED_OUTPUT=false` only when JSON Schema output is unavailable;
- `P02_APP_URL` and `P02_APP_TITLE` are optional attribution headers.

Validated output, versioned input hashes, usage, retries and server-only raw
provider response are stored in the additive `p02_analysis_results` table.

## P-03 Money Now Prescription v1.5

`POST /api/analysis-runs/:analysisRunId/p03` consumes only the immutable Stage 7
selection and the persisted validated P-01 evidence result. It never receives
alternative Money Now candidates, P-02, Target Configuration, Business
Archetype, Task Resolver output or raw diagnostic answers.

The server uses `money-now-prescription-rules.v1` as the only prescription
registry. Causes and interventions are validated against the selected
MN01–MN16 scenario, supporting 7K elements are derived by the backend, and all
numeric baselines/targets come from role-separated backend metrics. Every
selected intervention also requires a structured persisted-attempt history
review. A valid or
evidence-blocked result moves `money_now` to `writing_report`. When Stage 7
returns `no_eligible_scenario`, P-03 stores a deterministic skipped result and
does not call the AI provider. P-04 is not started automatically.

Runtime configuration:

- `P03_AI_PROVIDER=openrouter` (supported adapter; default);
- `OPENROUTER_API_KEY` (shared server-only transport key);
- `P03_AI_MODEL` (required; no model is hardcoded);
- `P03_STRUCTURED_OUTPUT=false` only when JSON Schema output is unavailable;
- `P03_APP_URL` and `P03_APP_TITLE` are optional attribution headers.
- `P03_PUBLIC_EXECUTION_ENABLED=true` explicitly enables the HTTP execution
  surface; it is disabled by default;
- `P03_ORCHESTRATOR_TOKEN` is required together with the feature flag and must
  match the server-only `x-p03-orchestrator-token` request header.

The public HTTP route is fail-closed unless both protection settings are
present. Internal server orchestration may call the stage runner directly.

Full P-03 output and provider raw responses stay in the server-only
`p03_prescription_results` table. The public endpoint returns only the outcome,
locked teaser, lifecycle status and the next-step marker for P-04.

## P-04 Report Writer v1.2

`POST /api/analysis-runs/:analysisRunId/p04` is an internal/orchestrator-only
stage endpoint accepted from `writing_report`. It builds an allowlisted
`P04_CONTEXT`, deterministic `REPORT_POLICY` and canonical `SOURCE_REGISTRY`
from persisted P-01, Target/Archetype, P-02, Task Resolver, Stage 7 and P-03
snapshots. It does not receive raw diagnostic answers, provider raw responses,
P-02 candidate audit or alternative Money Now ranking.

P-04 writes narrative only. Backend validation keeps current/target scores,
archetype, priority/build bundle, route cards, task IDs, business validation and
the first fixed task immutable. The output supports Money Now states
`available`, `no_eligible_scenario`, `blocked_insufficient_evidence` and
`blocked_inconsistency`; it never copies the paid P-03 prescription into its
own result. A valid result moves `writing_report` to `ready`, but no final public
AnalysisResult, UI projection or PDF is assembled at this stage.

Runtime configuration:

- `P04_AI_PROVIDER=openrouter` (supported adapter; default);
- `OPENROUTER_API_KEY` (shared server-only transport key);
- `P04_AI_MODEL` (required; no model is hardcoded);
- `P04_STRUCTURED_OUTPUT=false` only when JSON Schema output is unavailable;
- `P04_APP_URL` and `P04_APP_TITLE` are optional attribution headers;
- `P04_PUBLIC_EXECUTION_ENABLED=true` explicitly enables the protected HTTP
  execution surface, which is disabled by default;
- `P04_ORCHESTRATOR_TOKEN` must match the server-only
  `x-p04-orchestrator-token` request header.

Full output, context/policy/registry snapshots, upstream hashes and provider raw
responses are stored only in `p04_report_results`. The HTTP response exposes
only lifecycle status, `nextStep: null` and idempotency metadata.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
