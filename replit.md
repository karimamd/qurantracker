# Quran Memorization Tracker

## Overview

This project is a personal Quran memorization progress tracker designed to help users manage their memorization and revision effectively. It tracks revision progress across multiple granularities (Juz, Rob3/Part, Surah, Page) and incorporates a spaced repetition system based on quality ratings to suggest optimal due dates for review.

The primary purpose is to provide a comprehensive tool for individuals to monitor, plan, and practice their Quran memorization journey, ensuring retention through scientifically backed revision schedules. Key capabilities include multi-grain progress visualization, quality-based spaced repetition, scope management for memorization, and an interactive Quran Reader practice mode. The long-term vision is to become the leading digital companion for Quran memorization, leveraging technology to make the process more accessible and sustainable for learners worldwide.

## User Preferences

I want iterative development.
Ask before making major changes.

## System Architecture

The project is structured as a monorepo utilizing `pnpm workspaces`.

### UI/UX Decisions

The frontend is built with `React`, `Vite`, `Tailwind CSS`, and `shadcn/ui`, ensuring a modern, responsive, and aesthetically pleasing user interface.
- **Color-coded status**: Overdue (red), Due Soon (amber), On Track (green), Not Started (blue) for intuitive progress visualization.
- **Quran Reader practice mode**: Features a "Hide all ayahs" toggle, "Show next ayah" button, and inline ✓/✗ buttons for interactive self-recitation practice.
- **Unified PageRow Component**: Juz detail, Surah detail, and Homework detail all render a consistent rich page card (`components/page-row.tsx`) for a cohesive user experience. This component displays status, page label, quality badges, first ayah preview, last-recited timestamp, and quality buttons.

### Technical Implementations

- **Backend**: `Express 5` serves as the API framework.
- **Database**: `PostgreSQL` managed with `Drizzle ORM` for robust data persistence.
- **Validation**: `Zod` and `drizzle-zod` are used for data validation across the stack.
- **API Codegen**: `Orval` generates API hooks and Zod schemas from an OpenAPI specification, ensuring type safety and consistency between frontend and backend.
- **Build System**: `esbuild` is used for efficient CJS bundle creation.
- **Routing**: `wouter 3` with `regexparam 3` for client-side routing. An `ErrorBoundary` is implemented for graceful error handling.

### Feature Specifications

