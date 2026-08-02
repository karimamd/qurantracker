---
name: Server-backed settings need a synchronous first-paint mirror
description: Why UI settings that live on the server must also be mirrored in localStorage, and why that mirror must be stamped with the owning identity.
---

Settings that affect first paint (reader/ayah font size, bottom-nav order)
live on the server behind `GET /api/settings`. Components seed `useState`
with hardcoded defaults and correct themselves in an effect once the query
resolves. On a mobile tab that was unloaded and reloaded, that means the
user sees defaults first — and if the request is slow, offline, or fails,
they stay on defaults indefinitely. This is what users report as "the font
keeps resetting itself".

**The rule:** anything that must be right on the *first* rendered frame
needs a synchronous localStorage mirror read via a lazy `useState`
initializer. The server stays the source of truth and overwrites the mirror
whenever fresh data arrives; the mirror only removes the blank/default
window. (`i18n` language already followed this pattern — it was the
precedent worth copying.)

**Stamp the mirror with its owning identity.** Consumers read the mirror
during *render*, but cache clearing on an account switch necessarily runs
later in an effect. Without an identity stamp, signing in as a different
user paints that session with the previous user's preferences, and a slow
`/api/settings` leaves it that way. Storing `{ identity, settings }` and
returning empty on mismatch makes the leak impossible by construction
rather than dependent on effect ordering.

**How to apply:** keep the payload tiny and non-sensitive — first-paint
state only, never anything private. Clamp/validate values on read so a
corrupt entry cannot render something absurd. Reading `userId` during
render is safe here because protected routes are already gated behind an
`isLoaded` check, so Clerk has settled before those pages mount.
