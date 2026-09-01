# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes directly (dev only)
- `pnpm --filter @workspace/db run generate` — generate a versioned SQL migration file under `lib/db/migrations/` from the current schema (keep this in sync whenever the schema changes, even though `push` is still what's actually run against the database)
- Required env: `SUPABASE_DATABASE_URL` — Postgres connection string to the shared Supabase project (falls back to `DATABASE_URL` if unset)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The Postgres database is a Supabase project shared with other, unrelated apps/tables (e.g. things already in the `public` schema). All of this app's tables live in their own `cabinet` Postgres schema (see `lib/db/src/schema/enums.ts`) to avoid any name collision. `drizzle-kit push`/`generate` are restricted to that schema via `schemaFilter` in `lib/db/drizzle.config.ts` — never widen that filter without checking what else is in the database first.
- Because the DB is external (Supabase, not Replit's managed Postgres), Replit's automatic dev→prod schema sync does **not** apply here. Before publishing, run `pnpm --filter @workspace/db run push` against production data manually (or add a deploy-time migration step) so the `cabinet` schema is up to date.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