- **Multi-grain Progress Tracking**: Users can view progress at Juz (30), Rob3/Part (8 per Juz), Surah (114), and Page (604) levels.
- **Quality-based Spaced Repetition**: Configurable review intervals based on recitation quality: Excellent (30d), Good (14d), Hard (7d), Relearn (3d).
- **Scope Management**: Users can add or remove specific pages from their memorization scope.
- **Batch Recitation Recording**: Allows users to record recitation quality for a range of pages simultaneously.
- **Quran Reader**: A dedicated reader at `/reader` (and `/reader/:page`) displays Uthmani text one page at a time. Page text is resolved through a layered fallback chain: (1) per-page IndexedDB cache, (2) bundled local dump shipped at `artifacts/quran-tracker/public/quran-dump.json` (all 604 pages, ~2 MB, generated once and committed), (3) `api.alquran.cloud` as a last-resort fallback. The bundled dump means a self-hosted fork works with **zero external API dependency**; the remote API is only used to backfill the local dump or rescue a missing page. Regenerate the dump via `pnpm --filter @workspace/scripts run build-quran-dump`. The first-mount session prefetcher loads the dump once and seeds IndexedDB in idle chunks instead of issuing 604 individual network requests. Includes navigation, surah jump functionality, and inline quality marking. Supports a `?practice=<globalAyahNumber>` query param that auto-enters hide-mode with the target ayah hidden and scrolls it into view. In Show-all view, clicking an ayah toggles a selection highlight that reveals the same per-ayah mark buttons (clear / mistake / link) as hide-mode; clicking it again deselects.
- **Persistent Quran text cache (IndexedDB)**: Page-ayah responses from `api.alquran.cloud` are cached forever in IndexedDB via `idb-keyval` (`src/lib/quran-page-cache.ts`, key prefix `quran-page-v1:`). `fetchPageAyahs` is read-through: serve from IDB if present, otherwise hit the API and write back. React Query options for these queries use `staleTime: Infinity, gcTime: Infinity` since Quran text is immutable. On first mount of `ProtectedApp` per session, `usePrefetchAllPages` (`src/hooks/use-prefetch-all-pages.ts`) walks all 604 pages with concurrency 2 on `requestIdleCallback`, populating both the IDB cache and the in-memory React Query cache so subsequent reader navigation is instant and works fully offline. Bump `CACHE_VERSION` in `quran-page-cache.ts` whenever ayah post-processing rules change; old entries are purged via `purgeStaleCacheVersions`.
- **Per-ayah Mistake Tracking**: In Reader hide-mode, each visible ayah has three controls — clear (✓), memorization mistake (✗), and link mistake (chain icon, indicating failure to predict this ayah from the previous one). Memorization and link are independent dimensions: both can coexist on the same ayah and toggle independently. Both are submitted with the next quality rating to PATCH `/api/progress/pages/:pageNumber` via the `ayahMistakes[]` array and persisted in the `ayah_mistakes` table.
- **Mistakes Page** (`/mistakes`): Analytics view with summary cards (total, memorization count, link count, unique pages affected), a type filter, and a date-grouped list of mistakes. Each row has a "Practice" button that links to `/reader/<page>?practice=<globalAyahNumber>` to immediately retest the ayah in hide-mode.
- **Rub' (Parts) Tab**: Lists all 240 Rub' al-Hizb with search, progress stats, and inline quality pickers. Marking a part applies the quality to all its constituent pages via `POST /progress/recite-batch`.
- **Aggregate Quality (Rub'/Juz/Surah)**: Derived on the fly from the average mistake count across in-scope pages with a recorded quality. Each page's mistake-equivalent is `page.mistakes` if set, otherwise the canonical mapping `excellent=0, good=2, hard=6, relearn=10`. The average is mapped back to a quality by ceiling: `avg=0→excellent`, `0<avg≤2→good`, `2<avg≤6→hard`, `avg>6→relearn`. Implemented in `lib/progress-helpers.ts::aggregateQuality` and used by all four list/detail aggregation sites in `routes/progress.ts`.
- **Auto-downgrade for overdue pages (display-only)**: Every page returned by the API includes `effectiveQuality` and `qualityDowngrades` alongside `quality`. `enrichPageProgress` calls `computeEffectiveQuality(quality, daysOverdue)` to drop the displayed rung one level per full 14 days overdue (excellent→good→hard→relearn, capped). Stored `quality`, `recitation_log`, `dueDate`, and `status` are NEVER mutated. The frontend `QualityBadge` renders the effective rating in a faded+dashed palette with one ↓ chevron per downgrade period (max 3) and a tooltip explaining the original rating. Aggregate counts (`excellentCount`/`goodCount`/`hardCount`/`relearnCount` in overview) and Juz/Surah/Rub' average quality continue to use the stored `quality`.
- **Internationalization (English + Arabic)**: `react-i18next` setup in `src/i18n/`. `setLanguage()` switches the locale and toggles `<html dir>` for RTL. Both `en.json` and `ar.json` must be kept in sync; Arabic uses pluralized keys (`_zero`/`_one`/`_two`/`_few`/`_many`/`_other`). Use Tailwind logical-property utilities (`ms-*`, `me-*`, `text-end`) so layouts mirror cleanly. Test ids stay in English for harness stability.
- **Rub Boundary Overlap**: Adjacent Rubs share their boundary page (since Rubs typically meet mid-page). `getRob3Range` sets `endPage = next.page` (not `next.page - 1`), so e.g. Rub 1 = pages 1–5, Rub 2 = pages 5–7. Backend Rub aggregations filter by page-range overlap so a boundary page is counted in both adjacent Rubs. `getRob3ForPage` keeps a single canonical Rub per page (the later one) for storage/labeling.
- **First Ayah of Rub Display**: `<Rob3FirstAyahPreview rob3Number={n}/>` shows the Arabic ayah at the START of each Rub (not start of page) on the Rub list, Juz detail Parts cards, and Homework Part dropdown. Lazy-loaded via IntersectionObserver, reuses `usePageAyahs` cache.

### Repository documentation

- Top-level [`README.md`](./README.md) at the repo root is the contributor-facing entry point and links into [`docs/`](./docs/README.md).
- [`LICENSE`](./LICENSE) is MIT.
- The full doc set lives in `docs/` (architecture, business-logic, data-flow, database, api, components, auth, development, deployment, contributing). Update the relevant doc whenever shipping a feature; touching `replit.md` is required for anything architecturally significant.

### Deferred / Next Up

- **Telawa (read-only) feature** — answers gathered from user:
  1. Recurring Telawa homework: round-robin sequential rotation across all 604 pages, default 5 pages/day (user-configurable). When the cycle reaches page 604, it loops back to page 1.
  2. Telawa marking: a single "Read" button (no quality grading).
  3. Telawa never adds the page to memorization scope and never updates memorization due dates.
  4. Telawa stats are tracked SEPARATELY from memorization (own card/chart, not combined into the memorization daily activity chart or week badges).
- **Khatmah (Telawa cycles)**: Each Telawa cycle is modeled as a `telawa_khatmah` row (`start_page`, `cycle_number`, `started_at`, `completed_at`). Every `telawa_log` row carries a nullable `khatmah_id` (nullable for backfill safety). The Telawa cursor is computed as `((startPage - 1 + readsInKhatmah) % 604) + 1`, so users can begin a new full-Quran rotation from any chosen page. When `readsInKhatmah` hits 604 the active Khatmah is auto-closed and a successor is opened with the same `start_page`; undo of the 604th read reopens it and deletes the empty rollover. `POST /telawa/khatmah` lets the user start a new Khatmah at any page (in-place retarget if the active one has 0 reads, otherwise close + open). Pre-Khatmah users are backfilled lazily on first request: existing logs are grouped by `cycle_number`, one Khatmah is inserted per group with `start_page=1`, and only the latest non-full cycle stays open. All Telawa write paths run inside a per-user `pg_advisory_xact_lock` (namespace `0x746c7761`).
- **Homework Tracking**: Enables creation of bi-weekly sessions with memorization and revision pages, including intelligent dropdown filtering for Surah and Part selection.
- **Activity Feed**: Displays recent recitation history.
- **Streak Counter**: Tracks consecutive days of revision.
- **Due Pages Dashboard**: Highlights pages requiring attention, sorted by due date.
- **Daily Recitation Chart**: Visualizes distinct pages recited per day over the last 30 days.
- **Progress over Time Chart**: A dual y-axis line chart showing overdue count and distinct pages recited daily to track momentum.
- **Undo Recitation**: Allows users to undo a recorded recitation, which restores page progress from the most recent remaining log entry. The page's `due_date` is restored **verbatim** from a snapshot stored on each `recitation_log` row at write time — so changing the interval settings between recitations does not perturb the restored due date on undo. All three log insert sites (single PATCH, recite-batch, and homework completion) populate `recitation_log.due_date`. Legacy log rows written before this column existed have `due_date = NULL` and fall back to recomputing from current settings. Protected by `SELECT ... FOR UPDATE` on the page row to serialize concurrent writes.
- **Guest Mode**: The application is fully functional without user sign-up. Guest data is migrated to a Clerk user profile upon sign-up.

### System Design Choices

- **Auth**: `Clerk` is integrated for authentication (`@clerk/react` on web, `@clerk/express` on server). Guest mode allows unauthenticated usage with an `httpOnly guest_id` cookie, which is auto-migrated upon user sign-up. All API queries are filtered by `req.userId`.
- **Database Schema**: Tables include `settings`, `page_progress`, `recitation_log`, `homework_sessions`, and `homework_items`, all designed to support multi-tenancy via a `user_id` column.
- **Quran Reference Data**: Static JSON mappings for Juz, Surah, and Rub' al-Hizb boundaries are used consistently on both client and server for accurate page-to-reference and reference-to-page calculations.

## External Dependencies

- **API**: `api.alquran.cloud` for Quranic text data (Uthmani script) and `hizbQuarter` endpoint for Rub' al-Hizb boundaries.
- **Authentication**: `Clerk` (`@clerk/react`, `@clerk/express`) for user authentication and management.
- **Database**: `PostgreSQL`
- **ORM**: `Drizzle ORM`
- **Frontend Framework**: `React`
- **Build Tool**: `Vite`
- **Styling**: `Tailwind CSS`, `shadcn/ui`
- **Validation Library**: `Zod`