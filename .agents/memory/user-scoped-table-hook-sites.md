---
name: New user-scoped tables have mandatory hook sites
description: Any new user-scoped table or settings column must be wired into backup export/import/wipe AND guest→account migration/orphan claim.
---

The app has two whole-account data contracts that silently drop data if a new user-scoped table is left out:

1. **Backup** — full export/wipe/replace of all user data. New tables need: export payload, import zod schema (optional/default for old files), wipe order, insert phase (id remap if referenced).
2. **Guest→account migration + owner orphan claim** (auth middleware) — signing in moves all guest rows to the new user. Unmigrated tables strand guest data forever. Tables with user-scoped unique keys need a collision policy (signed-in user's row wins: delete colliding guest rows, then update the rest).

**Why:** the reward system shipped missing both and was rejected in review twice — once per contract.

**How to apply:** treat any table with a `userId` column, and any new settings column, as requiring edits at both hook sites in the same change.
