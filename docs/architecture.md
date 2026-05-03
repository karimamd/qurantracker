# Architecture

## Monorepo layout

This is a pnpm workspace. Each package is independent and declares its own dependencies.

```text
artifacts/                              Deployable applications
├── api-server/                         Express 5 REST API (Node 24, ESM bundle)
│   ├── src/
│   │   ├── index.ts                    Entrypoint — boots Express, attaches middlewares, listens on PORT
│   │   ├── app.ts                      Express app factory — wires routes
│   │   ├── routes/                     Per-domain route modules
│   │   │   ├── health.ts               GET /healthz
│   │   │   ├── settings.ts             /settings — SR interval + language + telawa goal config
│   │   │   ├── progress.ts             /progress/* — pages, juz, surah, rub', charts, activity,
│   │   │   │                            mistakes (history + per-page active queue), undo
│   │   │   ├── homework.ts             /homework/* — sessions and items
│   │   │   ├── telawa.ts               /telawa/* — today's plan, record/undo read,
│   │   │   │                            start Khatmah, update active Khatmah, stats
│   │   │   └── index.ts                Aggregates routers
│   │   ├── middlewares/
│   │   │   ├── requireAuth.ts          Resolves Clerk userId OR mints/migrates a guest_id cookie
│   │   │   └── clerkProxy.ts           Proxies Clerk frontend assets to avoid 3rd-party-cookie issues
│   │   └── lib/
│   │       ├── progress-helpers.ts     calculateDueDate, enrichPageProgress (incl. effectiveQuality auto-downgrade),
│   │       │                            aggregateQuality, ensurePageExists, getSettings
│   │       ├── quran-data.ts           Page → Juz/Rob3/Surah lookups (server copy)
│   │       └── page-names.json         Default per-page name (surah + ayah text)
│   ├── build.mjs                       esbuild bundling script (CJS → single ESM bundle)
│   └── .replit-artifact/artifact.toml  Service definition (port 8080, path /api, prod build/start)
│
├── quran-tracker/                      React + Vite SPA
│   ├── src/
│   │   ├── main.tsx                    Vite entrypoint — also imports ./i18n for side-effects
│   │   ├── App.tsx                     Router + ClerkProvider + QueryClientProvider + ProtectedApp + landing
│   │   ├── pages/                      One file per top-level route (dashboard, reader, mistakes, rob3-list, …)
│   │   ├── components/                 Layout, ErrorBoundary, QualityBadge, PageRow, OnboardingScopeSetup, GuestSavePrompt, ui/* (shadcn)
│   │   ├── hooks/                      use-mobile, use-toast
│   │   ├── i18n/                       react-i18next setup + en.json + ar.json (RTL)
│   │   ├── lib/                        page-names, quran-ref helpers, quality utilities, utils
│   │   └── index.css                   Tailwind entry
│   ├── vite.config.ts                  Vite config (allows all hosts for the proxy iframe)
│   └── .replit-artifact/artifact.toml  Static-build deployment config
│
└── mockup-sandbox/                     Vite preview server for isolated component prototyping (dev-only)

lib/                                    Shared libraries
├── api-spec/
│   ├── openapi.yaml                    SOURCE OF TRUTH for the HTTP contract
│   └── orval.config.ts                 Generates api-zod + api-client-react
├── api-zod/src/generated/              GENERATED — Zod schemas + TS types
├── api-client-react/src/
│   ├── generated/                      GENERATED — React Query hooks
│   └── custom-fetch.ts                 The fetch mutator used by all hooks (handles base URL, auth)
└── db/
    ├── src/schema/                     Drizzle tables — one file per domain:
    │                                    settings, page-progress, recitation-log, homework,
    │                                    ayah-mistakes, telawa, telawa-khatmah
    ├── src/index.ts                    db client export + table re-exports
    └── drizzle.config.ts               drizzle-kit config (uses DATABASE_URL)

scripts/                                Workspace utility scripts (typecheck-only package)
└── post-merge.sh                       Runs after task-agent merges: pnpm install + db push
```

## Runtime topology

Local development and production both route through a single shared reverse proxy that dispatches on URL path.

