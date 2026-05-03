# Contributing

Welcome! This is a personal project, but external contributions are genuinely appreciated — bug reports, small focused PRs, and documentation improvements especially. The bar to your first contribution should be low: if something in the docs is unclear, that itself is a bug worth fixing.

## New here? Start with these

If this is your first time looking at the repo, you'll get oriented fastest by reading in this order:

1. The repo [README](../README.md) — one-page overview of the stack, the artifacts, and the conventions you'll bump into.
2. [Architecture](./architecture.md) — what each folder is and how the pieces talk to each other.
3. [Data Flow](./data-flow.md) — a single request walked end-to-end (UI → hook → Express → Drizzle → Postgres → back).
4. [Business Logic](./business-logic.md) — the *why* behind the spaced-repetition rules, scope, streak, homework, and undo behavior.

You don't need to read everything before opening a PR — just the area you're touching. The docs are organized as a "jump in where you need it" reference, not a tutorial you have to finish.

### Good first contributions

- **Fix something in the docs** that confused you. Even a single sentence rewrite is welcome.
- **Add a missing translation key** — search for an English string in `artifacts/quran-tracker/src/i18n/en.json` that has no Arabic counterpart in `ar.json`, or vice-versa.
- **Improve a `data-testid`** on an interactive element so the testing harness can target it more reliably.
- **Tighten a type** — replace any lingering `any` or implicit `unknown` with a proper type.

For larger changes (new endpoints, schema changes, new pages), please open an issue first so we can sanity-check the design together. A 5-line clarification beats a rejected 500-line PR.

## Before you start

1. **Read [`development.md`](./development.md)** — get a working dev environment first.
2. **Skim [`architecture.md`](./architecture.md) and [`data-flow.md`](./data-flow.md)** — most edits touch more than one layer (OpenAPI + server + client) and the docs explain the wiring.
3. **Open an issue first** for non-trivial changes. A 5-line clarification beats a rejected 500-line PR.

## Branching and commits

