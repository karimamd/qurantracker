# Quran Memorization Tracker

## Overview

A personal Quran memorization progress tracker. Tracks revision across multiple grains (Juz, Rob3/Part, Surah, Page) with spaced repetition due dates based on quality ratings.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Clerk (`@clerk/react` on web, `@clerk/express` on server) — Replit-managed, multi-tenant

## Key Features

- **Multi-grain progress tracking**: View progress at Juz (30), Rob3/Part (8 per Juz), Surah (114), and Page (604) level
- **Quality-based spaced repetition**: Excellent (30d), Good (14d), Hard (7d), Relearn (3d) - all configurable
- **Color-coded status**: Overdue (red), Due Soon (amber), On Track (green), Not Started (blue)
- **Scope management**: Add/remove pages from memorization scope
- **Batch recitation recording**: Record quality for page ranges
- **Homework tracking**: Create bi-weekly sessions with memorize/revise pages
- **Activity feed**: Recent recitation history
- **Streak counter**: Track consecutive days of revision
- **Due pages dashboard section**: Pages requiring attention (overdue + due soon) sorted by due date, shown above the chart
- **Daily recitation chart**: Bar chart of distinct pages recited per day over the last 30 days
- **Progress over time chart**: Dual y-axis line chart showing per-day overdue count (state at end of day) and distinct pages recited that day (per-day, not cumulative) — surfaces daily momentum needed to reduce overdue
- **Quick-rate quality buttons**: Reusable `PageQualityButtons` component (Excellent/Good/Hard/Relearn) used in the Pages list view, Juz detail tiles, and Surah detail tiles
- **Surah drill-down**: `/surah/:id` route shows per-page tiles for the selected surah with quick-rate buttons

## Database Tables

All user-facing tables include a nullable `user_id` column scoped to the Clerk session userId. Every API route is protected by `requireAuth` which sets `req.userId` and returns 401 to unauthenticated requests; all queries filter by `req.userId`.

- `settings` - configurable review interval days per quality level (unique per `user_id`)
- `page_progress` - per-page tracking (scope, quality, mistakes, last recited, due date) — composite unique on `(user_id, page_number)`
- `recitation_log` - history of all recitations for activity feed
- `homework_sessions` - homework assignments with due dates
- `homework_items` - individual pages within homework sessions

## Auth Notes

- Clerk publishable/secret keys are provisioned via Replit's `setupClerkWhitelabelAuth` — accessed in code through `VITE_CLERK_PUBLISHABLE_KEY` (client) and `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` (server). Do not hardcode.
- Server: `app.ts` mounts the Clerk proxy middleware before body parsers, then `clerkMiddleware`, then the API router (which uses `requireAuth`).
- Client: `App.tsx` wraps the app in `<ClerkProvider>` (shadcn theme + brand variables). Routing uses wouter — `HomeRedirect` and `ProtectedApp` use `useAuth()` to gate signed-in vs signed-out (showing a small loading spinner during the auth-loading window). Sign-in/Sign-up rendered via `<SignIn />` / `<SignUp />` at `/sign-in` and `/sign-up`.
- Orphan claim: on first authenticated request after server boot, any rows with `user_id IS NULL` (pre-auth dev data) are reassigned to that user. One-shot per process — see `requireAuth.ts` for the rationale.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec; then rebuild declarations with `pnpm --filter @workspace/api-zod exec tsc -p tsconfig.json && pnpm --filter @workspace/api-client-react exec tsc -p tsconfig.json`
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Quran Reference Data

Static mapping in `artifacts/api-server/src/lib/quran-data.ts`:
- Juz page ranges (30 juz)
- Surah info (114 surahs with Arabic names, page ranges)
- Helper functions for page-to-juz, page-to-rob3, page-to-surah mapping

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
