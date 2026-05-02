# Deployment

The app is deployed on **Replit Autoscale** (`deploymentTarget = "autoscale"` in `.replit`). Both artifacts are published together as a single deployment, with the shared proxy routing requests to the right service based on path.

**Live URL:** https://qurantracker.replit.app

## Deployment topology

```text
                            https://qurantracker.replit.app
                                       │
                                       ▼
                          ┌─────────────────────────────┐
                          │  Replit shared proxy (TLS)  │
                          └────────┬─────────────┬──────┘
                                   │             │
                          path /api│             │ path /*
                                   ▼             ▼
                          ┌────────────┐   ┌────────────────────┐
                          │ api-server │   │ quran-tracker      │
                          │ Node 24    │   │ static assets      │
                          │ :8080      │   │ (served as static) │
                          └─────┬──────┘   └────────────────────┘
                                │
                                ▼
                          PostgreSQL (managed)
                                │
                                ▼
                          Clerk (cloud, separate live instance)
```

## Per-artifact deployment config

Each artifact ships its own `.replit-artifact/artifact.toml`. You should never edit these by hand — use the `artifacts` skill — but here's what they encode.

### `artifacts/api-server/.replit-artifact/artifact.toml`

```toml
kind = "api"
previewPath = "/api"
title = "API Server"

[[services]]
localPort = 8080
name = "API Server"
paths = ["/api"]            # everything under /api goes here

[services.development]
run = "pnpm --filter @workspace/api-server run dev"
                            # esbuild bundle + node start

[services.production.build]
args = ["pnpm", "--filter", "@workspace/api-server", "run", "build"]
[services.production.build.env]
NODE_ENV = "production"

[services.production.run]
args = ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
                            # not via pnpm — faster cold start
[services.production.run.env]
PORT = "8080"
NODE_ENV = "production"

[services.production.health.startup]
path = "/api/healthz"       # deployment is healthy when this returns 200
```

### `artifacts/quran-tracker/.replit-artifact/artifact.toml`

```toml
kind = "web"
previewPath = "/"
title = "Quran Memorization Tracker"
router = "path"

[[services]]
name = "web"
paths = [ "/" ]
localPort = 20353

[services.development]
run = "pnpm --filter @workspace/quran-tracker run dev"

[services.production]
build  = [ "pnpm", "--filter", "@workspace/quran-tracker", "run", "build" ]
publicDir = "artifacts/quran-tracker/dist/public"
serve = "static"            # served as static files

[[services.production.rewrites]]
from = "/*"
to   = "/index.html"        # SPA fallback for client-side routes

[services.env]
PORT = "20353"
BASE_PATH = "/"
```

The SPA is served as **plain static files** in production — there's no Node process for the frontend.

## Build pipeline

When you deploy:

1. The platform runs `pnpm install --frozen-lockfile`.
2. For each artifact, the production `build` command runs:
   - **api-server:** `pnpm --filter @workspace/api-server run build` → `node ./build.mjs` → esbuild bundles everything into `artifacts/api-server/dist/index.mjs`.
   - **quran-tracker:** `pnpm --filter @workspace/quran-tracker run build` → `vite build` → static assets to `artifacts/quran-tracker/dist/public/`.
3. Post-build: `pnpm store prune` cleans the pnpm store cache.
4. Production starts the api-server via `node --enable-source-maps artifacts/api-server/dist/index.mjs`.
5. The static SPA assets are mounted by the proxy.
6. The platform polls `/api/healthz` until it returns 200, then routes traffic.

## Environment variables in production

Production reads the same set of env vars as development; the values differ.

| Variable | Production source | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Platform-provided | Production Postgres connection. **Different DB from dev.** |
| `VITE_CLERK_PUBLISHABLE_KEY` | userenv | Live Clerk publishable key (`pk_live_…`). Baked into the JS bundle at build time. |
| `CLERK_SECRET_KEY` | secret | Live Clerk secret key (`sk_live_…`). Server-only. |
| `CLERK_PUBLISHABLE_KEY` | userenv | Same value as `VITE_CLERK_PUBLISHABLE_KEY`. |
| `OWNER_EMAIL` | userenv | Optional — leave unset if you don't have legacy NULL-user data. |
| `SESSION_SECRET` | secret | Used by Express session if/when needed. |
| `NODE_ENV` | derived | Set to `production` by the build. |
| `PORT` | derived | `8080` for the API; the SPA is static so doesn't need one. |

**Never commit secrets.** Secrets live in the Replit secrets vault, not in `.replit`.

## Database in production

Production uses a **separate Postgres instance** from development. Schema changes are not auto-applied to production — you must explicitly push:

```bash
# in the production Replit shell (or via the database skill)
DATABASE_URL=<production_url> pnpm --filter db push
```

Alternatively use the database skill to run a read-only query against the prod DB without exposing the connection string.

If you deploy a code change that depends on a new column and forget to push the schema, the API server will crash with `relation does not exist` or `column ... does not exist`. Always push the schema **before** rolling out code that depends on it.

## Rollback

The Replit deployment dashboard keeps the previous build ready for one-click rollback. If a new deploy is broken, hit "Rollback" — traffic returns to the previous version within seconds. Code in the editor is not affected.

## Logs and debugging in production

- **Application logs:** view via the deployment logs pane in the Replit dashboard, or use the `fetch_deployment_logs` agent tool.
- **Health:** `curl -i https://qurantracker.replit.app/api/healthz` should return 200.
- **Common production-only failures:**
  - `column ... does not exist` — schema not pushed to prod DB.
  - 401 redirect loop — Clerk publishable/secret keys mismatched (test vs live), or live keys not set.
  - Blank SPA — `BASE_PATH` mismatch or stale build artifacts.

## Suggesting a deploy

After verifying changes locally (typecheck + e2e test), call `suggest_deploy()` from the agent. The user clicks "Publish" in the dashboard to ship; the agent does not deploy directly.