- Branch from `main`. Use a short prefix: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`.
  ```bash
  git switch -c feat/surah-bookmarks
  ```
- Keep commits focused. A commit that touches the OpenAPI spec, server route, generated files, and React hook is fine — that's one logical change. Squashing several unrelated changes into one commit is not.
- Write commit messages in the imperative present: `Add surah bookmark endpoint`, not `Added` or `Adds`.

## End-to-end checklist for a typical feature

A typical feature touches 3–5 layers. Here's the canonical sequence — skip any step that doesn't apply.

1. **Update the OpenAPI spec** (`lib/api-spec/openapi.yaml`).
   - Add or modify the path, parameters, request body, response schema, and `operationId`.
   - The `operationId` becomes the React Query hook name (`use<OperationId>`) and the Zod schema names (`<OperationId>Params`, `<OperationId>Body`, `<OperationId>Response`).
2. **Regenerate** the client and schemas.
   ```bash
   pnpm --filter @workspace/api-spec run codegen
   ```
3. **Build the libs** so artifacts can pick up the new types.
   ```bash
   pnpm run typecheck:libs
   ```
4. **Update the database schema** if needed (`lib/db/src/schema/*.ts`), then push:
   ```bash
   pnpm --filter db push
   ```
5. **Implement the server route** under `artifacts/api-server/src/routes/`.
   - Validate inputs with the new Zod schemas.
   - Always filter Drizzle queries by `req.userId`.
   - Use `req.log`, never `console.log`.
   - For multi-step writes that update derived state, wrap them in a transaction and use `SELECT ... FOR UPDATE` to avoid races.
   - Validate the response shape with `<OperationId>Response.parse(...)` before returning.
6. **Restart the API server workflow** so the changes take effect.
7. **Implement the React UI**.
   - Use the generated hook (`use<OperationId>`) — don't hand-write `fetch`.
   - For mutations, invalidate every relevant query key in `onSuccess` (or use a predicate for per-id detail keys).
   - Add `data-testid` attributes to interactive elements so the testing harness can target them. Use stable English values so they don't depend on the active language.
   - **Localize every user-facing string.** Add the key to both `artifacts/quran-tracker/src/i18n/en.json` and `ar.json`. For counts, English needs `_one`/`_other`; Arabic needs `_zero`/`_one`/`_two`/`_few`/`_many`/`_other`. Prefer Tailwind logical-property utilities (`ms-*`, `me-*`, `text-end`, `start-*`, `end-*`) so layouts mirror in RTL. See [Components — i18n](./components.md#internationalization-i18n).
8. **Run the canonical typecheck**.
   ```bash
   pnpm run typecheck
   ```
9. **Run an end-to-end test**. Use `runTest({ testClerkAuth: true, testPlan: ... })` with a plan that exercises the happy path and at least one edge case. See `.local/skills/testing/clerk-auth.md`.
10. **Code review**. For non-trivial changes, ask the architect skill for a review (`architect({ task, relevantFiles, includeGitDiff: true })`) and address its findings.
11. **Update docs**. Touch every `docs/*.md` file that mentions the area you changed. Update `replit.md` for anything architecturally significant.
12. **Open the PR** with a description that explains *why*, links any issue, and lists the layers touched (DB, API, generated, server, client).

## Code style

- **TypeScript everywhere.** Strict mode is on. Don't use `any`; prefer `unknown` and narrow.
- **No comments** unless they explain a non-obvious *why* (e.g. "Lock the page row to serialize concurrent undos"). Code that needs a comment to explain *what* it does should be rewritten to be clearer.
- **Functional React.** Hooks-only, no class components.
- **Tailwind-first styling.** Reach for raw CSS only when Tailwind utilities don't compose. Custom CSS goes in `index.css`.
- **Small files, focused responsibilities.** A 600-line page is a sign it should be split into sub-components.
- **No silent fallbacks.** Throw or return errors; don't quietly substitute defaults that hide bugs.

## Testing expectations

- **End-to-end:** every UI change should be exercised by `runTest()`. The harness signs in via Clerk programmatically, navigates the app, and verifies behaviour.
- **Manual smoke testing:** for a backend-only change, `curl` the endpoint through the proxy (`localhost:80/api/...`) to confirm it returns the expected status.
- **Unit tests:** there isn't a unit test suite at the moment. If you introduce one, put it under the package that owns the code being tested.

## Things to be careful about

These are real footguns we've hit:

- **Forgetting `userId` in a `where` clause.** Trivially exposes other users' data. Code review will flag this; please check it yourself first.
- **Hand-editing generated files.** They'll be overwritten on the next codegen run and any PR that includes them will be rejected.
- **`path="/:rest*"` in wouter.** Use `path="*"`. The other form silently fails on multi-segment routes (we have a regression test in `scripts/`).
- **Long-running mutations without a transaction.** Concurrent writes to the same row will produce stale state. Wrap multi-step writes in `db.transaction(...)` and `SELECT ... FOR UPDATE` the row you'll modify.
- **Pushing schema to dev but not prod.** A deploy that depends on a new column will crash with `relation does not exist`. Push prod schema *before* deploying the dependent code.

## Asking for help

Open a GitHub issue for anything: a question, an idea, a bug, or "I read the docs and this part still isn't clicking." There's no template requirement — just write what you'd want to read. Questions are not a tax on the maintainer; unclear documentation is, and your question helps us notice it.

## Reporting bugs

Open a GitHub issue with:

- A short summary in the title.
- Reproduction steps (URL, what you clicked, what happened, what you expected).
- Browser + device if it's a frontend bug.
- A copy of the relevant console or workflow log if you have it.

For security issues — anything that exposes one user's data to another, or any auth bypass — please email the maintainer instead of filing a public issue.

## License

MIT — see [`LICENSE`](../LICENSE) at the repo root. By contributing, you agree that your contributions will be licensed under the same terms.
