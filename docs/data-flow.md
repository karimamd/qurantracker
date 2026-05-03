# Data Flow

This doc traces a real request end-to-end so you can see how every layer fits together. The example is **"the user clicks Undo on a Recent Activity row"**, which is one of the more interesting flows because it involves a write, a transactional recompute, and several cache invalidations.

## Worked example: undoing a recitation

### 1. UI event

`artifacts/quran-tracker/src/pages/dashboard.tsx` renders the Recent Activity card. Each row has an undo button:

```tsx
<button data-testid={`undo-activity-${log.id}`} onClick={() => setPendingUndoId(log.id)}>
  <Undo2 />
</button>
```

Clicking opens an AlertDialog. Confirming calls the generated React Query mutation hook.

### 2. React Query hook (generated)

```tsx
import { useUndoRecitation } from "@workspace/api-client-react";

const undoMutation = useUndoRecitation({
  mutation: {
    onSuccess: () => {
      toast({ title: "Recitation undone", description: `Page ${page} progress restored.` });
      // Cascade-invalidate every dashboard surface that could show stale data
      queryClient.invalidateQueries({ queryKey: getRecentActivityQueryKey() });
      queryClient.invalidateQueries({ queryKey: getProgressOverviewQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListJuzProgressQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListSurahProgressQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDailyChartQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetProgressChartQueryKey() });
      // Predicate-based: any open juz/surah detail
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return typeof k === "string" && (k.startsWith("/api/progress/juz/") || k.startsWith("/api/progress/surah/"));
        },
      });
    },
  },
});
```

The hook itself comes from `lib/api-client-react/src/generated/api.ts` and uses `customFetch` under the hood.

### 3. Custom fetch

`lib/api-client-react/src/custom-fetch.ts` is the single mutator orval is configured to use. It:

1. Prefixes the URL with the API base path (`/api`, served via the shared proxy).
2. Attaches Clerk's session cookie automatically (browser does this since the request is same-origin).
3. Throws on non-2xx so React Query sees it as an error.

Because the SPA and API are reached through the same proxy origin, no `Authorization` header is needed in the browser — the Clerk session cookie is enough.

### 4. Express middleware chain

```text
incoming HTTP DELETE /api/progress/activity/123
        │
        ▼
pino-http  →  attaches req.log (structured logger)
        │
        ▼
clerkMiddleware  →  parses session cookie, populates getAuth(req)
        │
        ▼
requireAuth  →  if no userId, 401. Otherwise sets req.userId.
                 First time the OWNER_EMAIL user signs in, claims any
                 user_id IS NULL legacy rows. (See auth.md.)
        │
        ▼
router  →  matches DELETE /progress/activity/:id  →  handler in routes/progress.ts
```

### 5. Route handler

The handler in `artifacts/api-server/src/routes/progress.ts` does the actual work:

```ts
router.delete("/progress/activity/:id", async (req, res) => {
  const userId = req.userId!;
  const params = UndoRecitationParams.safeParse(req.params);  // Zod from api-zod
  if (!params.success) return res.status(400).json({ error: params.error.message });

  // Look up the log and ensure the page row exists outside the txn
  const [preLog] = await db.select().from(recitationLogTable)
    .where(and(eq(recitationLogTable.id, params.data.id),
               eq(recitationLogTable.userId, userId)));
  if (!preLog) return res.status(404).json({ error: "Activity entry not found" });
  await ensurePageExists(userId, preLog.pageNumber);

  const settings = await getSettings(userId);

  const updated = await db.transaction(async (tx) => {
    // Lock the page row to serialize concurrent undos / undo-vs-recite
    const [lockedPage] = await tx.select().from(pageProgressTable)
      .where(...).for("update");

    // Re-read inside the txn (could have been deleted by a racing request)
    const [logEntry] = await tx.select().from(recitationLogTable).where(...);
    if (!logEntry || !lockedPage) return null;

    await tx.delete(recitationLogTable).where(...);

    // Find the most-recent remaining log for this page
    const [mostRecent] = await tx.select().from(recitationLogTable)
      .where(and(eq(...userId), eq(...pageNumber)))
      .orderBy(desc(recitationLogTable.recitedAt)).limit(1);

    // Restore page_progress from history (or clear if none).
    // dueDate is read verbatim from the prior log row's stored snapshot;
    // we only recompute as a fallback for legacy rows written before
    // recitation_log.due_date existed.
    let nextPage;
    if (mostRecent) {
      const dueDate = mostRecent.dueDate
        ?? calculateDueDate(mostRecent.recitedAt, mostRecent.quality, settings);
      [nextPage] = await tx.update(pageProgressTable).set({
        quality: mostRecent.quality,
        mistakes: mostRecent.mistakes ?? null,
        lastRecited: mostRecent.recitedAt,
        dueDate,
      }).where(...).returning();
    } else {
      [nextPage] = await tx.update(pageProgressTable).set({
        quality: null, mistakes: null, lastRecited: null, dueDate: null,
      }).where(...).returning();
    }

    // Recompute homework_items.completed for active sessions covering this page
    // (mirrors recite-batch's derivation: positive latest log => completed)
    const activeSessions = await tx.select({ id: homeworkSessionsTable.id })
      .from(homeworkSessionsTable)
      .where(and(eq(...userId), gte(homeworkSessionsTable.dueDate, now)));
    if (activeSessions.length) {
      const isPositive = mostRecent && (mostRecent.quality === "good" || mostRecent.quality === "excellent");
      await tx.update(homeworkItemsTable).set(
        isPositive
          ? { completed: true, quality: mostRecent.quality, completedAt: mostRecent.recitedAt }
          : { completed: false, quality: null, completedAt: null }
      ).where(...);
    }

    return nextPage;
  });

  if (!updated) return res.status(404).json({ error: "Activity entry not found" });
  res.json(UndoRecitationResponse.parse(enrichPageProgress(updated)));
});
```

