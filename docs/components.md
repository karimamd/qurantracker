# Frontend Components

The web app lives in `artifacts/quran-tracker/`. It's a React + Vite SPA styled with Tailwind and shadcn/ui, routed with `wouter`, and protected by Clerk.

## Top-level structure

```text
artifacts/quran-tracker/src/
├── main.tsx                   Vite entry — mounts <App /> into #root and imports ./i18n for side effects
├── App.tsx                    ClerkProvider + QueryClientProvider + Router + landing + protected routes
├── index.css                  Tailwind entry, custom CSS variables, RTL-aware utility tweaks
├── pages/                     Route components (one per top-level path)
├── components/
│   ├── layout.tsx             App shell: sidebar (desktop) + bottom nav (mobile) + UserButton + lang switcher
│   ├── error-boundary.tsx     React error boundary; production users see a friendly recovery screen
│   ├── page-label.tsx         "Page N · {default name}" with inline rename
│   ├── page-row.tsx           Unified rich page card used by Juz/Surah/Homework details
│   ├── page-quality-buttons.tsx Quick-rate Excellent/Good/Hard/Relearn buttons (reusable)
│   ├── quality-badge.tsx      Coloured badge for a quality, with optional auto-downgrade chevrons
│   ├── first-ayah-preview.tsx Lazy-loaded Arabic preview of a page or rub's first ayah
│   ├── onboarding-scope-setup.tsx Initial scope picker for new users
│   ├── guest-save-prompt.tsx  Banner nudging guests to sign up (data migrates automatically)
│   └── ui/                    shadcn/ui primitives (button, card, dialog, alert-dialog, ...)
├── hooks/
│   ├── use-mobile.tsx         Window-width breakpoint hook
│   └── use-toast.ts           shadcn toast bridge
├── i18n/
│   ├── index.ts               react-i18next init + setLanguage() + applyDocumentLanguage() (sets <html dir>)
│   ├── en.json                English strings (default)
│   └── ar.json                Arabic strings (RTL); uses pluralized keys (_zero/_one/_two/_few/_many/_other)
└── lib/
    ├── page-names.json        Default per-page names (surah + first-ayah snippet)
    ├── page-names.ts          Helpers for the JSON
    ├── quran-ref.ts           Page → Juz/Rob3/Surah lookups (mirrors server-side lib)
    ├── quality.ts             Quality enum + ladder + style maps shared by PageRow and badges
    └── utils.ts               cn() className helper
```

## Pages

All pages are registered inside `App.tsx`. The catch-all uses `path="*"` (wouter 3 / regexparam 3 — `path="/:rest*"` would silently break multi-segment routes; see `replit.md` for the gory details).

| Route | File | What it does |
| --- | --- | --- |
| `/` | landing or `dashboard.tsx` (signed in) | Marketing page when signed out; Dashboard when signed in. Includes "Try it now" guest CTA. |
| `/dashboard` | `dashboard.tsx` | Stat cards (with %), streak, due pages, daily chart, progress chart, quality breakdown, recent activity (with undo). |
| `/recite` | `recite.tsx` | Form to record a quality rating across a page range. |
| `/pages` | `page-list.tsx` | Filterable list of all pages — desktop table + mobile rows + grid view. Each row has quick-rate buttons. |
| `/juz` | `juz-list.tsx` | All 30 Juz tiles with aggregated progress. |
| `/juz/:id` | `juz-detail.tsx` | One Juz: 8 Rob3 sections + per-page tiles with quick-rate buttons. |
| `/surah` | `surah-list.tsx` | All 114 Surah cards. |
| `/surah/:id` | `surah-detail.tsx` | One Surah: per-page tiles with quick-rate buttons. |
| `/rob3` | `rob3-list.tsx` | All 240 Rub' al-Hizb with search, progress stats, and inline quality pickers (rates all pages in the rub via `/progress/recite-batch`). |
| `/reader`, `/reader/:page` | `reader.tsx` | Interactive Quran reader: Uthmani text from `api.alquran.cloud`, hide-mode practice, per-ayah mistake controls (✓ / ✗ memorization / 🔗 link), inline quality marking. Supports `?practice=<globalAyahNumber>` to jump straight to a target ayah. |
| `/mistakes` | `mistakes.tsx` | Analytics view of per-ayah mistakes: summary cards, type filter, date-grouped list. Each row has a "Practice" button that deep-links to the reader in hide-mode. |
| `/homework` | `homework-list.tsx` | List of homework sessions. |
| `/homework/:id` | `homework-detail.tsx` | Items inside a session, check-off UI. Renders the unified `<PageRow />`. |
| `/settings` | `settings-page.tsx` | Configure SR intervals (excellent/good/hard/relearn days) and language (English / العربية). |
| `/sign-in/*`, `/sign-up/*` | `App.tsx` inline | Clerk hosted-component sign-in / sign-up pages. |
| `*` (catch-all) | `not-found.tsx` | 404. |

