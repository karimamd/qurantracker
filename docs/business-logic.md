# Business Logic & Domain Model

This guide explains the **what** and **why** behind the tracker, not just the wiring. Read this if you want to understand how the app models the Quran, the spaced-repetition rules, the streak/scope/homework semantics, or if you're planning to add a new grain (e.g. ayah-level tracking).

## 0. Identity model — guests and signed-in users

The app supports two kinds of identities, which are treated identically by the data layer:

1. **Clerk users** — `userId` looks like `user_xxx`. Created when someone signs up or signs in via Clerk.
2. **Guests** — `userId` looks like `guest_<32hex>`. Auto-issued as an httpOnly cookie by `requireAuth.ts` on the first API request from any unauthenticated visitor. No friction, no sign-up.

Every row in the user-scoped tables (`page_progress`, `recitation_log`, `homework_sessions`, `homework_items`, `settings`) has a `user_id` that is one of these two id shapes. Queries filter by `req.userId` regardless of which kind it is — the spaced-repetition logic, scope rules, homework rules, and streak rules all apply identically.

### "Try, then sign up" migration

When a guest signs up via Clerk, the FIRST signed-in request will see both:
- a Clerk session (`auth.userId = user_xxx`), and
- the still-present `guest_id` cookie.

`requireAuth.ts` then reassigns every row from the guest id to the Clerk id (5 tables, single Promise.all) and clears the cookie. From that point on the user has one consistent identity and all their guest-mode practice carries over. This is the design promise behind the Landing page copy "your guest data carries over automatically".

Guest cookies are per-device (httpOnly, 1-year). Two devices with no shared sign-up = two separate guest accounts. Signing up is the only way to merge them.

## 1. The Quran data model

### Source of the data

All Quran reference data is **bundled as static JSON/TypeScript** inside the repo. There is no external Quran API called at runtime — the app is fully offline-capable for its core data.

| File | Purpose |
| --- | --- |
| `artifacts/api-server/src/lib/quran-data.ts` | Server-side Juz / Rob3 / Surah catalog and lookups. |
| `artifacts/quran-tracker/src/lib/quran-ref.ts` | Frontend mirror of the same catalog. |
| `artifacts/api-server/src/lib/page-names.json` | 604 entries: per-page `{ surah, ayah, text }` — the first ayah text on each page. |
| `artifacts/quran-tracker/src/lib/page-names.json` | Identical copy for the frontend. |

The page-names data was introduced in commit `7be608d` ("Add custom names and display them for Quran pages"). The Juz/Surah ranges go back further to commit `7a9a267` ("Add Quran memorization tracking and revision features"), the very first Quran-domain commit.

> **Heads-up — duplicated data.** `quran-data.ts` (server) and `quran-ref.ts` (frontend) duplicate the same Juz/Surah constants by design: the codebase rule is that artifacts may not import from each other (only from `lib/*`). If a future PR needs to share this, a new `lib/quran-data` package would be the right move; for now any change to one file must be mirrored in the other. The same applies to the two `page-names.json` copies.

### Mushaf convention

The app follows the **Madinah Mushaf — 604 pages**. Constants:

```ts
TOTAL_PAGES = 604     // pages
TOTAL_JUZ   = 30      // juz (parts)
ROB3S_PER_JUZ = 8     // rob3s per juz
TOTAL_ROB3S = 240     // 30 × 8
```

If you ever add support for a different mushaf (Indo-Pak, Tajweed, etc.), every constant above and the per-page Juz/Surah maps would need to be re-derived, plus `page-names.json` regenerated.

### Grain hierarchy

```text
                  ┌───────────────────────────────────────────────────────┐
                  │                Quran (114 surahs)                     │
                  └────┬─────────────────────┬────────────────────────────┘
                       │                     │
                       │ partition by 30     │ partition by 114
                       │                     │
            ┌──────────▼─────────┐    ┌──────▼──────────┐
            │      Juz (30)      │    │   Surah (114)   │
            │ ~20 pages each     │    │ 1–48 pages each │
            │ (Juz 1=21, J30=23) │    │                 │
            └──────────┬─────────┘    └─────────────────┘
                       │
                       │ each Juz ÷ 8
                       │
            ┌──────────▼─────────┐
            │   Rob3 / Part      │
            │   (240 total)      │
            │   ≈ 2–3 pages each │
            └──────────┬─────────┘
                       │
                       │
            ┌──────────▼─────────┐
            │    Page (604)      │   ← TRACKING UNIT
            │  Madinah Mushaf    │      (page_progress.page_number)
            └──────────┬─────────┘
                       │
                       │ each page contains ~6–15 ayat
                       ▼
            ┌────────────────────┐
            │    Ayah (~6,236)   │   ← NOT YET A TRACKING UNIT
            │  surface metadata  │      (only first-ayah-of-page is stored,
            │  only              │       in page-names.json, used as a label)
            └────────────────────┘
```

