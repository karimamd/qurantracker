---
name: Lazily-created per-user rows must tolerate insert conflicts
description: Select-then-insert helpers race on first load because one page load fans out to many endpoints that all call them.
---

Helpers that lazily create a row on first access (`getSettings`,
`ensurePageExists`) were written as select-then-insert with no conflict
handling. A single page load fans out to several endpoints concurrently
(telawa/today, telawa/scope/today, progress-chart, telawa/homework-reading,
...) and each calls the same helper. For a brand-new user they all miss the
select and race to insert, but the unique index lets only one win — the
losers throw a duplicate-key error and 500 the whole request.

**Symptom:** a new user's first load comes back partly blank with several
500s, then succeeds on the next refresh (because by then the row exists).
Easy to misdiagnose as a frontend caching problem.

**The rule:** any lazy row creation behind a unique index must use
`onConflictDoNothing({ target: <unique cols> })` and, when `returning()`
yields nothing, re-select the winner's row. Throw explicitly if that
re-select also finds nothing rather than returning undefined.

**How to apply:** grep for `.insert(` immediately following a `.select()`
existence check whenever first-load 500s or intermittent duplicate-key
errors appear. The same pattern applies to any table with a
`(user_id, ...)` unique index.
