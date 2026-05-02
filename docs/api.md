# API Reference

The HTTP contract is defined in `lib/api-spec/openapi.yaml`. **That file is the source of truth** — if you change anything below, update the spec and regenerate.

- **Base URL (dev & prod):** `/api` (served behind the shared proxy).
- **Auth:** every endpoint except `/healthz` requires an identity. That's **either** a valid Clerk session cookie **or** a `guest_id` cookie (auto-minted by `requireAuth` on the first API call from any unauthenticated visitor). Both identities work the same way downstream — see [Authentication](./auth.md).
- **Generated client:** import the typed React Query hooks from `@workspace/api-client-react`.
- **Generated schemas:** import the Zod schemas from `@workspace/api-zod` to validate request/response shapes inside route handlers.

## Endpoint catalog

### Health

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/healthz` | No | Returns `{ status: "ok" }`. Used by the deployment health check. |

### Settings

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/settings` | Yes | Get the current user's SR intervals. Auto-creates with defaults on first call. |
| `PATCH` | `/settings` | Yes | Partial update — any subset of `excellentDays`, `goodDays`, `hardDays`, `relearnDays`. |

### Progress — overview & lists

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/progress/overview` | Yes | Dashboard summary: `pagesInScope`, `pagesOverdue`, `pagesDueSoon`, `pagesOnTrack`, `totalPages` (604), `streakDays`, `excellentCount`/`goodCount`/`hardCount`/`relearnCount`. Counts use the **stored** quality (auto-downgrade is display-only). |
| `GET` | `/progress/pages` | Yes | Filterable list of pages. Query params: `status` (`overdue` \| `due_soon` \| `on_track` \| `not_started` \| `out_of_scope`), `inScope` (bool). |
| `GET` | `/progress/juz` | Yes | All 30 Juz with aggregated counts and progress. |
| `GET` | `/progress/juz/{juzNumber}` | Yes | Detail for a single Juz: includes 8 Rob3s and the contained pages. |
| `GET` | `/progress/surah` | Yes | All 114 Surahs with aggregated counts. |
| `GET` | `/progress/surah/{surahNumber}` | Yes | Detail for a single Surah: name, page range, and pages. |
| `GET` | `/progress/rob3` | Yes | All 240 Rub' al-Hizb with aggregated stats. |

#### `PageProgress` shape (returned by every endpoint above)

Every page object is enriched server-side via `enrichPageProgress`. The notable computed fields:

| Field | Type | Notes |
| --- | --- | --- |
| `quality` | enum \| null | The user's last recorded rating. Never auto-mutated. |
| `effectiveQuality` | enum \| null | **Display-only auto-downgrade**: drops one rung (excellent→good→hard→relearn) per 14 days overdue. Equals `quality` when not overdue. See [Business Logic — Auto-downgrade](./business-logic.md#auto-downgrade-for-overdue-pages-display-only). |
| `qualityDowngrades` | integer 0–3 | Number of 14-day overdue periods feeding `effectiveQuality`. Frontend renders this as ↓ chevrons next to the badge. |
| `status` | enum | `overdue` / `due_soon` / `on_track` / `not_started` / `out_of_scope`. Derived from `(in_scope, last_recited, due_date, now)`. Never stored. |
| `daysSinceRecited`, `daysUntilDue` | integer \| null | Convenience deltas. |

### Progress — recitation actions

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `PATCH` | `/progress/pages/{pageNumber}` | Yes | Record a single-page recitation. Body: `{ quality, mistakes?, ayahMistakes? }`. Updates `page_progress`, appends a `recitation_log` row, and persists per-ayah mistakes into `ayah_mistakes` (atomic). |
| `POST` | `/progress/recite-batch` | Yes | Record the same quality across a list of pages. Body: `{ pageNumbers: number[], quality, mistakes? }`. Also adds the pages to scope and marks matching `homework_items` completed for active sessions. |
| `DELETE` | `/progress/activity/{id}` | Yes | **Undo recitation.** Deletes one `recitation_log` row, recomputes `page_progress` and `homework_items.completed` from the remaining history. Transactional with row lock. |
| `PUT` | `/progress/pages/{pageNumber}/name` | Yes | Set or clear the custom name for a page. |

`ayahMistakes[]` items are `{ surahNumber, ayahNumberInSurah, globalAyahNumber, mistakeType }`. `mistakeType` is currently `"memorization"` or `"link"` — both can coexist on the same ayah.

### Mistakes

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/mistakes` | Yes | Date-grouped feed of per-ayah mistakes for the Mistakes page. Filterable by mistake type. Each entry includes the surah, ayah, page, type, and timestamp — used to deep-link to `/reader/<page>?practice=<globalAyahNumber>`. |

