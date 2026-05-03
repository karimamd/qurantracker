# Development Setup

This project is designed to be developed inside the Replit editor, but most steps work on a local Linux/macOS box too.

## Prerequisites

- **Node.js 24** (set in `.replit` as `modules = ["nodejs-24", ...]`).
- **pnpm** (the only supported package manager — there's a `preinstall` guard that fails the install if you use npm or yarn).
- **PostgreSQL 16** with a connection string in the `DATABASE_URL` environment variable.
- A **Clerk** account with a development instance (free tier is fine).

## First-time setup

### 1. Install dependencies

```bash
pnpm install
```

This installs all workspace packages and their devDependencies (frozen by the lockfile in CI; freshly resolved otherwise).

### 2. Provision the database

If you're on Replit, the platform provisions Postgres for you and exports `DATABASE_URL`. Otherwise create a local DB and set the env var:

```bash
export DATABASE_URL="postgres://user:pass@localhost:5432/qurantracker"
```

### 3. Push the schema

```bash
pnpm --filter db push
```

This applies `lib/db/src/schema/*.ts` to the live database (no migration files involved; Drizzle diffs and applies).

### 4. Configure Clerk

In your Clerk dashboard, create an application (Development environment).

Set these environment variables:

| Variable | Where | Value |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | userenv (build-time) | `pk_test_…` from Clerk |
| `CLERK_SECRET_KEY` | secret | `sk_test_…` from Clerk |
| `CLERK_PUBLISHABLE_KEY` | userenv | same as VITE_CLERK_PUBLISHABLE_KEY |
| `OWNER_EMAIL` | userenv (optional) | the Clerk account email that should claim any pre-existing NULL-user data |

On Replit:
- `VITE_*` and `OWNER_EMAIL` go in `.replit` under `[userenv.shared]`.
- `CLERK_SECRET_KEY` and `SESSION_SECRET` go in the Secrets pane (never in `.replit`).

### 5. Generate the API client + schemas

```bash
pnpm --filter @workspace/api-spec run codegen
```

This is required after pulling — the generated files in `lib/api-zod/src/generated/` and `lib/api-client-react/src/generated/` are checked in but may be stale on a fresh clone.

### 6. Build the libs

```bash
pnpm run typecheck:libs
```

This runs `tsc --build` over the lib packages, producing the declaration files the artifacts depend on.

## Running the app

Each artifact runs as its own workflow. **Don't run `pnpm dev` from the repo root.**

### On Replit (recommended)

The three workflows are pre-configured and start automatically:

- `artifacts/quran-tracker: web` — Vite dev server on port 20353
- `artifacts/api-server: API Server` — esbuild bundle + Node on port 8080
- `artifacts/mockup-sandbox: Component Preview Server` — port 8081 (only needed for component prototyping)

The shared proxy on `localhost:80` routes:
- `/api/*` → API server
- `/*` → SPA

Open the preview pane to see the app. To restart a service after code changes, restart the workflow (use the workflows panel or the agent's restart tool).

### Locally (without Replit)

You'll need to start each artifact yourself and either run a reverse proxy or change the SPA's `customFetch` base URL to point at the API. Run in three terminals:

```bash
# Terminal 1 — API
PORT=8080 DATABASE_URL=… CLERK_SECRET_KEY=… pnpm --filter @workspace/api-server run dev

# Terminal 2 — SPA
PORT=20353 BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=… pnpm --filter @workspace/quran-tracker run dev

# Terminal 3 — DB ops as needed
psql "$DATABASE_URL"
```

If you don't run a reverse proxy, the SPA's calls to `/api/...` won't reach the API server. The simplest workaround is a Vite dev proxy in `vite.config.ts`, but on Replit that's unnecessary because the platform proxy handles it.

## Day-to-day workflow

```bash
# Type-check everything (the canonical green-bar check)
pnpm run typecheck

# Build everything
pnpm run build

# Regenerate API client/schemas after editing OpenAPI
pnpm --filter @workspace/api-spec run codegen

# Apply schema changes to the dev DB
pnpm --filter db push

# Restart a workflow after a server-side change
#  (on Replit: use the agent or the workflows panel)

# Regenerate the bundled Quran text dump (rarely needed; the file is committed)
pnpm --filter @workspace/scripts run build-quran-dump
```

The Quran-text dump (`artifacts/quran-tracker/public/quran-dump.json`, ~2 MB, all 604 pages) is checked into the repo. The Reader uses it as a layered fallback (IndexedDB → bundled dump → `api.alquran.cloud`), so a self-hosted fork has zero external API dependency at runtime. Only regenerate the dump if you change the ayah post-processing rules — and remember to bump `CACHE_VERSION` in `artifacts/quran-tracker/src/lib/quran-page-cache.ts` so old IndexedDB entries are purged.

### Health checks

```bash
curl -i localhost:80/api/healthz             # 200 {"status":"ok"}
curl -i localhost:80/                        # SPA HTML
```

### Inspecting logs

In Replit each workflow's stdout is captured automatically and visible in the workflows panel. From the agent CLI you can refresh and read them:

```bash
ls /tmp/logs/        # workflow logs (agent only)
```

## Project conventions to follow

- **Edit OpenAPI, regenerate.** Never hand-edit `lib/api-zod/src/generated/` or `lib/api-client-react/src/generated/`.
- **No `console.log` in server code.** Use `req.log` (route handlers) or the `logger` singleton elsewhere — pino structured output.
- **Always filter by `req.userId`.** Every Drizzle query that touches a user-facing table must include `eq(<table>.userId, userId)`. Lack of this is a real bug.
- **Use the generated hooks in React.** Don't write `fetch("/api/...")` by hand.
- **Test through `runTest()`.** End-to-end tests catch real issues that unit tests miss. The testing harness can sign in via Clerk programmatically (`testClerkAuth: true`).
- **Document significant changes** in `replit.md` (always-loaded agent memory) and the relevant file under `docs/`.