Three important properties:

- **Atomicity**: the delete + restore is a single transaction, with `SELECT ... FOR UPDATE` on the page row to serialize concurrent writes for the same page.
- **Auth scoping**: every `where` clause includes `eq(..., userId)`, so a user can never modify another user's data even by guessing IDs.
- **Verbatim due-date restore**: each `recitation_log` row stores the `due_date` it assigned at write time. Undo prefers that snapshot, so changing your interval settings between recitations doesn't perturb the restored due date. See [Business Logic — Undo](./business-logic.md#undo-transactional-restore).

### 6. Response → React Query → UI

The handler validates its response with the generated Zod schema (`UndoRecitationResponse.parse(...)`). The mutation's `onSuccess` in step 2 fires, the toast appears, and every invalidated query refetches automatically.

## The general shape of every read flow

```text
Page mounts
  └─ useGetProgressOverview()        ← generated hook
       └─ customFetch GET /api/progress/overview
            └─ requireAuth → router → handler
                 └─ db.select from page_progress filtered by userId
                      → enrichPageProgress (status, daysUntilDue)
                      → response Zod validates → JSON
       └─ React Query caches by queryKey ["/api/progress/overview"]
       └─ Component re-renders with data
```

## The general shape of every write flow

```text
User action
  └─ useXyzMutation()                ← generated hook
       └─ customFetch POST/PATCH/DELETE
            └─ requireAuth → router → handler (Zod validates input)
                 └─ db transaction (where appropriate)
                      → recompute derived state (page_progress, homework_items)
                      → returning() → enrichPageProgress
       └─ onSuccess: invalidate affected query keys → re-renders
```

## Spaced-repetition computation

All three writes that touch `page_progress` (single-page PATCH, batch recite, undo) call the same helper:

```ts
// artifacts/api-server/src/lib/progress-helpers.ts
export function calculateDueDate(lastRecited, quality, settings) {
  const days =
    quality === "excellent" ? settings.excellentDays   // default 30
    : quality === "good"    ? settings.goodDays        // default 14
    : quality === "hard"    ? settings.hardDays        // default 7
    :                          settings.relearnDays;   // default 3
  const due = new Date(lastRecited);
  due.setDate(due.getDate() + days);
  return due;
}
```

The intervals are user-configurable via `PATCH /settings`. The defaults live in `lib/db/src/schema/settings.ts`.

`enrichPageProgress` then derives a `status` from the stored row:

```text
not in scope                         → "out_of_scope"
in scope, never recited              → "not_started"
dueDate <= now                       → "overdue"
dueDate within next 3 days           → "due_soon"
otherwise                            → "on_track"
```

These status strings are what the UI's color-coding and stat cards key off of.

## Cache invalidation pattern

The frontend uses generated query keys (`getXxxQueryKey()`) so that invalidations stay in lockstep with the spec. For per-id detail keys (`/api/progress/juz/3`, `/api/progress/surah/12`) we use a **predicate-based invalidation**:

```ts
queryClient.invalidateQueries({
  predicate: (q) => {
    const k = q.queryKey?.[0];
    return typeof k === "string"
      && (k.startsWith("/api/progress/juz/") || k.startsWith("/api/progress/surah/"));
  },
});
```

This is necessary because the generated keys are flat strings (`["/api/progress/juz/3"]`) rather than structured arrays, so prefix-based array invalidation isn't directly available.

## Logging

Backend uses pino:

- Inside a route handler: `req.log.info({ userId }, "Undo recitation")`.
- Outside a request context: `import { logger } from "./lib/logger"`.

**Never use `console.log` in server code** — pino produces structured JSON logs that the deployment platform can index.
