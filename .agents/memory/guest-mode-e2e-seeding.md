---
name: Guest-mode e2e seeding
description: How to seed data for e2e tests in the Quran Tracker guest-mode flow
---

The Quran Tracker API (artifacts/api-server) authenticates anonymous users via
an httpOnly `guest_id` cookie minted on the first API request
(`middlewares/requireAuth.ts`). Each browser context gets its own guest id.

**Rule:** in `runTest` plans, seed/setup data with an in-browser `fetch(...)`
inside a `[Browser]` step so it shares the same cookie jar as the rest of the
test. A separate `[API]` step uses a different HTTP client / cookie jar and
will create rows under a *different* guest id, so the UI won't see them.

**Why:** a curl/[API] call returns 200 with empty data because the server
mints a fresh guest on the spot — it looks like it works but the browser's
guest session is a different user.

**How to apply:** to put pages in scope before testing the Telawa cards, run
`fetch('/api/progress/scope', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({pageNumbers:[...]})})`
from a `[Browser]` step after entering guest mode.