```text
                            ┌────────────────────────────────────────────────────┐
                            │       Replit shared proxy  (localhost:80 / HTTPS)  │
                            └────────────┬────────────────────────┬──────────────┘
                                         │                        │
                              path "/api"│                        │ path "/"
                                         ▼                        ▼
                            ┌─────────────────────┐   ┌────────────────────────┐
                            │  api-server         │   │  quran-tracker         │
                            │  Express 5  :8080   │   │  Vite dev :20353       │
                            │  - clerkMiddleware  │   │  - serves SPA          │
                            │  - requireAuth      │   │  - calls /api via      │
                            │  - routes/*         │   │    customFetch         │
                            └──────────┬──────────┘   └────────────────────────┘
                                       │
                                       ▼
                            ┌─────────────────────┐
                            │  PostgreSQL 16      │
                            │  (DATABASE_URL)     │
                            └─────────────────────┘

                                       ▲
                                       │  token verification
                                       │
                            ┌─────────────────────┐
                            │      Clerk          │
                            │   (cloud, JWT)      │
                            └─────────────────────┘
```

**Why path-based routing?** The frontend never makes a cross-origin request. `fetch("/api/progress/overview")` from the SPA is routed by the proxy to the API server. This avoids CORS and third-party-cookie problems for Clerk.

## Layered design

The codebase favours a thin, layered architecture:

```text
┌──────────────────────────────────────────────────────────────────────┐
│  React UI                                                             │
│  pages/* + components/*                                               │
└──────────────────────────────┬────────────────────────────────────────┘
                               │  uses generated React Query hooks
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  lib/api-client-react  (generated)                                    │
│  hooks: useGetProgressOverview, useUndoRecitation, ...                │
│  → customFetch  →  fetch("/api/...")                                  │
└──────────────────────────────┬────────────────────────────────────────┘
                               │  HTTP over the shared proxy
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  artifacts/api-server  (Express 5)                                    │
│  pino logger → clerkMiddleware → requireAuth → routes/*               │
│  routes use Zod schemas from lib/api-zod for validation               │
└──────────────────────────────┬────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  artifacts/api-server/src/lib  (domain helpers)                       │
│  calculateDueDate, enrichPageProgress, getSettings, ensurePageExists  │
└──────────────────────────────┬────────────────────────────────────────┘
                               │  uses Drizzle ORM
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  lib/db  (Drizzle schema + client)                                    │
│  pageProgressTable, recitationLogTable, homework*Table, settingsTable │
└──────────────────────────────┬────────────────────────────────────────┘
                               │
                               ▼
                       PostgreSQL 16
```

## TypeScript model

- `lib/*` packages are **composite** and emit declarations via `tsc --build`.
- `artifacts/*` and `scripts` are **leaf packages** typechecked with `tsc --noEmit`.
- Root `tsconfig.json` is a solution file referencing only the libs.
- `tsconfig.base.json` holds the strict shared compiler defaults.

Run `pnpm run typecheck` for the canonical full check (libs build + leaves verified). Trust this over editor/LSP diagnostics when they disagree.

## Build pipeline

| Package | Build step | Output |
| --- | --- | --- |
| `lib/db`, `lib/api-zod`, `lib/api-client-react` | `tsc --build` | `dist/` with declarations + ESM |
| `artifacts/api-server` | `node build.mjs` (esbuild) | `dist/index.mjs` — single bundled ESM file |
| `artifacts/quran-tracker` | `vite build` | `dist/public/` — static SPA |
| `lib/api-spec` codegen | `orval` | overwrites generated dirs in `api-zod` and `api-client-react` |

The repo's root `pnpm run build` runs `typecheck` then `pnpm -r --if-present run build` — every workspace package builds itself.

## Generated code, never edited by hand

Two directories are produced by `pnpm --filter @workspace/api-spec run codegen` and **must not be manually edited**:

- `lib/api-zod/src/generated/` — Zod schemas + TypeScript types
- `lib/api-client-react/src/generated/` — React Query hooks + the typed query keys

If you need to change a request shape, response shape, or operation, edit `lib/api-spec/openapi.yaml` and rerun codegen. The build pipeline expects these files to match the spec.

## Deployment

The repo is a Replit Autoscale deployment (see `.replit`). Both artifacts are deployed:

- **api-server** runs as a Node service on port 8080, mounted at `/api`. Production starts with `node --enable-source-maps artifacts/api-server/dist/index.mjs`.
- **quran-tracker** is built to static files (`dist/public/`) and served with an SPA-style rewrite (`/* → /index.html`).

See [`deployment.md`](./deployment.md) for full details.
