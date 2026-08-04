---
name: Clerk hydration, identity boundaries, and cache namespacing
description: Why identity logic must gate on isLoaded, and why the app uses per-identity namespaced caches instead of wiping caches on identity changes.
---

On every page load Clerk momentarily reports `user: null` while it hydrates,
then resolves the real session. Any identity logic must therefore gate on
`isLoaded` — anything keyed off the transient null→user flip fires on every
single load.

**The rule (current design):** the React Query cache is persisted per
identity (`qurantracker.querycache.v3.<identity>`), and
`IdentityPersistGate` (App.tsx) remounts `PersistQueryClientProvider` keyed
on the settled identity. On an identity CHANGE within one runtime, the gate
holds a loading screen, clears the in-memory `queryClient` (privacy
boundary), then mounts the new identity's provider. Persisted namespaces on
disk are never wiped on transitions — only explicit sign-out removes the
previous user's namespace, detected centrally via Clerk setting the
JS-readable `__client_uat` cookie to `"0"`.

**Why:** two failure modes taught this. (1) A cache-invalidator that treated
Clerk's null→user hydration as a user switch cleared the cache on every
load; once persistence was added, the throttled persister wrote that empty
cache back to storage and mobile users lost everything with no recovery by
refresh. (2) A dead session flips identity user→guest for the *same person*
— wiping on that transition destroys the data they expect back after
re-login, and lets guest-shaped responses overwrite the persisted cache.

**How to apply:**
- Never clear caches because the settled identity merely changed; namespace
  by identity instead.
- Distinguish explicit sign-out (`__client_uat === "0"`, plus a one-shot
  keep-cache flag for recovery-driven sign-outs) from session expiry.
- Don't put cleanup hooks on individual sign-out buttons: Clerk's
  `UserButton` has its own sign-out path that bypasses them. Centralize
  detection in the identity gate.
- When removing a persisted namespace, defer past the persister's
  `throttleTime` (1 s) so a pending flush can't re-write the key.
