---
name: Never silently demote a lapsed session to guest
description: requireAuth returns 401 when __client_uat shows a prior session; minting a guest for a stale signed-in request causes silent data loss client-side.
---

`requireAuth` (api-server) treats a request as guest whenever Clerk yields no
session. That is correct only for genuine visitors. A signed-in user whose
session lapsed (phone parked, token expired, server cold-start) still
carries a non-zero `__client_uat` cookie — for those requests the middleware
returns **401 session_expired** instead of minting a fresh guest.

**Why:** silently minting a guest made every endpoint return empty guest
data with HTTP 200. The client then rendered an empty app with default
settings and persisted that guest-shaped empty state over the user's cached
data. Refresh kept hitting the dead session (still guest, still empty); only
manual sign-out/in recovered — the exact symptoms the user reported three
times.

**How to apply:** any new auth middleware or fallback path must treat
"__client_uat present and != 0" as a lapsed session, not an anonymous
visitor. Clerk sets `__client_uat=0` on explicit sign-out, so genuinely
signed-out visitors still reach the guest path. Client-side, 401s from the
app API (excluding /__clerk) dispatch `qurantracker:unauthorized`, handled
by SessionRecoveryHandler (reload once per 60 s, then recovery sign-out to
/sign-in with a keep-cache flag).
