---
name: Clerk hydration emits a null user before the real one
description: Why "did the signed-in user change?" must not be answered from Clerk resource events or an in-memory ref, and how the identity guard is built instead.
---

On every page load Clerk momentarily reports `user: null` while it hydrates,
then resolves the real session. Any listener that watches Clerk resource
events and compares against a `useRef` baseline starting at `undefined`
therefore sees `null -> <user-id>` on **every single load** and reads it as
a user switch.

**The rule:** treat an identity change as real only after `isLoaded` is
true, and compare against a baseline that survives a page reload
(localStorage), not a ref that resets on mount.

**Why:** a cache-invalidator built the naive way called `queryClient.clear()`
on every load. Once React Query cache persistence was added this became
severe: the clear emptied the cache, and the throttled persister then wrote
that empty cache back to storage. Mobile browsers unload backgrounded tabs
and reload on return, so users saw the dashboard and homework go blank —
and because the wiped cache was persisted, refreshing did not recover it.

**How to apply:** when clearing user-scoped client state (query cache,
persisted cache, any localStorage mirror), resolve a single identity string
(`userId ?? (isGuestMode() ? "guest" : "anon")`), gate on `isLoaded`, and
compare against the identity stored from last time. Keep an in-memory
fallback baseline too, so in-session switches are still caught when
localStorage is blocked (Safari private mode). Genuine transitions —
sign-out, A -> B, guest -> account, session expiry — all still clear
because the resolved identity genuinely differs.
