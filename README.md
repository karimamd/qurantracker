# Quran Memorization Tracker

A personal Quran memorization companion — track revision across Juz, Rub', Surah, and Page; record per-ayah mistakes; assign homework; review on a quality-based spaced-repetition schedule; practice in an interactive Reader.

**Live app:** https://qurantracker.replit.app

> ⚠️ **Replit-native project.** This repo is shaped around Replit's workflows, secrets, shared proxy, and Autoscale deploys. You can run it elsewhere, but every "just works on Replit" affordance (path-based routing, auto-provisioned Postgres, secrets pane) needs a manual equivalent. See [`docs/development.md`](./docs/development.md) for the local-dev escape hatch.

## At a glance

- **Stack:** React 19 + Vite + Tailwind 4 + shadcn/ui (frontend) · Express 5 + Drizzle ORM + PostgreSQL 16 (backend) · Clerk (auth, with first-class guest mode) · OpenAPI + Orval (contract-first codegen) · pnpm workspaces.
- **i18n:** English + Arabic (RTL), via `react-i18next`.
- **Three artifacts:** `artifacts/quran-tracker` (SPA), `artifacts/api-server` (REST API), `artifacts/mockup-sandbox` (component prototyping, dev-only).
- **Four shared libs:** `lib/api-spec` (OpenAPI source of truth), `lib/api-zod` (generated Zod schemas), `lib/api-client-react` (generated React Query hooks), `lib/db` (Drizzle schema + client).

## Documentation

All long-form docs live under [`docs/`](./docs/README.md). Start with the map:

| Doc | Read this if you want to… |
| --- | --- |
| [Architecture](./docs/architecture.md) | Understand the monorepo layout and runtime topology. |
| [Business Logic](./docs/business-logic.md) | Understand the *what* — grains, spaced repetition, scope, streak, homework, **auto-downgrade**, ayah mistakes, guest mode. |
| [Data Flow](./docs/data-flow.md) | Trace a request end-to-end across the stack. |
| [Database](./docs/database.md) | Tables, columns, indexes, multi-tenant isolation. |
| [API Reference](./docs/api.md) | Endpoints, request/response shapes, generated-hook usage. |
| [Components](./docs/components.md) | Pages, reusable components, i18n, UI conventions. |
| [Authentication](./docs/auth.md) | Clerk + guest cookies, the migration path, `req.userId`. |
| [Development Setup](./docs/development.md) | Get the app running. |
| [Deployment](./docs/deployment.md) | How prod is built, hosted, and rolled back. |
| [Contributing](./docs/contributing.md) | End-to-end checklist for landing a change. |

For agent-only operational notes, see [`replit.md`](./replit.md).

## Quick start (Replit)

1. Click "Run" — the three workflows (`artifacts/quran-tracker: web`, `artifacts/api-server: API Server`, `artifacts/mockup-sandbox: Component Preview Server`) start automatically.
2. Open the preview pane.
3. Sign in via Clerk **or** click "Try it now — no sign up" to use guest mode. Guest data migrates into your Clerk account on first sign-in.

For local (non-Replit) setup, env vars, codegen, and DB push, follow [`docs/development.md`](./docs/development.md).

## Conventions you'll bump into immediately

1. **Never edit generated files.** Anything under `lib/api-zod/src/generated/` or `lib/api-client-react/src/generated/` is rewritten by `pnpm --filter @workspace/api-spec run codegen`.
2. **Never `console.log` on the server.** Use `req.log` in route handlers and the `logger` singleton elsewhere — pino structured output.
3. **Always filter Drizzle queries by `req.userId`.** This is the only thing standing between users' data.
4. **Don't run `pnpm dev` at the repo root.** Each artifact runs via its own workflow with the `PORT`/`BASE_PATH` env vars wired up.
5. **Path-based routing through a single proxy.** `/api/*` → API server, `/*` → SPA. Never call service ports directly.
6. **i18n.** Every user-facing string goes in both `artifacts/quran-tracker/src/i18n/en.json` and `ar.json`. Arabic uses pluralized keys (`_zero`/`_one`/`_two`/`_few`/`_many`/`_other`).

## Contributing

Bug reports, focused PRs, and doc improvements are welcome. The end-to-end checklist (OpenAPI → codegen → DB → server → client → test → docs) lives in [`docs/contributing.md`](./docs/contributing.md). For non-trivial changes, open an issue first.

## License

See [`LICENSE`](./LICENSE).