### Grain details

#### Juz (30)

Encoded as `JUZ_PAGE_RANGES` (server) / `JUZ_RANGES` (client), e.g. `{ juz: 1, startPage: 1, endPage: 21 }`. Most Juz are 20 pages; **Juz 1 is 21 pages and Juz 30 is 23 pages** (which is why Rob3 width is computed per-Juz, not as a global constant).

`getJuzForPage(pageNumber)` is a linear scan of the table.

#### Rob3 / Part (240)

Each Juz is partitioned into 8 equal-width sections by **mathematical division**, not by traditional Hizb markings:

```ts
// artifacts/api-server/src/lib/quran-data.ts (mirrored on the client)
function getRob3Range(rob3Number) {
  const juzIndex = Math.floor((rob3Number - 1) / ROB3S_PER_JUZ);
  const rob3InJuz = (rob3Number - 1) % ROB3S_PER_JUZ;
  const juz = JUZ_PAGE_RANGES[juzIndex];
  const juzPages = juz.endPage - juz.startPage + 1;
  const pagesPerRob3 = juzPages / ROB3S_PER_JUZ;       // e.g. 20/8 = 2.5
  const startPage = juz.startPage + Math.floor(rob3InJuz * pagesPerRob3);
  const endPage = rob3InJuz === ROB3S_PER_JUZ - 1
    ? juz.endPage
    : juz.startPage + Math.floor((rob3InJuz + 1) * pagesPerRob3) - 1;
  return { startPage, endPage, juzNumber };
}
```

> **Caveat for future contributors.** This produces page-aligned approximations of the traditional Rob3 marks (which can fall mid-page in the printed Mushaf). For a tracker that operates at page granularity this is intentional and good enough; a pixel-accurate Rob3 boundary would require ayah-level data and a different storage model.

#### Surah (114)

Encoded as `SURAHS` with `{ number, name, arabicName, startPage, endPage }`.

**Surahs can share pages** (a page boundary case worth knowing about). For example:

- Page 49 contains the end of Al-Baqarah and the start of Aal-Imran.
- Page 604 contains Al-Ikhlas, Al-Falaq, **and** An-Nas.

`getSurahsForPage(pageNumber)` filters `SURAHS` for any whose `[startPage, endPage]` includes the page, returning a comma-separated string. The enriched `PageProgressEnriched.surahs` field reflects this.

#### Page (604) — the **only** unit of tracking today

The entire `page_progress` table is keyed on `(user_id, page_number)`. Every recitation log, every homework item, every status calculation, every chart is a function of pages. If you mentally substitute "page" for "memorization unit", the rest of the app makes sense.

#### Ayah (~6,236) — surface metadata only

The app **does not track per-ayah progress today.** What it does store is the *first ayah on each page*, in `page-names.json`:

```json
"1": { "surah": 1, "ayah": 1, "text": "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ ..." }
```

This is consumed by `getDefaultPageName(pageNumber)` to provide a human-friendly label for a page (used in the Pages list, the Homework Part dropdown, etc.). The `surah` and `ayah` numeric fields are not currently read by any business logic — `text` is the only field used.

