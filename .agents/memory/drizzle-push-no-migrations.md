---
name: Schema default changes need an explicit backfill
description: This project uses drizzle-kit push with no migrations directory, so changing a column default never touches existing rows.
---

Changing a `.default(...)` in a Drizzle schema and running `drizzle-kit push` only affects
rows created *after* the push. Every existing row keeps its old value.

**Why:** `lib/db` has no `drizzle/` migrations directory — the project's workflow is
`pnpm --filter @workspace/db exec drizzle-kit push --force`, which diffs and alters the
schema but never emits data migrations. A default change that is meant to be felt by
current users is therefore a two-step operation.

**How to apply:** after pushing a changed default, run an explicit
`UPDATE <table> SET <col> = <new> WHERE <col> = <old-default>` so users who never
customized the value pick up the new one, and leave genuinely customized rows alone.
Also grep the server for a hardcoded fallback of the old default (e.g. the
`row ?? { ... }` shape used when no per-user settings row exists) and for the same
number repeated in OpenAPI descriptions and the generated api-zod / api-client-react
files — those are hand-patched, not regenerated.
