# Database

PostgreSQL 16, accessed through Drizzle ORM. The schema lives in `lib/db/src/schema/`. Migrations are managed via `drizzle-kit push`.

## Connection

The Drizzle client is a singleton in `lib/db/src/index.ts`. It uses `DATABASE_URL` from the environment. Both the API server and the migration tooling read from this same env var.

```ts
import { db, pageProgressTable, recitationLogTable, ... } from "@workspace/db";
```

## Multi-tenant isolation

Every domain table has a nullable `user_id text` column. Every query in the API server **must** filter by `req.userId`. The `requireAuth` middleware enforces this at the request level — handlers should treat `req.userId!` as required.

`user_id` shapes you'll see in the data:

- `user_xxx…` — Clerk users.
- `guest_<32hex>` — anonymous visitors. Auto-minted as an httpOnly cookie by `requireAuth` on the first API call from any unauthenticated visitor; migrated to the Clerk id on first sign-in (see [Authentication](./auth.md)).
- `NULL` — pre-Clerk legacy rows from the original single-user version. The `requireAuth` middleware has a one-shot **orphan claim** that reassigns these to the configured `OWNER_EMAIL` user on their first signed-in request. After that the column is effectively non-null.

## Tables

### `settings`

User-configurable spaced-repetition intervals.

| Column | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | serial PK | — | |
| `user_id` | text (unique) | NULL | Each user has at most one settings row. Auto-created on first read by `getSettings(userId)`. |
| `excellent_days` | integer | `30` | Days until next due when rated Excellent. |
| `good_days` | integer | `14` | Days when rated Good. |
| `hard_days` | integer | `7` | Days when rated Hard. |
| `relearn_days` | integer | `3` | Days when rated Relearn. |

### `page_progress`

The current state of every page (1–604) for a user. Lazily created — a row only appears once a page is touched (added to scope or recited).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial PK | |
| `user_id` | text | Scoped per Clerk user. |
| `page_number` | integer | 1–604 (Mushaf pages). Composite-unique with `user_id`. |
| `custom_name` | text NULL | Optional user-supplied display name; otherwise default name from `page-names.json` (Surah + first ayah snippet). |
| `in_scope` | boolean default `false` | Whether the page is part of the user's memorization scope. |
| `quality` | text NULL | One of `"excellent" \| "good" \| "hard" \| "relearn"` — the latest rating. |
| `mistakes` | integer NULL | Optional mistake count from the latest recitation. |
| `last_recited` | timestamptz NULL | Timestamp of the most recent log entry. |
| `due_date` | timestamptz NULL | `last_recited + settings[quality]Days`, recomputed on every write. |

**Indexes:** `(user_id)`, `unique(user_id, page_number)`.

### `recitation_log`

Append-only history of every recitation. Used by the activity feed, charts, and the undo recompute.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial PK | |
| `user_id` | text | |
| `page_number` | integer | |
| `quality` | text | One of `"excellent" \| "good" \| "hard" \| "relearn"`. |
| `mistakes` | integer NULL | |
| `recited_at` | timestamptz default `now()` | |
| `due_date` | timestamptz NULL | Snapshot of the `page_progress.due_date` assigned by **this** recitation, computed from the user's settings at the time the row was written. Read verbatim by the undo handler to restore the page's previous due date even if the user has since changed their interval settings. **Nullable for backward compat** — rows written before this column existed are NULL, and the undo handler falls back to recomputing `dueDate` from current settings for those legacy rows. |

**Indexes:** `(user_id)`, `(user_id, page_number, recited_at desc)`.

When a row is deleted via `DELETE /api/progress/activity/:id`, the handler restores `page_progress` from the most-recent remaining log for that page (preferring its stored `due_date`), or clears the page if no logs remain. See [`data-flow.md`](./data-flow.md) for the full sequence.

### `homework_sessions`

