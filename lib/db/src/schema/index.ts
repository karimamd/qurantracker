/**
 * Drizzle table re-exports for the @workspace/db package.
 *
 * One file per logical table; this barrel is what api-server imports from.
 * Each table file owns its own Zod insert schema + inferred TS types.
 *
 * Schema-level conventions enforced across every table:
 *   - `userId text("user_id")` is the multi-tenant scope key (Clerk user id
 *     or `guest_<id>` from middlewares/requireAuth.ts). Every query in
 *     api-server MUST filter by it — there is no row-level security.
 *   - Timestamps are `timestamp(..., { withTimezone: true })` so UTC stays
 *     unambiguous across server/client boundaries.
 *   - Unique/composite indexes are spelled out in `(table) => ({...})`;
 *     if you add one, also bump the migration via drizzle-kit.
 *
 * Business-logic context for each table lives in `docs/business-logic.md`.
 */
export * from "./settings";
export * from "./page-progress";
export * from "./recitation-log";
export * from "./homework";
export * from "./ayah-mistakes";
export * from "./telawa";
export * from "./telawa-khatmah";
export * from "./telawa-scope";