> **Adding ayah-level tracking later — sketch.** See the [§5 Adding Ayah-level support](#5-adding-ayah-level-support-future) section at the end of this doc.

## 2. Spaced repetition

### The formula

```ts
// artifacts/api-server/src/lib/progress-helpers.ts
function calculateDueDate(lastRecited, quality, settings) {
  const days =
    quality === "excellent" ? settings.excellentDays
    : quality === "good"    ? settings.goodDays
    : quality === "hard"    ? settings.hardDays
    :                          settings.relearnDays;
  const due = new Date(lastRecited);
  due.setDate(due.getDate() + days);
  return due;
}
```

Pure addition: `dueDate = lastRecited + interval[quality]`. There's no fancy SM-2 / Anki-style ease factor or interval modulation by previous performance. Every review starts fresh from "the page was recited at quality X, see you in N days".

### Defaults (from `lib/db/src/schema/settings.ts`)

| Quality | Default days | Meaning |
| --- | --- | --- |
| Excellent | 30 | Solid memorization. |
| Good | 14 | Mostly solid; a few small slips. |
| Hard | 7 | Real difficulty; come back soon. |
| Relearn | 3 | Failed; treat as fresh. |

These are **per-user**, persisted in the `settings` table, editable via `PATCH /settings`. A row is auto-created with defaults on first read.

### Auto-downgrade for overdue pages (display-only)

Once a page goes overdue, its **displayed** quality decays one rung down the ladder for every full 14 days it stays overdue:

```text
excellent  ─ 14d ─►  good  ─ 14d ─►  hard  ─ 14d ─►  relearn   (capped here)
```

This is a **read-time computation only**. It never mutates `page_progress.quality`, never touches `recitation_log`, never affects the `status` enum (`overdue`/`due_soon`/…), and never changes `dueDate`. Recording a new recitation clears the overdue state on the next read and the badge snaps back to its solid color.

The math lives in `computeEffectiveQuality(quality, daysOverdue)` in `progress-helpers.ts` and is called from `enrichPageProgress`. Two new fields are added to every `PageProgress` returned by the API:

| Field | Type | Meaning |
| --- | --- | --- |
| `effectiveQuality` | same enum as `quality`, nullable | The downgraded quality. Equals `quality` when the page is not overdue. |
| `qualityDowngrades` | integer (0–3) | Number of 14-day periods that contributed to the downgrade. Capped so we never go past `relearn`. |

`Math.floor(daysOverdue / 14)` is the period count. A page exactly 14 days overdue drops one notch; 28 days drops two; 42+ days drops three (and stays at relearn).

The frontend `QualityBadge` reads these two fields and renders:

- the **effective** quality label, in a **faded + dashed-border** palette (visually distinct from a recorded rating, so users instantly read it as computed-not-recorded);
- one ↓ chevron per `qualityDowngrades` (max 3) to hint at the original rating;
- a tooltip and screen-reader label that spell out "auto-downgraded from {original} to {effective} after N weeks overdue. Your saved rating is unchanged."

Aggregate views (Juz/Surah/Rub' average quality) and the dashboard's quality counts (`excellentCount` etc.) deliberately keep using the **stored** `quality`, not the effective one — the rating history is sacred.

### Status derivation

`enrichPageProgress` derives a status string from the stored row plus `now`:

```text
not in scope                                            → "out_of_scope"
in scope, lastRecited is null                           → "not_started"
in scope, dueDate <= now                                → "overdue"
in scope, daysUntilDue <= 3 (and not overdue)           → "due_soon"
otherwise                                               → "on_track"
```

Status is **always derived, never stored.** This matters: if the user changes their interval settings, every page's status updates immediately on the next read — no migration, no recompute job. The `page_progress.dueDate` column is a snapshot taken at recitation time using whatever settings were active *then*; the same snapshot is also persisted onto the `recitation_log` row so that an undo can restore the page's previous due date verbatim (see [§5 Undo](#undo-transactional-restore)).

## 3. Scope

The `in_scope` boolean is the user's declaration "I'm actively memorizing this page."

| Action | Effect |
| --- | --- |
| `POST /progress/scope` `{ pageNumbers }` | Sets `in_scope = true` for those pages (lazily creating their `page_progress` rows if needed). |
| `DELETE /progress/scope` `{ pageNumbers }` | Sets `in_scope = false`. The recitation history is preserved. |

What `in_scope` does:

- **Filters every dashboard stat.** Overdue / due-soon / on-track counts only consider in-scope pages.
- **Determines the status `out_of_scope`.** Out-of-scope pages are skipped by every progress UI.
- **Does not affect history.** `recitation_log` keeps every entry forever; charts reflect actual activity regardless of current scope.

Recording a recitation **does not** auto-add a page to scope. The user must explicitly add it. (This is intentional — you might recite an out-of-scope page for testing without polluting your active scope.)

## 4. Streak

Computed inline at `GET /progress/overview`:

```ts
// Count back from "today" through the recitation log.
// Today is a free pass: if no log exists for today, we don't break — we
// roll back one day and continue. From day 2 onward, the first day with
// no log breaks the streak.
let streakDays = 0;
let checkDate = new Date(today);
for (let i = 0; i < 365; i++) {              // hard cap at 1 year
  const hasLog = logs.some(l => l.recitedAt >= dayStart && l.recitedAt < dayEnd);
  if (hasLog) {
    streakDays++;
    checkDate.setDate(checkDate.getDate() - 1);
  } else if (i === 0) {
    // grace period: today doesn't count yet
    checkDate.setDate(checkDate.getDate() - 1);
    continue;
  } else {
    break;
  }
}
```

Properties worth knowing:

- **Today's grace period.** If the user hasn't recited yet today, the streak is whatever it was at the end of yesterday — they're not "on a 5-day streak that breaks at midnight if they don't open the app".
- **Any quality counts.** A "Relearn" recitation is enough to keep the streak alive.
- **Local-time day boundaries** (server-local). If your server clock is in UTC and your user is in PST, midnight UTC will rotate the day before the user's midnight. For a single-owner deployment this is fine; for a multi-region deployment a per-user timezone field would be needed.
- **Hard cap of 365** keeps the loop bounded.

## 5. Homework

A homework session bundles a set of pages a teacher (or you) has assigned for a date. Each session has many `homework_items`, one per page.

### Item completion is **derived, then stored**

`homework_items.completed` is updated automatically by recitation actions, not by a separate "mark completed" UI:

| Endpoint | Quality applied | Effect on matching items in active sessions |
| --- | --- | --- |
| `PATCH /progress/pages/:n` | excellent / good | `completed = true`, `quality`, `completedAt` set |
| `PATCH /progress/pages/:n` | hard / relearn | `completed = false`, `quality = null`, `completedAt = null` |
| `POST /progress/recite-batch` | excellent / good | bulk-set completed across all matching items |
| `POST /progress/recite-batch` | hard / relearn | bulk-uncomplete |
| `DELETE /progress/activity/:id` (undo) | derives from new most-recent log | mirrors the rules above |

"Active session" = `homework_sessions.due_date >= now`. Past-due sessions are not affected by new recitations — once a session ends, its completion snapshot is frozen.

The user *can* still toggle items manually in the homework detail page via `PATCH /homework/:hid/items/:iid` — the auto-derivation just keeps the common case effortless.

### Why derive, not just record?

The product question "did I complete my homework?" is logically the same as "did I recite each assigned page well?". Deriving it from `recitation_log` means the user only has to touch one surface: their normal recitation flow updates everything else. It also means the **undo** path stays consistent — see below.

### Undo (transactional restore)

`DELETE /progress/activity/:id` is the most subtle write in the system:

1. Open a transaction.
2. `SELECT ... FOR UPDATE` on the affected `page_progress` row to serialize concurrent writes.
3. Delete the `recitation_log` row.
4. Find the most recent **remaining** log for that page.
5. If one exists: restore `page_progress` (`quality`, `mistakes`, `lastRecited`, `dueDate`) from it. The `dueDate` is read **verbatim** from the prior log row's stored `due_date` column — see "Why we store `due_date` on every log row" below.
6. If none exists: clear the page (`quality = null`, etc.) — the page goes back to "not_started" status.
7. Re-derive `homework_items.completed` for active sessions covering this page using the same positive-rating rule.
8. Commit.

#### Why we store `due_date` on every log row

Each `recitation_log` row carries the `due_date` that was assigned to the page at the moment the recitation was recorded (`last_recited + settings[quality]Days`, evaluated against whatever settings were active *then*). All three insert sites populate it: `PATCH /progress/pages/:n`, `POST /progress/recite-batch`, and the homework `PATCH` route.

This gives the undo operation a true time-machine restore: if you recited page 99 as Excellent under a 30-day interval, lowered your Excellent interval to 7 days, recited it again as Good, and then undid the Good — the page returns to its **original** Excellent due date (today + 30), not a recomputed value (today + 7) under your current settings.

**Backward compatibility.** The column is nullable. Any `recitation_log` row written before this column existed has `due_date = NULL`, and undo falls back to `calculateDueDate(mostRecent.recitedAt, mostRecent.quality, currentSettings)` for those rows only. New rows always have it set. Over time the legacy NULL rows naturally age out as users undo or re-recite their pages.

## 6. Cross-cutting domain rules

These are the invariants every feature must respect.

### Multi-tenant isolation

**Every** Drizzle query that touches a user-facing table must include `eq(<table>.userId, userId)`. Forgetting this exposes other users' data. The `requireAuth` middleware guarantees `req.userId` is set; the rest is on the handler. Code review explicitly looks for this.

### Lazy `page_progress` creation

We do not pre-populate 604 rows per user. A `page_progress` row is created on the first action that touches it (`ensurePageExists`):

- adding the page to scope,
- recording a recitation,
- creating a homework item that includes the page.

This keeps the table small for new users (a user who's only memorized Juz Amma has ~37 rows, not 604) and avoids a one-time migration when adding new users.

### Settings auto-create

`getSettings(userId)` returns the user's row, or inserts a new one with defaults if it doesn't exist. There's no explicit "onboarding" step.

### Pages can belong to multiple Surahs

`getSurahsForPage(page)` may return multiple names. UIs that show "the surah for this page" should treat the value as a **list**, not a singleton.

### Status is never stored

All status strings (`overdue`, `due_soon`, etc.) are computed from `(in_scope, last_recited, due_date, now)` at read time. There is no migration when settings change — the next read reflects the new values immediately.

### Charts read from `recitation_log`, not `page_progress`

Daily-chart and progress-chart endpoints reconstruct historical state by replaying the log. This means:

- Past days remain accurate even after you delete `page_progress` rows.
- Removing a page from scope does not erase it from the history charts.
- Activity-feed and chart numbers can outlive the rows in `page_progress`.

## 7. Adding ayah-level support (future)

A high-level sketch in case you want to take this on. The minimum invasive path:

1. **Data layer.**
   - Source per-ayah text + page mapping (e.g. from a public Quran text dump, then bundled as JSON the same way `page-names.json` is bundled today). Store as `lib/quran-data/src/ayat.json` shared by both server and frontend (this is the right time to extract a shared lib and remove the dual-copy `quran-ref.ts` / `quran-data.ts`).
   - Add lookup helpers: `getAyatForPage(pageNumber)`, `getPageForAyah(surah, ayah)`.

2. **Schema.**
   - New table `ayah_progress { id, user_id, surah, ayah, in_scope, quality, mistakes, last_recited, due_date }` with `unique(user_id, surah, ayah)`.
   - `recitation_log` gains optional `surah`/`ayah` columns. `page_number` stays for backwards compat (an ayah-level log entry has all three; a page-level entry has just `page_number`).

3. **Status derivation.**
   - Reuse `calculateDueDate` and the status enum unchanged — they're page-agnostic.
   - `enrichAyahProgress` mirrors `enrichPageProgress`.

4. **Roll-up.**
   - Page-level status becomes a roll-up: a page is "overdue" if any of its ayat is overdue (or the page row itself is overdue if no ayat are tracked). Decide the precedence carefully — most users will track at *one* grain, not both.

5. **API.**
   - Add `/progress/ayat`, `/progress/ayat/:surah/:ayah`, etc. Keep `/progress/pages` working for users who don't use ayah tracking.
   - The `recite-batch` endpoint can be extended to accept an `ayatRanges` array.

6. **UI.**
   - A new "Ayat" tab next to Pages/Juz/Surah, drilling into a Surah → list of ayat with quick-rate buttons.
   - The Surah detail page can switch between page tiles and ayah tiles based on a user preference.

7. **Migration / coexistence.**
   - Keep the page grain as the default; ayah tracking is opt-in per user (a `settings.use_ayah_grain` flag).
   - The streak counter already counts any log entry, so it'll work as soon as ayah-level entries write to `recitation_log`.

The current architecture (derived status, lazy row creation, append-only log, derived homework completion) is friendly to this extension because adding a finer grain doesn't disturb any existing rule — it just adds a parallel table and a parallel set of read endpoints.

## Quick reference: where each rule lives

| Rule | File |
| --- | --- |
| Juz / Rob3 / Surah catalog | `artifacts/api-server/src/lib/quran-data.ts` (mirrored in `artifacts/quran-tracker/src/lib/quran-ref.ts`) |
| Page → Juz / Rob3 / Surah lookups | same files |
| Default per-page name (first ayah text) | `artifacts/{api-server,quran-tracker}/src/lib/page-names.json` + `getDefaultPageName` |
| `calculateDueDate` formula | `artifacts/api-server/src/lib/progress-helpers.ts` |
| Status derivation (`enrichPageProgress`) | same file |
| Settings defaults | `lib/db/src/schema/settings.ts` |
| Streak computation | `artifacts/api-server/src/routes/progress.ts`, in the `/progress/overview` handler |
| Homework completion derivation (single + batch) | `artifacts/api-server/src/routes/progress.ts` (`PATCH /progress/pages/:n`, `POST /progress/recite-batch`) |
| Undo restore (transactional) | `artifacts/api-server/src/routes/progress.ts` (`DELETE /progress/activity/:id`) |
| `due_date` snapshot on each recitation | `artifacts/api-server/src/routes/progress.ts` (single + batch) and `artifacts/api-server/src/routes/homework.ts` |
| Multi-tenant `requireAuth` | `artifacts/api-server/src/middlewares/requireAuth.ts` |