### Progress — scope

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/progress/scope` | Yes | Add pages to memorization scope. Body: `{ pageNumbers: number[] }`. |
| `DELETE` | `/progress/scope` | Yes | Remove pages from scope. Body: `{ pageNumbers: number[] }`. |

### Progress — feeds & charts

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/progress/activity` | Yes | Recent recitation entries (default last N). Used by the dashboard's Recent Activity card. |
| `GET` | `/progress/daily-chart` | Yes | Per-day distinct page recitation counts over the last ~30 days. |
| `GET` | `/progress/progress-chart` | Yes | Dual-series chart: per-day overdue count (state at end of day) + per-day distinct pages recited. |

### Homework

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/homework` | Yes | List all homework sessions for the user. |
| `POST` | `/homework` | Yes | Create a new session with items. |
| `GET` | `/homework/{id}` | Yes | Session details with items. |
| `PATCH` | `/homework/{id}` | Yes | Update title and/or due date. |
| `DELETE` | `/homework/{id}` | Yes | Delete a session (and its items). |
| `PATCH` | `/homework/{homeworkId}/items/{itemId}` | Yes | Mark an individual item completed (or change its quality). |

## Calling the API from React

Always use the generated hooks. Example:

```tsx
import {
  useGetProgressOverview,
  useUndoRecitation,
  getRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function Dashboard() {
  const { data: overview } = useGetProgressOverview();
  const qc = useQueryClient();
  const undo = useUndoRecitation({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getRecentActivityQueryKey() }),
    },
  });

  return (
    <button onClick={() => undo.mutate({ id: 42 })}>Undo log #42</button>
  );
}
```

Conventions:

- Hooks are named `use<OperationId>` (e.g. `useGetProgressOverview`, `useUndoRecitation`).
- Each operation also exports a `get<OperationId>QueryKey()` helper for invalidation.
- The mutation hook accepts an `mutation: { onSuccess, onError, ... }` options object.
- All hooks return strongly-typed data shaped by the Zod schemas.

## Validating responses on the server

Inside route handlers, use the Zod schemas to validate inputs (params, query, body) and to shape responses:

```ts
import {
  UndoRecitationParams,
  UndoRecitationResponse,
} from "@workspace/api-zod";

router.delete("/progress/activity/:id", async (req, res) => {
  const params = UndoRecitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // ... business logic ...
  res.json(UndoRecitationResponse.parse(enrichedPage));
});
```

This guarantees the wire format matches the spec — drift is caught at runtime.

## Adding a new endpoint

1. Edit `lib/api-spec/openapi.yaml`. Add the path, parameters, request body, responses, and the `operationId` (this becomes the hook/schema name).
2. Run `pnpm --filter @workspace/api-spec run codegen`. New hooks and schemas are produced.
3. (If the operation needs new types) re-export them from `lib/api-zod/src/index.ts` if necessary.
4. Run `pnpm run typecheck:libs` to refresh declarations.
5. Implement the handler in the appropriate file under `artifacts/api-server/src/routes/`.
6. Validate inputs with the new Zod schema; validate the response shape with `<Op>Response.parse(...)`.
7. Test by curl through the proxy — `curl -i localhost:80/api/<path>`.
8. Add the hook call in the React UI.
9. Update the relevant doc files: this file, [`data-flow.md`](./data-flow.md), and `replit.md`.

## Manual smoke testing

Common dev sanity checks (note: most return 401 unless you pass a Clerk session cookie):

```bash
curl -s localhost:80/api/healthz                      # {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" \
     localhost:80/api/progress/overview               # 401
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
     localhost:80/api/progress/activity/1             # 401
```

For real auth-required testing in the test agent, see the `testing` skill which programmatically signs in via Clerk's testing endpoint.
