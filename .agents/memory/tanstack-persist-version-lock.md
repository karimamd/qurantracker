---
name: TanStack persist packages must version-lock to react-query
description: A query-core version split makes the persister operate on a different Query/QueryClient class than the app, silently breaking restore.
---

`@tanstack/react-query`, `@tanstack/react-query-persist-client`, and
`@tanstack/query-sync-storage-persister` each depend on `@tanstack/query-core`.
Caret ranges in the pnpm catalog let them drift onto *different* query-core
builds. When that happens the persister's `dehydrate`/`hydrate` work against
a different `Query`/`QueryClient` class than the app instantiates.

**Symptoms:** cache restore silently no-ops (data looks like it was never
persisted), and TypeScript reports the two `Query` types as incompatible
because of their private fields — an error mentioning two different
`node_modules/.pnpm/@tanstack+query-core@<x>` paths is the tell.

**The rule:** pin all three to the same version in the workspace catalog and
verify with `node -e "require('<pkg>/package.json').version"` per package
after install — the catalog range alone does not guarantee it, since pnpm
can satisfy each range with a different resolution.

**How to apply:** when touching React Query persistence, check resolution
first. Also prefer declaring predicates like `shouldDehydrateQuery` against a
locally-declared structural subset (`{ queryKey, state: { status, data } }`)
rather than importing the `Query` type, so the code stays assignable even if
the versions drift again.
