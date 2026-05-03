# Quran Memorization Tracker — Documentation

A personal Quran memorization progress tracker built as a pnpm monorepo. Tracks revision across multiple grains (Juz, Rub', Surah, Page) using quality-based spaced repetition, with homework sessions, per-ayah mistake tracking, an interactive Quran Reader, and a parallel **Telawa (read-through)** rotation. Bilingual (English + Arabic / RTL).

**Live app:** https://qurantracker.replit.app

## Documentation Map

Start here, then jump into the area you care about.

| Doc | Read this if you want to… |
| --- | --- |
| [Architecture](./architecture.md) | Understand the monorepo layout, the runtime topology, and how the pieces fit together. |
| [Business Logic & Domain](./business-logic.md) | Understand the *what* — Juz/Surah/Page/Ayah grains, the spaced-repetition formula, scope/streak/homework rules, and the path to ayah-level tracking. |
| [Data Flow](./data-flow.md) | Trace a request end-to-end (UI → React Query hook → Express route → Drizzle → Postgres) and see how spaced repetition is computed. |
| [Database](./database.md) | Browse the tables, columns, indexes, and how multi-tenant isolation works. |
| [API Reference](./api.md) | Look up an endpoint, its request/response schema, and how to call it from the generated client. |
| [Components](./components.md) | Find your way around the React frontend — pages, reusable components, and UI conventions. |
| [Authentication](./auth.md) | Understand how Clerk is wired into both the frontend and backend, and how `req.userId` is enforced. |
| [Development Setup](./development.md) | Get the app running locally on Replit. |
| [Deployment](./deployment.md) | Understand how the app is built, hosted, and how production differs from development. |
| [Contributing](./contributing.md) | Add a feature, propose a change, or fix a bug end-to-end. |

## Quick orientation

- **Stack:** React 19 + Vite + Tailwind 4 + shadcn/ui (frontend) · Express 5 + Drizzle ORM + PostgreSQL 16 (backend) · Clerk (auth, with first-class guest mode) · OpenAPI + Orval (contract-first codegen) · pnpm workspaces.
- **i18n:** English + Arabic (RTL) via `react-i18next` — see [Components → Internationalization](./components.md#internationalization-i18n).
- **Three artifacts:** `artifacts/quran-tracker` (web app), `artifacts/api-server` (REST API), `artifacts/mockup-sandbox` (component preview tool, dev-only).
- **Four shared libraries:** `lib/api-spec` (OpenAPI source of truth), `lib/api-zod` (generated Zod schemas), `lib/api-client-react` (generated React Query hooks), `lib/db` (Drizzle schema + db client).
- **Contract-first:** the OpenAPI spec at `lib/api-spec/openapi.yaml` is the single source of truth. Backend uses generated Zod schemas to validate; frontend uses generated React Query hooks to call.

## Code organization at a glance

```text
.
├── artifacts/
│   ├── api-server/         # Express 5 REST API, port 8080, mounted at /api
│   ├── quran-tracker/      # React + Vite SPA, port 20353, mounted at /
│   └── mockup-sandbox/     # Vite component-preview server (dev tooling)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-zod/            # Generated Zod schemas (request/response)
│   ├── api-client-react/   # Generated React Query hooks + custom fetch
│   └── db/                 # Drizzle schema, client, and migrations driver
├── scripts/                # Workspace utility scripts
├── docs/                   # You are here
├── pnpm-workspace.yaml     # Workspace package discovery + dependency catalog
├── tsconfig.base.json      # Shared strict TS defaults
└── tsconfig.json           # Solution config — composite libs only
```

## Conventions worth knowing up front

1. **Never edit generated files.** Anything under `lib/api-zod/src/generated/` or `lib/api-client-react/src/generated/` is overwritten on `pnpm --filter @workspace/api-spec run codegen`. Edit `lib/api-spec/openapi.yaml` and regenerate.
2. **Never use `console.log` on the server.** Use `req.log` inside route handlers and the `logger` singleton elsewhere — it produces structured pino logs.
3. **Every API route is auth-scoped.** All queries must filter by `req.userId`. The `requireAuth` middleware enforces 401 and attaches `req.userId`.
4. **Don't run `pnpm dev` at the repo root.** Each artifact has its own dev script wired up to a workflow with the correct `PORT`/`BASE_PATH` env vars.
5. **Path-based routing through a shared proxy.** Both artifacts are reachable at `localhost:80` (the proxy) — `/api/...` hits the API, everything else hits the SPA. Never call service ports directly.

## License

MIT — see [`LICENSE`](../LICENSE) at the repo root. Contributions are welcome; start with [`contributing.md`](./contributing.md).
