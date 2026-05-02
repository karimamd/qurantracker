# Authentication

The app uses [Clerk](https://clerk.com) for authentication. Clerk is a hosted identity provider — users sign in with email + password, Google, or other social providers; we never store passwords ourselves.

## Frontend (`@clerk/react`)

Configured in `artifacts/quran-tracker/src/App.tsx`:

```tsx
<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
  <QueryClientProvider client={queryClient}>
    <Router base={basePath}>
      <ProtectedApp />
    </Router>
  </QueryClientProvider>
</ClerkProvider>
```

- **`ClerkProvider`** wraps the entire app. It manages the session in cookies and exposes hooks (`useUser`, `useAuth`, etc).
- **`SignIn` / `SignUp`** are hosted Clerk components rendered at `/sign-in/*` and `/sign-up/*`. We use `routing="path"` with the `nest` modifier so Clerk's verification subpaths (`/sign-in/factor-one`, `/sign-up/verify`, etc.) match.
- **`<SignedIn>` / `<SignedOut>`** gate render trees: signed-out users see the marketing landing page; signed-in users see the app shell.
- **`<UserButton />`** (in `components/layout.tsx`) provides the avatar + sign-out menu.

The Clerk publishable key (`VITE_CLERK_PUBLISHABLE_KEY`) is exposed to the browser at build time. Development uses a Clerk test instance (key prefix `pk_test_`). Production uses a separate live instance.

## Backend (`@clerk/express`)

Configured in `artifacts/api-server/src/app.ts`:

```ts
import { clerkMiddleware } from "@clerk/express";

app.use(pinoHttp(...));
app.use(clerkMiddleware());
app.use("/api", router);                 // requireAuth is applied per-route inside the routers
```

- **`clerkMiddleware()`** parses the session cookie and populates `getAuth(req)`.
- **`requireAuth`** (`src/middlewares/requireAuth.ts`) is applied to every protected route (i.e. everything except `/healthz`). It:
  1. Reads `getAuth(req)` and extracts `userId`.
  2. Returns `401 { error: "Unauthorized" }` if no userId.
  3. Sets `req.userId` for downstream handlers.
  4. (One-shot) attempts an orphan claim — see below.

```ts
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
```

This `userId` is what every route handler uses in its `where` clause to scope queries to the authenticated user.

## Same-origin auth via the proxy

Both the SPA and the API are reached through the **same Replit proxy origin**. That means:

- Clerk sets its session cookie on the proxy origin (e.g. `https://qurantracker.replit.app`).
- When the SPA does `fetch("/api/progress/overview")`, the browser includes that cookie automatically.
- No `Authorization` header, no token-passing in JS — Clerk's middleware on the server reads the cookie directly.

This avoids both CORS and the third-party-cookie issues that come with a separately-hosted API origin.

The `clerkProxyMiddleware` proxies a small set of Clerk frontend assets through the API origin so the SPA never has to load anything cross-origin from `clerk.com`.

## Orphan claim (legacy data migration)

This app was originally a single-user system before Clerk was added. Existing rows in the database have `user_id IS NULL`. The first signed-in request from the **owner** (identified by `OWNER_EMAIL`) reassigns those NULL rows to the owner's Clerk userId in a single batch update.

```ts
// requireAuth.ts (simplified)
const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "").toLowerCase();
let orphansClaimed = false;

async function maybeClaimOrphansForUser(userId, log) {
  if (orphansClaimed) return;
  if (!OWNER_EMAIL) return;
  const user = await clerkClient.users.getUser(userId);
  const email = user.primaryEmailAddress?.toLowerCase();
  if (email !== OWNER_EMAIL) return;     // never claim for anyone else
  orphansClaimed = true;
  // UPDATE … SET user_id = <userId> WHERE user_id IS NULL
}
```

Properties:

- **One-shot per process.** After the first successful claim there are no NULL rows left, so subsequent restarts are no-ops.
- **Owner-gated.** Other users — even if they sign in before the owner — never claim orphans.
- **Cache of non-owner userIds** is kept in memory so we don't hit the Clerk users API repeatedly.

If you fork this project for your own use, set `OWNER_EMAIL` to your Clerk account's primary email so your existing data (if any) gets claimed on first sign-in. For a fresh deployment with no NULL rows, leaving `OWNER_EMAIL` unset is fine — the claim is a no-op.

## Environment variables

| Variable | Where it's read | Purpose |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Vite build (`artifacts/quran-tracker`) | Clerk frontend SDK init key. Safe to ship to the browser. |
| `CLERK_SECRET_KEY` | API server | Clerk backend SDK auth (token verification, user lookups). Server-only secret. |
| `CLERK_PUBLISHABLE_KEY` | API server (some flows) | Same value as the Vite var; required by the Express SDK. |
| `OWNER_EMAIL` | API server `requireAuth` | Email of the legacy single-user owner. Used only for the orphan claim. |

In Replit these are managed via the secrets pane (server-only) or `[userenv]` in `.replit` (build-time, like `VITE_*`).

## Testing with Clerk

The `runTest()` testing harness can sign in programmatically without going through the Clerk UI. Pass `testClerkAuth: true` and use `[Clerk Auth]` test plan steps:

```js
await runTest({
  testClerkAuth: true,
  testPlan: `
    [New Context] Create a new browser context.
    [Clerk Auth] Sign in as { firstName: "Test", lastName: "User", email: "test@example.com" }.
    [Browser] Navigate to "/dashboard".
    [Verify] data-testid="dashboard-page" is present.
  `,
});
```

See `.local/skills/testing/clerk-auth.md` for details.

## Common auth pitfalls

- **`clerkMiddleware` runs before `requireAuth`.** Don't return 401 from `requireAuth` based on a missing cookie alone — Clerk's middleware needs to run first to populate `getAuth(req)`.
- **Always include `userId` in every `where` clause.** Forgetting it would expose other users' data even with auth enabled. Code review explicitly checks for this on new endpoints.
- **The publishable key starts with `pk_test_` in dev / `pk_live_` in prod.** Mixing them up is the #1 cause of "redirect loop" bugs.
- **Sign-in/sign-up routes need `nest`.** Use `<Route path="/sign-in" nest component={SignInPage} />` so Clerk's internal verification routes match.
