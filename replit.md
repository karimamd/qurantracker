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
- **Homework tracking**: Create bi-weekly sessions with memorize/revise pages. Create dialog includes Surah and Part dropdowns next to each input — selecting appends the page range (Surah shows arabic name + range; Part is grouped by Juz and shows "Part N/8 · p. start–end" with the first ayah snippet from `page-names.json`).
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
- Client: `App.tsx` wraps the app in `<ClerkProvider>` (shadcn theme + brand variables). Routing uses wouter — `HomeRedirect` and `ProtectedApp` use `useAuth()` to gate signed-in vs signed-out (showing a small loading spinner during the auth-loading window). Sign-in/Sign-up rendered via `<SignIn />` / `<SignUp />` at `/sign-in` and `/sign-up` using wouter's `nest` modifier so Clerk's nested verification subpaths work.

## Routing Notes (wouter 3 + regexparam 3)

- The outer catch-all route in `App.tsx` MUST use `path="*"`. **Do not use `path="/:rest*"`** — wouter 3 uses regexparam 3, which treats `:rest*` as a parameter literally named `rest*` (asterisk is part of the name, not a wildcard quantifier). That makes the pattern only match single-segment paths like `/dashboard`, breaking every multi-segment route (`/juz/1`, `/surah/2`, `/homework/7`) and producing a blank screen.
- Sign-in/Sign-up routes use the `nest` modifier (`<Route path="/sign-in" nest component={SignInPage} />`) so Clerk's internal subpaths (verification, reset, etc.) match.
- A regression test guards this: `pnpm --filter @workspace/scripts run test-routes` verifies the regexparam semantics. Run it before deploying any route changes.
- An `ErrorBoundary` (`src/components/error-boundary.tsx`) wraps both the outer Switch (catches Layout/auth errors) and the inner Switch (catches per-page render errors). Stack details are gated to `import.meta.env.DEV` so production users see only a friendly recovery screen.
- Orphan claim: on first authenticated request after server boot, any rows with `user_id IS NULL` (pre-auth dev data) are reassigned to that user. One-shot per process — see `requireAuth.ts` for the rationale.

## Undo Recitation

- Each row in the dashboard's "Recent Activity" card has an undo icon (`undo-activity-{id}`). Clicking opens a confirmation dialog (`undo-confirm-dialog`).
- Confirming calls `DELETE /api/progress/activity/{id}` (`useUndoRecitation`) which:
  1. Acquires a `SELECT ... FOR UPDATE` lock on the affected `page_progress` row in a transaction (serializes concurrent undos / undo-vs-new-recitation races for the same page).
  2. Deletes the `recitation_log` row.
  3. Recomputes `last_recited`, `due_date`, `quality`, `mistakes` on `page_progress` from the most-recent remaining log for that page (or clears them if none remain). `in_scope` is preserved.
  4. Recomputes `homework_items.completed` for that page across all active homework sessions (positive remaining log → completed; otherwise → not completed). Mirrors `/recite-batch`'s derivation.
- Due-date policy: undo uses the user's *current* settings to recompute, so the restored due-date may differ from what it was when the prior log was first written. This matches how new recitations are dated.
- Client invalidates: `getRecentActivity`, `getProgressOverview`, `listPageProgress`, `listJuzProgress`, `listSurahProgress`, daily/progress charts, plus a predicate-based invalidation matching any open juz/surah detail key.

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
