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

## Key Features

- **Multi-grain progress tracking**: View progress at Juz (30), Rob3/Part (8 per Juz), Surah (114), and Page (604) level
- **Quality-based spaced repetition**: Excellent (30d), Good (14d), Hard (7d), Relearn (3d) - all configurable
- **Color-coded status**: Overdue (red), Due Soon (amber), On Track (green), Not Started (blue)
- **Scope management**: Add/remove pages from memorization scope
- **Batch recitation recording**: Record quality for page ranges
- **Homework tracking**: Create bi-weekly sessions with memorize/revise pages
- **Activity feed**: Recent recitation history
- **Streak counter**: Track consecutive days of revision

## Database Tables

- `settings` - configurable review interval days per quality level
- `page_progress` - per-page tracking (scope, quality, mistakes, last recited, due date)
- `recitation_log` - history of all recitations for activity feed
- `homework_sessions` - homework assignments with due dates
- `homework_items` - individual pages within homework sessions

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Quran Reference Data

Static mapping in `artifacts/api-server/src/lib/quran-data.ts`:
- Juz page ranges (30 juz)
- Surah info (114 surahs with Arabic names, page ranges)
- Helper functions for page-to-juz, page-to-rob3, page-to-surah mapping

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