## Reusable components in detail

### `Layout`

The app shell. Renders:

- A logo + nav sidebar on desktop, with the order **Dashboard → Homework → Pages → Juz → Surah → Recite → Settings**.
- A bottom nav bar on mobile with the same primary destinations.
- The Clerk `<UserButton />` for profile / sign-out.
- A `<main>` slot for the page content.

The nav order was deliberately chosen to make Homework prominent (the most-used feature day-to-day after Dashboard).

### `ErrorBoundary`

Wraps the outer `<Switch>` (catches Layout/auth errors) and the inner `<Switch>` (catches per-page render errors). Stack traces are gated to `import.meta.env.DEV` so production users only see a friendly recovery screen with a "Reload" button.

### `PageLabel`

Renders `Page {N} · {name}`. The name is the user's `customName` when set, otherwise a default surah-and-ayah snippet from `lib/page-names.json`. Clicking the pencil icon opens an inline edit input that calls `useUpdatePageName`.

### `PageQualityButtons`

The four-button group used everywhere a user records a quality:

- **Excellent** (emerald) — `excellentDays` interval (default 30)
- **Good** (sky) — `goodDays` (default 14)
- **Hard** (amber) — `hardDays` (default 7)
- **Relearn** (rose) — `relearnDays` (default 3)

Calls `useUpdatePageProgress` and accepts an `onSuccess` callback for additional cache invalidation. Used in the Pages list, Juz detail, Surah detail, and (indirectly) Recite.

### `QualityBadge`

A coloured pill that renders the quality label. Color scheme matches `PageQualityButtons`.

It also accepts two **optional** props — `effectiveQuality` and `qualityDowngrades` — that come from the API alongside `quality`. When `qualityDowngrades > 0`:

- the badge renders the **effective** quality (one rung lower per 14 days overdue), in a **faded + dashed-border** palette so it's clearly "computed, not recorded";
- one ↓ chevron per `qualityDowngrades` (max 3) is shown to the right of the label, hinting at the original rating;
- a tooltip + screen-reader label spells out the original/effective/weeks-overdue.

