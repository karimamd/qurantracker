---
name: React Query optimistic-update race in Reader
description: How rapid mark taps caused clears to flash off, and the pendingMarkCount fix.
---

## The pattern (applies to any screen with rapid optimistic mutations)

When `persistAdd` / `persistRemove` fire, each one:
1. Applies an optimistic local-state update immediately.
2. Calls `addActiveMistake.mutate(...)` / `removeActiveMistake.mutate(...)`.
3. In `onSuccess`, writes the server's authoritative response to the cache via `queryClient.setQueryData(...)`.

The seed `useEffect` watches `activeMistakes` (the React Query cache entry) and re-derives the local `clearedAyahs` / `mistakeAyahs` / `linkAyahs` sets from it.

**Bug**: When two marks fire in rapid succession (A then B):
- A's `onSuccess` fires first and writes A-only server data to cache.
- The seed effect runs, replaces local state with A-only data — wiping B's optimistic update.
- B's mark visually disappears until B's own `onSuccess` arrives.

## Fix: `pendingMarkCount` ref

```tsx
const pendingMarkCount = useRef(0);
```

- Increment **before** each `mutate` call in `persistAdd` and `persistRemove`.
- Decrement in **both** `onSuccess` and `onError` (use `Math.max(0, prev - 1)` to prevent going negative on edge cases).
- In the seed effect: `if (pendingMarkCount.current > 0) return;`

**Why:** The seed only fires when all mutations have settled. By that point, the cache holds the fully-reconciled server state, and the seed is safe to apply.

**Why not `isPending` on the mutation hook?** `useMutation`'s `isPending` reflects only the most-recent call on that hook instance. With rapid calls, it drops to `false` when the first call resolves, even if subsequent calls are still in-flight. A ref counter is reliable across all concurrent calls.

## Companion rules (learned when porting the pattern to the Ayah detail screen)

1. **Operation-scoped rollback, never full-snapshot rollback.** On mutation error, undo only that tap's delta against the *latest* local state. Restoring a full pre-tap snapshot lets an older failing request revert newer successful taps (lost update).
2. **Read toggle decisions from a ref mirror, not the render closure.** Keep a `localMarksRef` updated in lockstep with the state; rapid taps within one render otherwise all see the same stale set and make wrong add/remove decisions.
3. **Force re-seed on identity change.** When the screen navigates to a different ayah/page, reset `pendingMarkCount` to 0 and seed unconditionally — otherwise pending mutations from the previous item block seeding and its marks bleed onto the new one.

## Where this applies in the codebase

- `artifacts/quran-tracker/src/pages/reader.tsx` — `persistAdd`, `persistRemove`, and the seed `useEffect` (watches `activeMistakes`).
- `artifacts/quran-tracker/src/pages/ayah-detail.tsx` — `setMark`, `localMarksRef`, seed effect keyed by `globalAyahNumber`.