A homework assignment / study session.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial PK | |
| `user_id` | text | |
| `title` | text | |
| `due_date` | timestamptz | When the session ends. Sessions with `due_date >= now` are "active". |
| `created_at` | timestamptz default `now()` | |
| `updated_at` | timestamptz | Auto-updated via `$onUpdate`. |

### `homework_items`

Individual pages assigned within a homework session.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial PK | |
| `user_id` | text | |
| `homework_id` | integer | FK reference to `homework_sessions.id` (logical, not enforced). |
| `page_number` | integer | |
| `type` | text | Domain-specific label (e.g. memorize / revise). |
| `completed` | boolean default `false` | |
| `quality` | text NULL | The quality of the recitation that completed this item. |
| `completed_at` | timestamptz NULL | |
| `created_at` | timestamptz default `now()` | |

`recite-batch` and the undo flow both maintain `homework_items.completed` consistency: a positive (good/excellent) most-recent log marks active items completed; otherwise items are uncompleted.

### `ayah_mistakes`

Append-only per-ayah mistake records. Captured during Reader hide-mode practice and submitted alongside the page's quality rating in `PATCH /api/progress/pages/:n` (atomic with the recitation log entry). Powers the `/mistakes` analytics page.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial PK | |
| `user_id` | text | |
| `page_number` | integer | The Mushaf page the ayah belongs to. |
| `surah_number` | integer | 1–114. |
| `ayah_number_in_surah` | integer | 1-based ayah index within the surah. |
| `global_ayah_number` | integer | 1–6,236 — used to deep-link `/reader/<page>?practice=<n>`. |
| `mistake_type` | text | Currently `"memorization"` (failed to remember the ayah) or `"link"` (failed to predict it from the previous one). The two are independent dimensions and can coexist on the same ayah. |
| `recited_at` | timestamptz default `now()` | Time the parent recitation was recorded. |
| `created_at` | timestamptz default `now()` | |

**Indexes:** `(user_id)`, `(user_id, recited_at)`, `(user_id, page_number)`.

## Relationships (logical)

```text
settings  1───1  user (Clerk)

page_progress  N───1  user
        │
        │ (page_number)
        ▼
   recitation_log  N───1  user

homework_sessions  1───N  homework_items  (by homework_id)
        │                       │
        └─── user ───────────────┘

ayah_mistakes  N───1  user
        │
        └─── (page_number) — ayah belongs to one of 604 pages
```

Foreign keys are not declared at the SQL level; integrity is enforced in application code. This was an early decision to keep migrations cheap during rapid iteration.

## Migrations

The repo uses **Drizzle's `push` strategy** rather than versioned migrations:

```bash
pnpm --filter db push
```

This compares the live DB schema against `lib/db/src/schema/*.ts` and applies a diff. There is no `migrations/` folder.

After every task-agent merge, the post-merge script runs `pnpm install --frozen-lockfile` followed by `pnpm --filter db push` (see `scripts/post-merge.sh`), so schema changes land automatically on the development database.

**Production database changes** require running `pnpm --filter db push` against the production `DATABASE_URL`. There is no automated production migration step in the deployment pipeline yet — see `.local/skills/database/SKILL.md` for the recommended approach.

## Schema change checklist

When you add or change a column:

1. Edit the relevant file in `lib/db/src/schema/*.ts`.
2. Re-export from `lib/db/src/schema/index.ts` and `lib/db/src/index.ts` if it's a new table.
3. Run `pnpm --filter db push` to apply the change to your local DB.
4. Run `pnpm run typecheck:libs` to refresh the lib's declaration files.
5. Update OpenAPI (`lib/api-spec/openapi.yaml`) to expose the new field.
6. Run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks/schemas.
7. Update the affected route handler(s) and frontend.
8. Document the change in [`database.md`](./database.md) and `replit.md`.

## Inspecting the database

In development you can query the DB directly:

```bash
psql "$DATABASE_URL" -c "select count(*) from page_progress where user_id is not null;"
```

For production data inspection, use the read-only path described in `.local/skills/database/SKILL.md`.