The rules behind this — and why the stored `quality` is never mutated — are in [Business Logic — Auto-downgrade](./business-logic.md#auto-downgrade-for-overdue-pages-display-only).

### `PageRow`

The unified rich page card used by Juz detail, Surah detail, the Homework detail page, and other "list of pages" surfaces. Renders status dot + page label + first-ayah preview + quality badge (with auto-downgrade arrows) + last-recited timestamp + quick-rate buttons. Pass `quality`, `effectiveQuality`, and `qualityDowngrades` from the enriched API response so the badge is correct.

### `OnboardingScopeSetup`

The first-run experience: a guided picker for choosing the user's initial memorization scope (Juz, Surah, or page range). Calls `POST /progress/scope`. Dismissible.

### `GuestSavePrompt`

Banner shown in guest mode reminding the user that their data will migrate automatically when they sign up. Dismissible per device.

### shadcn/ui (`components/ui/`)

Standard shadcn primitives used throughout: `button`, `card`, `dialog`, `alert-dialog`, `select`, `input`, `tooltip`, `tabs`, `badge`, `separator`, etc. These are local copies (not an npm dep) so they're trivial to customize.

## State management

- **Server state:** TanStack Query (React Query) via the generated hooks. The `QueryClient` is configured in `App.tsx`.
- **UI state:** local `useState` / `useReducer`. No Redux, no Zustand.
- **Auth state:** Clerk hooks (`useUser`, `useAuth`).
- **Form state:** mostly uncontrolled; for complex forms (recite, homework create) plain controlled state is used.

## Styling

- **Tailwind 4** with a custom theme defined in `index.css` (CSS variables for primary/accent colors).
- **Color semantics:**
  - Primary / In-Scope: teal/primary
  - Overdue: rose
  - Due Soon: amber
  - On Track: emerald
- **Mobile-first**: every page renders sensibly down to ~360px wide. The `useMobile` hook switches between desktop and mobile layouts where needed.
- **Iconography:** `lucide-react`.
- **Toasts:** shadcn/ui `useToast`.

## Adding a new page

1. Create `artifacts/quran-tracker/src/pages/my-page.tsx`. Export a default React component.
2. Register the route in `App.tsx`:
   ```tsx
   <Route path="/my-path" component={MyPage} />
   ```
3. If it should appear in the sidebar/bottom nav, add a nav entry in `components/layout.tsx`.
4. Use generated hooks (`@workspace/api-client-react`) for any data; do not handcraft `fetch` calls.
5. Add a `data-testid="my-page-page"` attribute to the root `<div>` so the testing harness can wait for the page to mount.

## Adding a new reusable component

1. Drop it in `artifacts/quran-tracker/src/components/`.
2. If it relies on a shadcn primitive that doesn't exist yet, add it to `components/ui/` (use the shadcn CLI or copy from the shadcn website).
3. Use Tailwind classes + the `cn()` helper from `lib/utils.ts`.
4. Add `data-testid` attributes for the major interactive elements so testing can target them.

## Internationalization (i18n)

The app ships with English (default) and Arabic. Everything user-facing goes through `react-i18next`.

```ts
import { useTranslation } from "react-i18next";

function Foo() {
  const { t } = useTranslation();
  return <button>{t("common.save")}</button>;
}
```

Setup lives in `artifacts/quran-tracker/src/i18n/index.ts`:

- Resources are bundled at build time from `en.json` and `ar.json`.
- `setLanguage("en" | "ar")` switches `i18next` and updates `<html lang>` + `<html dir>` (RTL flips when `ar` is selected). Tailwind's logical-property utilities (`me-*`, `ms-*`, `text-end`, `start-*`, `end-*`) are preferred over physical ones so layouts mirror cleanly.
- The choice is persisted to `localStorage` under `qurantracker.language` and re-applied on load.

When you add a new string:

1. Add the key to **both** `en.json` and `ar.json`. CI typecheck won't catch a missing key, but a missing translation will fall back to the key string at runtime, which is ugly.
2. For counts, use pluralized variants. English needs `_one` and `_other`; Arabic needs the full set (`_zero`, `_one`, `_two`, `_few`, `_many`, `_other`).
3. Use stable English values for `data-testid` so the testing harness works in either language.
4. If a string contains a number or name, use interpolation: `t("foo.bar", { count, name })`.

## Visual prototyping (mockup-sandbox)

When you want to iterate on a component visually without running it inside the full app, use the mockup-sandbox artifact (`artifacts/mockup-sandbox/`). It's a separate Vite server that serves each component at its own `/preview/<name>` URL — useful for trying design variants. See `.local/skills/mockup-sandbox/SKILL.md` for the workflow.
