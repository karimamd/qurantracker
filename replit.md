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

- **Telawa (recurring read-through)** at `/telawa`: A separate, parallel track to memorization for users who want to *read* the Quran on a rotation rather than memorize it. One-tap "Read" button (no quality grading), default 5 pages/day (user-configurable globally and per-Khatmah). Telawa never affects memorization scope, due dates, streak, or charts — its stats live in their own card on the `/telawa` page (today's progress, total reads, current cycle, last-30-days bar chart).
- **Khatmah (Telawa cycles)**: Each full 604-page rotation is modeled as a `telawa_khatmah` row (`start_page`, `cycle_number`, `pages_per_day` nullable override, `started_at`, `completed_at`). Every `telawa_log` row carries a nullable `khatmah_id` (nullable for backfill safety). The cursor is `((startPage - 1 + readsInKhatmah) % 604) + 1`, so users can begin a rotation from any chosen page. When `readsInKhatmah` hits 604 the active Khatmah is auto-closed and a successor is opened with the same `start_page`; undo of the 604th read reopens it and deletes the empty rollover. `POST /telawa/khatmah` starts a new Khatmah (in-place retarget if active has 0 reads, otherwise close + open) and accepts an optional `pagesPerDay`. `PATCH /telawa/khatmah/active` updates only the active Khatmah's daily goal, distinguishing `null` (clear override → fall back to settings) vs `undefined` (no-op). The frontend banner progress bar visually splits into "wrapped reads" + "skipped pages still pending" (amber) + "linear reads from startPage" + "remaining" so the cursor position is obvious; the counter shows `(skipped + reads) / 604` instead of `0 / 604`. Pre-Khatmah users are backfilled lazily on first request. All Telawa write paths run inside a per-user `pg_advisory_xact_lock` (namespace `0x746c7761`).
- **Per-page Active Mistakes (queue)**: Distinct from the append-only `ayah_mistakes` history, a page can carry an *active* (unresolved) mistake list maintained via `GET/POST/DELETE /progress/pages/:n/active-mistakes`. Same `ayah_mistakes` rows but with a nullable `resolved_at` column — a row is "active" while `resolved_at IS NULL`. `POST` is idempotent (re-applying a (surah, ayah, type) tuple is a no-op); `DELETE` sets `resolved_at = now()` instead of deleting. This powers the in-Reader badge dots that persist across sessions until the user explicitly clears them.
- **Homework Tracking**: Bi-weekly sessions with memorization and revision pages, including intelligent dropdown filtering for Surah and Part selection.
- **Activity Feed**: Recent recitation history on the dashboard, with per-row Undo.
- **Streak Counter**: Consecutive days of revision (today is a free pass; any quality counts; hard cap of 365).
- **Due Pages Dashboard**: Highlights pages requiring attention, sorted by due date.
- **Daily Recitation Chart**: Distinct pages recited per day over the last 30 days.
- **Progress over Time Chart**: Dual y-axis line chart showing overdue count and distinct pages recited daily.
- **Undo Recitation**: Restores `page_progress` from the most recent remaining log entry. The page's `due_date` is restored **verbatim** from a snapshot stored on each `recitation_log` row at write time — so changing interval settings between recitations does not perturb the restored due date on undo. All three log insert sites (single PATCH, recite-batch, and homework completion) populate `recitation_log.due_date`. Legacy log rows written before this column existed have `due_date = NULL` and fall back to recomputing from current settings. Protected by `SELECT ... FOR UPDATE` on the page row to serialize concurrent writes.
- **Guest Mode**: Fully functional without user sign-up. Guest data is migrated to a Clerk user profile upon sign-up.
- **Welcome / Onboarding Tour**: A long-form marketing-style walkthrough lives at `/` (public, signed-out viewers) and `/welcome` (in-app, reachable from the sidebar's "Tour" entry). Implemented as a single component (`pages/welcome.tsx`) that adapts its chrome via a `withAuthChrome` prop — the public variant shows the auth header and CTAs (Try as guest / Create account / Sign in); the in-app variant drops them and ends with a "Back to my dashboard" button. The page is built entirely from hand-coded inline mock UIs (Reader, Dashboard, Ayahs, Mistakes, Telawa, Pages list) instead of static screenshots so the visuals stay aligned with the live design tokens and flip cleanly into RTL when Arabic is selected. Every string — including surah names, time-ago labels, day initials, and status pills — flows through `welcome.*` i18n keys in both `en.json` and `ar.json`. CTAs use the `Button asChild` + `Link` pattern so each control is a single interactive element (no nested `<a><button>`).
- **Personal preferences (Settings page)**: Beyond the four spaced-repetition day buffers, the Settings page persists `language` (en/ar, mirrored to the i18n runtime by `LanguageSync`), `telawaPagesPerDay` (1–604), `readerFontSize` (14–64 px) for the Mushaf page in the Reader, and `ayahViewFontSize` (14–96 px) used as the default size when opening a single ayah on `/ayahs`. Out-of-range values are silently dropped from the PATCH payload so a partial save never 400s the entire form.
- **Backup & Restore (lightweight, no Drive)**: Self-serve JSON import/export available from the Settings page. `GET /api/backup/export` streams a `quran-tracker-backup-YYYY-MM-DD.json` attachment containing every user-owned row across all 8 tables (`settings`, `page_progress`, `recitation_log`, `ayah_mistakes`, `homework_sessions`, `homework_items`, `telawa_khatmah`, `telawa_log`) under a stable `version: 1` envelope. `POST /api/backup/import` validates the file with Zod, then atomically REPLACES every user-scoped row inside a single transaction (no merge — partial files would silently delete data). Server-managed ids are re-issued on insert; cross-table references that need to survive the round-trip (`homework_items.homeworkId → homework_sessions.id`, `telawa_log.khatmahId → telawa_khatmah.id`) are remapped from the export's old ids to the freshly issued ones. The Settings UI shows a confirmation `AlertDialog` before posting, then invalidates the entire React Query cache so every screen refetches against the restored rows. Works for both Clerk-signed-in users and guest accounts (cookie-scoped).

### Deferred / Next Up

- **Google Drive sync (deferred)**: A previous plan to sync backups to the user's Google Drive is on hold pending `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`. The lightweight JSON import/export above covers the same data round-trip without OAuth.

### System Design Choices

- **Auth**: `Clerk` is integrated for authentication (`@clerk/react` on web, `@clerk/express` on server). Guest mode allows unauthenticated usage with an `httpOnly guest_id` cookie, which is auto-migrated upon user sign-up. All API queries are filtered by `req.userId`.
- **Database Schema**: Eight user-scoped tables, each keyed by a `user_id text` column (Clerk id or `guest_<id>`):
  - `settings` — one row per user; preferences (day buffers, language, telawa pages-per-day, reader & ayah-view font sizes). Unique on `user_id`.
  - `page_progress` — current state per (user, page 1..604): scope, last quality, mistake count, last-recited timestamp, due date. Unique on `(user_id, page_number)`.
  - `recitation_log` — append-only history of every recitation. Carries a snapshotted `due_date` so the Undo flow can restore it verbatim even if the user later changes their day-buffer settings.
  - `ayah_mistakes` — per-ayah error log used by both the Mistakes page and the per-page active-mistakes queue. Resolution stamps `resolved_at` rather than deleting; reads filter on `resolved_at IS NULL`.
  - `homework_sessions` + `homework_items` — teacher-style assignments. Grading an item also writes to `page_progress` + `recitation_log` so progress dashboards stay in sync.
  - `telawa_khatmah` + `telawa_log` — the Khatmah header (one active per user) and the per-page read log. Cursor is computed by counting log rows in the active Khatmah; all writes run inside a per-user `pg_advisory_xact_lock`.
- **Quran Reference Data**: Static JSON mappings for Juz, Surah, and Rub' al-Hizb boundaries are used consistently on both client and server for accurate page-to-reference and reference-to-page calculations.
- **Logging**: Server uses `pino-http` with `req.log` in handlers and a singleton `logger` for non-request code (`artifacts/api-server/src/lib/logger.ts`). `console.log` is forbidden in server code per the pnpm-workspace conventions.

## External Dependencies

- **API**: `api.alquran.cloud` for Quranic text data (Uthmani script) and `hizbQuarter` endpoint for Rub' al-Hizb boundaries.
- **Authentication**: `Clerk` (`@clerk/react`, `@clerk/express`) for user authentication and management.
- **Database**: `PostgreSQL`
- **ORM**: `Drizzle ORM`
- **Frontend Framework**: `React`
- **Build Tool**: `Vite`
- **Styling**: `Tailwind CSS`, `shadcn/ui`
- **Validation Library**: `Zod`