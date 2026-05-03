# Quran Memorization Tracker

## Overview

This project is a personal Quran memorization progress tracker designed to help users manage their memorization and revision effectively. It tracks revision progress across multiple granularities (Juz, Rob3/Part, Surah, Page) and incorporates a spaced repetition system based on quality ratings to suggest optimal due dates for review.

The primary purpose is to provide a comprehensive tool for individuals to monitor, plan, and practice their Quran memorization journey, ensuring retention through scientifically backed revision schedules. The long-term vision is to become the leading digital companion for Quran memorization, leveraging technology to make the process more accessible and sustainable for learners worldwide.

## User Preferences

I want iterative development.
Ask before making major changes.

## System Architecture

The project is structured as a monorepo utilizing `pnpm workspaces`.

### UI/UX Decisions

The frontend is built with `React`, `Vite`, `Tailwind CSS`, and `shadcn/ui`, ensuring a modern, responsive, and aesthetically pleasing user interface. Key UI elements include color-coded status indicators (Overdue, Due Soon, On Track, Not Started) and a Quran Reader practice mode with interactive features like "Hide all ayahs" and inline quality marking.

### Technical Implementations

- **Backend**: `Express 5` serves as the API framework.
- **Database**: `PostgreSQL` managed with `Drizzle ORM`.
- **Validation**: `Zod` and `drizzle-zod` for data validation.
- **API Codegen**: `Orval` generates API hooks and Zod schemas from an OpenAPI specification.
- **Build System**: `esbuild` for efficient CJS bundle creation.
- **Routing**: `wouter 3` with `regexparam 3` for client-side routing, including an `ErrorBoundary`.

### Feature Specifications

