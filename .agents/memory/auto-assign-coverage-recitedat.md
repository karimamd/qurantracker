---
name: Auto-assign page coverage depends on same-day recitedAt
description: Why stale per-ayah marks silently block auto-assign of a page's recitation, and the rule that every per-ayah button must re-record (refresh recitedAt) on tap.
---

# Auto-assign coverage requires same-day `recitedAt`

Auto-assigning a page's recitation only fires when EVERY ayah on the page has an
active per-ayah mark whose `recitedAt` is within *today*. The mistakes *count* is
not day-filtered, but the *coverage* check is.

**The trap:** per-ayah marks are sticky (stay active until explicitly resolved),
so a page revised on an earlier day still shows its old marks as "on". If a re-tap
on an already-marked ayah is treated as a no-op (or as a toggle-OFF), the mark's
`recitedAt` never advances to today, the page never counts as "marked today", and
its status silently never auto-updates — even though auto-assign itself works fine
for freshly-marked pages.

**Decision/rule:** every per-ayah button (clear, mistake, AND link) must
RE-RECORD on each tap — always POST so the server refreshes `recitedAt = now()`
on the existing active row. None of them toggle off.
**Why:** the user wants tapping an already-marked ayah to record a new status, not
silently undo it; and without the refresh the only way to complete same-day
coverage on a revisited page would be to delete + re-add every mark.
**Consequence:** there is no single-button "undo" for a mark. Removal is via
"Clear all marks" (clear/mistake also swap to each other). Accept this tradeoff.

**Diagnosis tip:** when "page status won't update" is reported, inspect
`ayah_mistakes.recited_at` for that page in the PRODUCTION DB (published app uses a
separate DB from dev). All marks dated to a prior day is the signature of this bug,
NOT a broken auto-assign.
