---
name: /active-mistakes broad invalidation
description: Any client screen posting to /active-mistakes must mirror the Reader's broad cache invalidation, because the server auto-assigns a page recitation as a side effect.
---

Every client mutation hitting the per-page `/active-mistakes` POST/DELETE endpoints
must invalidate the SAME broad query set the Reader does — not just the global
`mistakes` feed. That set: page progress (+forced refetch), progress overview,
juz/surah/rob3 lists, recent activity, the ayah's juzDetail/surahDetail, homework
list, and a predicate over `/api/homework/` (covers getGetHomework AND
getGetHomeworkAyahs).

**Why:** The server can auto-assign a page-level recitation as a side effect when a
mark completes a page (settings.autoAssignPageFromAyahs). If a screen only
invalidates the mistakes feed, the page status and homework "ayah by ayah" list
stay stale even though the DB was already updated. This bit the Reader first (fixed),
then the Ayah detail screen (/ayahs/:n) which was copied without the broad set.

**How to apply:** When adding any new UI that marks per-ayah status via
useAddActivePageMistake / useRemoveActivePageMistake, copy the Reader's
invalidation helper rather than writing a minimal one. Fire it on BOTH the add and
remove onSuccess branches.