- **Multi-grain Progress Tracking**: Tracks progress at Juz, Rob3/Part, Surah, and Page levels.
- **Quality-based Spaced Repetition**: Configurable review intervals based on recitation quality (Excellent, Good, Hard, Relearn).
- **Scope Management**: Users can add or remove pages from their memorization scope.
- **Batch Recitation Recording**: Allows recording recitation quality for a range of pages simultaneously.
- **Quran Reader**: Displays Uthmani text one page at a time with layered fallback for text resolution (IndexedDB, bundled dump, external API). Includes practice mode, navigation, and inline quality marking.
- **Persistent Quran text cache**: IndexedDB for caching Quran text, tafsir, and word-by-word data, ensuring offline-first functionality.
- **Per-ayah Mistake Tracking**: Tracks memorization and link mistakes at the ayah level, persisting them for later review.
- **Mistakes Page**: Analytics view for tracking and practicing mistakes.
- **Rub' (Parts) Tab**: Lists all 240 Rub' al-Hizb with search, progress stats, and inline quality pickers.
- **Aggregate Quality**: Dynamically derived quality for Rub', Juz, and Surah based on average mistake count.
- **Auto-downgrade for overdue pages**: Visual display of effective quality degradation for overdue pages without altering stored data.
- **Internationalization**: Support for English and Arabic using `react-i18next`.
- **Telawa (recurring read-through)**: A separate track for reading the Quran, independent of memorization progress.
- **Khatmah (Telawa cycles)**: Manages read-through cycles with customizable daily page goals and progress tracking.
- **Per-page Active Mistakes**: A queue of unresolved ayah mistakes persisting across sessions until explicitly cleared.
- **Homework Tracking**: Bi-weekly sessions for memorization and revision.
- **Activity Feed**: Recent recitation history on the dashboard with undo functionality.
- **Streak Counter**: Tracks consecutive days of revision.
- **Due Pages Dashboard**: Highlights pages requiring attention.
- **Daily Recitation Chart**: Visualizes distinct pages recited per day.
- **Progress over Time Chart**: Tracks overdue count and distinct pages recited daily.
- **Undo Recitation**: Restores previous `page_progress` state.
- **Guest Mode**: Full functionality without sign-up, with data migration to a Clerk profile upon registration.
- **Welcome / Onboarding Tour**: Interactive tour for new users and public visitors.
- **Personal preferences (Settings page)**: Configurable settings for language (en/ar), Telawa pages per day (1–604), `readerFontSize` (14–64 px) for the Mushaf page in the Reader, and `ayahViewFontSize` (14–96 px) for the single-ayah view at `/ayahs/:n`. The in-page +/- font controls on **both** the Reader and the Ayah detail screen write back to these same fields (debounced 400 ms, flushed on unmount) so a tweak made anywhere becomes the new saved default everywhere. Out-of-range values are silently dropped from the PATCH payload so a partial save never 400s the entire form.
- **Auto-assign page recitation from per-ayah marks**: Default-OFF toggle (`settings.autoAssignPageFromAyahs`) that, when enabled, automatically records a page-level `recitation_log` row whenever every ayah on a Mushaf page has been marked today (cleared or with mistakes). Total mistakes = sum of currently-active memorization|link rows (cleared contributes 0; each ayah is capped at one cleared XOR one memorization + one link, so max 2/ayah). The total maps to a quality via configurable inclusive thresholds: `excellent == 0`, `good ≤ mistakesGoodMax` (default 2), `hard ≤ mistakesHardMax` (default 6), else `relearn`. The helper (`lib/auto-assign-page.ts`) is invoked after both POST and DELETE active-mistake handlers commit, holds a per-user advisory lock, and is a no-op when today's most-recent recitation for the page already matches the computed quality (so toggling marks back and forth does not spam duplicate log rows). Page-to-ayah membership comes from a static `lib/page-ayahs.json` (604 entries, generated from the bundled quran-dump). All three new fields are in OpenAPI Settings/UpdateSettingsBody (0–100 bounds) and round-trip through backup import/export (optional on import for back-compat).
- **Arabic-mode WBW gloss hiding**: When `i18n.language === "ar"`, the per-word English gloss in `pages/ayah-detail.tsx` is hidden — no reliable Arabic per-word dataset exists in the upstream APIs (quran.com lacks Arabic WBW; alquran.cloud's "ar" editions are full ayahs in English). The Arabic word text itself still renders.
- **Configurable mobile bottom-tab bar**: `settings.bottomNavKeys` (Postgres `text[]`, OpenAPI enum array, max 5) drives which screens appear in the fixed bottom nav on mobile and in what order. The Settings page exposes a picker (add/remove + up/down reorder + reset). `Layout` consumes the field via `useGetSettings()` and a shared `resolveBottomNavKeys()` helper (`src/lib/bottom-nav.ts`) that drops unknown keys, dedupes, caps at 5, and falls back to the historical default five (homework, dashboard, telawa, reader, mistakes) so the bar never renders blank. Backups include the field; older backups without it inherit the DB default.
- **Per-ayah Tafsir & Word-by-Word**: Detail screen for ayahs including Tafsir Muyassar and Word-by-Word explanations, with offline-first caching.
- **Backup & Restore**: Self-serve JSON import/export of all user data.

### System Design Choices

- **Auth**: `Clerk` is integrated for authentication, supporting guest mode with auto-migration of data.
- **Database Schema**: Eight user-scoped tables for `settings`, `page_progress`, `recitation_log`, `ayah_mistakes`, `homework_sessions`, `homework_items`, `telawa_khatmah`, and `telawa_log`.
- **Quran Reference Data**: Static JSON mappings for Juz, Surah, and Rub' al-Hizb boundaries for consistent client/server calculations.
- **Logging**: Server uses `pino-http` for structured logging.

## External Dependencies

- **API**: `api.alquran.cloud` (for Quranic text and Rub' al-Hizb boundaries), `api.quran.com` (for Word-by-Word data).
- **Authentication**: `Clerk` (`@clerk/react`, `@clerk/express`).
- **Database**: `PostgreSQL`.
- **ORM**: `Drizzle ORM`.
- **Frontend Framework**: `React`.
- **Build Tool**: `Vite`.
- **Styling**: `Tailwind CSS`, `shadcn/ui`.
- **Validation Library**: `Zod`.