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
- **Quran Reader**: A dedicated reader at `/reader` (and `/reader/:page`) displays Uthmani text one page at a time, fetched from `api.alquran.cloud` with caching and prefetching. Includes navigation, surah jump functionality, and inline quality marking. Supports a `?practice=<globalAyahNumber>` query param that auto-enters hide-mode with the target ayah hidden and scrolls it into view.
- **Per-ayah Mistake Tracking**: In Reader hide-mode, each visible ayah has three controls — clear (✓), memorization mistake (✗), and link mistake (chain icon, indicating failure to predict this ayah from the previous one). Memorization and link are independent dimensions: both can coexist on the same ayah and toggle independently. Both are submitted with the next quality rating to PATCH `/api/progress/pages/:pageNumber` via the `ayahMistakes[]` array and persisted in the `ayah_mistakes` table.
- **Mistakes Page** (`/mistakes`): Analytics view with summary cards (total, memorization count, link count, unique pages affected), a type filter, and a date-grouped list of mistakes. Each row has a "Practice" button that links to `/reader/<page>?practice=<globalAyahNumber>` to immediately retest the ayah in hide-mode.
- **Rub' (Parts) Tab**: Lists all 240 Rub' al-Hizb with search, progress stats, and inline quality pickers. Marking a part applies the quality to all its constituent pages.
- **Rub Boundary Overlap**: Adjacent Rubs share their boundary page (since Rubs typically meet mid-page). `getRob3Range` sets `endPage = next.page` (not `next.page - 1`), so e.g. Rub 1 = pages 1–5, Rub 2 = pages 5–7. Backend Rub aggregations filter by page-range overlap so a boundary page is counted in both adjacent Rubs. `getRob3ForPage` keeps a single canonical Rub per page (the later one) for storage/labeling.
- **First Ayah of Rub Display**: `<Rob3FirstAyahPreview rob3Number={n}/>` shows the Arabic ayah at the START of each Rub (not start of page) on the Rub list, Juz detail Parts cards, and Homework Part dropdown. Lazy-loaded via IntersectionObserver, reuses `usePageAyahs` cache.

### Deferred / Next Up

- **Telawa (read-only) feature** — answers gathered from user:
  1. Recurring Telawa homework: round-robin sequential rotation across all 604 pages, default 5 pages/day (user-configurable). When the cycle reaches page 604, it loops back to page 1.
  2. Telawa marking: a single "Read" button (no quality grading).
  3. Telawa never adds the page to memorization scope and never updates memorization due dates.
  4. Telawa stats are tracked SEPARATELY from memorization (own card/chart, not combined into the memorization daily activity chart or week badges).
- **Homework Tracking**: Enables creation of bi-weekly sessions with memorization and revision pages, including intelligent dropdown filtering for Surah and Part selection.
- **Activity Feed**: Displays recent recitation history.
- **Streak Counter**: Tracks consecutive days of revision.
- **Due Pages Dashboard**: Highlights pages requiring attention, sorted by due date.
- **Daily Recitation Chart**: Visualizes distinct pages recited per day over the last 30 days.
- **Progress over Time Chart**: A dual y-axis line chart showing overdue count and distinct pages recited daily to track momentum.
- **Undo Recitation**: Allows users to undo a recorded recitation, which triggers a recomputation of page progress based on the remaining recitation log entries. This process is protected by database locks to prevent race conditions.
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