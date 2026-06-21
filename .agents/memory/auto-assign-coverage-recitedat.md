---
name: Auto-assign page coverage depends on same-day recitedAt
description: Why stale per-ayah marks silently block auto-assign of a page's recitation, and the rule that re-affirming a mark must refresh recitedAt.
---

# Auto-assign coverage requires same-day `recitedAt`

`maybeAutoAssignPageRecitation` only fires when EVERY ayah on a Mushaf page has an
active (`resolvedAt IS NULL`) per-ayah mark whose `recitedAt` falls within today's
`[startOfToday, startOfTomorrow)` window. The mistakes *count* is not day-filtered
(all active memorization|link rows), but the *coverage* check is.

**The trap:** per-ayah marks are sticky (active until explicitly resolved), so a
page revised on an earlier day still has active marks. The Reader seeds those old
marks, so the buttons render already-"on". Tapping an already-on ayah used to be a
client no-op (the `if (!wasCleared)` / `if (!wasMistake)` skips in
`reader.tsx` `handleAyahMark`), and even when re-POSTed the server skipped writing
when an active row existed — so `recitedAt` never advanced to today and the page
never counted as "marked today". Result: page status silently never auto-updates,
even though auto-assign itself is working fine for freshly-marked pages.

**Rule:** re-affirming an existing active mark MUST refresh its `recitedAt` to now.
- Client (`handleAyahMark`): always call `persistAdd` on tap, never skip.
- Server (POST `/progress/pages/:pageNumber/active-mistakes`): when an identical
  active row exists, `UPDATE ... SET recitedAt = now()` instead of doing nothing.

**Why:** without the refresh, the only way to complete same-day coverage on a
revisited page is to delete + re-add every ayah mark, which the UI gives no
affordance for.

**Diagnosis tip:** when "page status won't update" is reported, check the actual
`ayah_mistakes.recited_at` for that page in the PRODUCTION DB (the published app
uses a separate DB from dev). A page whose marks are all from a prior day is the
signature of this bug, not a broken auto-assign.

**Known remaining gap:** the `link` button is still a toggle — an already-active
stale link mark toggles OFF on first tap (needs a second tap to re-affirm with
today's date). `clear` and `mistake` are not toggles, so they refresh on a single
tap. Left as a possible future UX tweak.
