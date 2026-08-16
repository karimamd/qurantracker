/**
 * Top-level SPA shell.
 *
 * Responsibilities:
 *   - Wire wouter routing under the artifact's base path (Vite BASE_URL),
 *     which differs in dev vs deployment.
 *   - Configure ClerkProvider with appearance + per-host publishableKey.
 *     The proxyUrl env var is set in production so Clerk Frontend API
 *     traffic flows through /api/__clerk on our domain (see
 *     artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts).
 *   - Provide React Query and a Toaster.
 *   - Gate routes:
 *       /                 → Landing OR redirect to /dashboard if signed in
 *                           OR a guest session exists (lib/guest-mode.ts)
 *       /sign-in, /sign-up→ Clerk-hosted forms
 *       everything else   → ProtectedApp (Layout + page routes)
 *   - SettingsSync pushes saved settings where they're needed before the
 *     network answers: language into the i18n runtime, and font sizes +
 *     bottom-nav order into a synchronous localStorage mirror so a reloaded
 *     mobile tab paints the user's preferences instead of defaults.
 *   - IdentityPersistGate mounts a per-identity persisted React Query cache
 *     (qurantracker.querycache.v3.<identity>). A dead Clerk session makes
 *     the identity flip to guest/anon — the same person — so the user's
 *     cache must NOT be wiped; namespacing isolates identities on disk
 *     without any destructive clears.
 *   - SessionRecoveryHandler listens for API 401s (server reports the
 *     session expired) and automates the user's old manual workaround:
 *     reload once, and if the session is still rejected, sign out locally
 *     and land on the sign-in page.
 */
import { useEffect, useRef, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { setLanguage, type SupportedLanguage } from "@/i18n";
import Dashboard from "@/pages/dashboard";
import JuzList from "@/pages/juz-list";
import JuzDetail from "@/pages/juz-detail";
import Rob3List from "@/pages/rob3-list";
import Reader from "@/pages/reader";
import { usePrefetchAllPages } from "@/hooks/use-prefetch-all-pages";
import SurahList from "@/pages/surah-list";
import SurahDetail from "@/pages/surah-detail";
import PageList from "@/pages/page-list";
import AyahsList from "@/pages/ayahs-list";
import AyahDetail from "@/pages/ayah-detail";
import Recite from "@/pages/recite";
import HomeworkList from "@/pages/homework-list";
import TelawaPage from "@/pages/telawa";
import RewardsPage from "@/pages/rewards";
import HomeworkDetail from "@/pages/homework-detail";
import MistakesPage from "@/pages/mistakes";
import SettingsPage from "@/pages/settings-page";
import Welcome from "@/pages/welcome";
import NotFound from "@/pages/not-found";
import { isGuestMode } from "@/lib/guest-mode";
import { queryClient } from "@/lib/query-client";
import {
  createIdentityPersister,
  purgeLegacyPersistedCaches,
  removePersistedCache,
  shouldPersistQuery,
} from "@/lib/query-persister";
import { writeCachedUiSettings, resolveIdentity } from "@/lib/ui-settings-cache";

// Drop any cache written by the previous persistence schemes. The v1/v2
// blobs were shared across identities: v1 could hold an empty cache written
// by the old clear-on-every-load bug, and v2 could hold guest-shaped empty
// data written during a dead-session window. Restoring either would show a
// blank app that a refresh couldn't fix.
purgeLegacyPersistedCaches();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(173 80% 28%)",
    colorForeground: "hsl(222 47% 11%)",
    colorMutedForeground: "hsl(215 16% 47%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(0 0% 100%)",
    colorInputForeground: "hsl(222 47% 11%)",
    colorNeutral: "hsl(215 28% 90%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.625rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-slate-200",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-900 text-xl font-semibold",
    headerSubtitle: "text-slate-500 text-sm",
    socialButtonsBlockButtonText: "text-slate-700 font-medium",
    formFieldLabel: "text-slate-700 font-medium",
    formFieldInput: "bg-white border-slate-200 text-slate-900",
    footerActionLink: "text-primary hover:opacity-90 font-medium",
    footerActionText: "text-slate-500",
    dividerText: "text-slate-400",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-emerald-600",
    alertText: "text-slate-700",
    logoBox: "h-10",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton: "border-slate-200 hover:bg-slate-50",
    formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground",
    footerAction: "text-slate-500",
    dividerLine: "bg-slate-200",
    alert: "bg-amber-50 border-amber-200",
    otpCodeFieldInput: "border-slate-200 text-slate-900",
    formFieldRow: "",
    main: "gap-4",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-[hsl(40_38%_96%)] via-card to-[hsl(168_25%_94%)] px-4 py-8">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-[hsl(40_38%_96%)] via-card to-[hsl(168_25%_94%)] px-4 py-8">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function Landing() {
  return <Welcome withAuthChrome={true} />;
}

/**
 * Push the user's saved settings into the places that need them before the
 * network can answer:
 *   - language → i18n runtime + <html dir/lang>
 *   - font sizes / bottom-nav order → a small synchronous localStorage
 *     mirror (lib/ui-settings-cache.ts)
 *
 * The mirror is what stops a reloaded tab from rendering default fonts and
 * the default nav order while `GET /api/settings` is still in flight — or
 * indefinitely, if the device came back online slowly.
 */
function SettingsSync() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const enabled = isLoaded && (isSignedIn || isGuestMode());
  const { data: settings } = useGetSettings({ query: { enabled, queryKey: getGetSettingsQueryKey() } });

  useEffect(() => {
    const lang = settings?.language;
    if (lang === "en" || lang === "ar") {
      setLanguage(lang as SupportedLanguage);
    }
  }, [settings?.language]);

  useEffect(() => {
    if (!settings || !isLoaded) return;
    // Stamp the mirror with the identity it belongs to so another account
    // can never read these values back on first paint.
    writeCachedUiSettings(resolveIdentity(userId), {
      readerFontSize: settings.readerFontSize,
      ayahViewFontSize: settings.ayahViewFontSize,
      bottomNavKeys: settings.bottomNavKeys ? [...settings.bottomNavKeys] : undefined,
    });
  }, [settings, isLoaded, userId]);

  return null;
}

function AuthLoadingScreen() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-background via-card to-[hsl(168_25%_94%)]">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <AuthLoadingScreen />;
  if (isSignedIn || isGuestMode()) return <Redirect to="/dashboard" />;
  return <Landing />;
}

function ProtectedApp() {
  const { isLoaded, isSignedIn } = useAuth();
  usePrefetchAllPages();
  if (!isLoaded) return <AuthLoadingScreen />;
  if (!isSignedIn && !isGuestMode()) return <Redirect to="/" />;
  return (
    <Layout>
      <SettingsSync />
      <ErrorBoundary>
        <Switch>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/welcome">{() => <Welcome withAuthChrome={false} />}</Route>
          <Route path="/juz" component={JuzList} />
          <Route path="/juz/:id" component={JuzDetail} />
          <Route path="/rub" component={Rob3List} />
          <Route path="/surah" component={SurahList} />
          <Route path="/surah/:id" component={SurahDetail} />
          <Route path="/pages" component={PageList} />
          <Route path="/ayahs" component={AyahsList} />
          <Route path="/ayahs/:globalAyahNumber" component={AyahDetail} />
          <Route path="/reader" component={Reader} />
          <Route path="/reader/:page" component={Reader} />
          <Route path="/recite" component={Recite} />
          <Route path="/homework" component={HomeworkList} />
          <Route path="/homework/:id" component={HomeworkDetail} />
          <Route path="/telawa" component={TelawaPage} />
          <Route path="/rewards" component={RewardsPage} />
          <Route path="/mistakes" component={MistakesPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </Layout>
  );
}

/**
 * The last identity that mounted the app, remembered across reloads. Used
 * ONLY to detect that an explicit sign-out happened while the app was away
 * — never as a trigger to wipe caches (a dead session must keep its data).
 */
const LAST_IDENTITY_KEY = "qurantracker.lastIdentity";
/**
 * Set by SessionRecoveryHandler when IT performs a sign-out because the
 * session is unrecoverable. Tells the gate to keep the user's persisted
 * namespace: that sign-out is a session-repair measure, not the user
 * choosing to leave, so their cache must be waiting when they sign back in.
 */
const KEEP_CACHE_KEY = "qurantracker.keepCacheAfterSignOut";
let inMemoryLastIdentity: string | null = null;

/**
 * Clerk sets the JS-readable `__client_uat` cookie to "0" on explicit
 * sign-out. A session that merely expired keeps its last timestamp value,
 * which is how we tell "user chose to sign out" (remove their persisted
 * cache, privacy on shared devices) apart from "session died" (keep it).
 */
function wasExplicitSignOut(): boolean {
  try {
    const match = document.cookie.match(/(?:^|;\s*)__client_uat=([^;]*)/);
    return match ? decodeURIComponent(match[1]) === "0" : false;
  } catch {
    return false;
  }
}

/**
 * Mount a per-identity persisted React Query cache.
 *
 * The app waits for Clerk to settle, computes a stable identity string, and
 * mounts PersistQueryClientProvider keyed on it. Each identity gets its own
 * localStorage namespace, so:
 *
 *   - A session expiring on a parked phone (identity flips user → guest)
 *     never touches the user's saved cache — signing back in remounts the
 *     user's namespace and their data is instantly there again.
 *   - A guest or a different account mounts a different namespace and can
 *     never read the previous user's persisted data.
 *   - An EXPLICIT sign-out (any path — custom button or Clerk UserButton)
 *     is detected here via __client_uat=0 and removes the previous user's
 *     namespace, so no cleanup hook on individual buttons is needed.
 *
 * IN-MEMORY BOUNDARY
 * ------------------
 * Storage namespacing alone is not enough: the singleton queryClient would
 * otherwise keep the previous identity's data in memory across the remount
 * and serve it to the new identity before refetch (privacy leak on shared
 * devices). So on every identity CHANGE we hold a loading screen, clear the
 * in-memory cache (queries + pending mutations), and only then mount the
 * new identity's provider. The first mount of the session clears nothing.
 *
 * Gating the whole tree on `isLoaded` also guarantees cache restore
 * completes before any query can fire, removing the old restore/fetch race.
 */
function IdentityPersistGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const identity = isLoaded ? resolveIdentity(userId) : null;
  // Which identity the in-memory cache currently belongs to.
  const [cacheReadyFor, setCacheReadyFor] = useState<string | null>(null);
  const cacheOwnerRef = useRef<string | null>(null);

  useEffect(() => {
    if (!identity) return;

    // Baseline from previous loads (in-memory ref resets on reload).
    let previous: string | null = inMemoryLastIdentity;
    try {
      previous = window.localStorage.getItem(LAST_IDENTITY_KEY) ?? inMemoryLastIdentity;
    } catch {
      /* keep the in-memory baseline */
    }

    // One-shot flag: a recovery-driven sign-out must keep the user's cache.
    let keepCache = false;
    try {
      keepCache = window.localStorage.getItem(KEEP_CACHE_KEY) === "1";
      if (keepCache) window.localStorage.removeItem(KEEP_CACHE_KEY);
    } catch {
      /* ignore */
    }

    // In-memory boundary: on identity change, drop the previous identity's
    // queries and pending mutations before the new provider mounts.
    if (cacheOwnerRef.current !== null && cacheOwnerRef.current !== identity) {
      queryClient.clear();
    }
    cacheOwnerRef.current = identity;
    setCacheReadyFor(identity);

    // Explicit sign-out cleanup: the previous visitor was a signed-in user
    // who CHOSE to sign out — remove their persisted namespace so nobody
    // else on this device can restore it. Deferred past the persister's 1 s
    // throttle window so a pending flush can't re-write the key afterwards.
    // Session expiry (uat != 0) and recovery sign-outs (keepCache) skip
    // this — the same person is coming back.
    if (
      previous !== null &&
      previous !== identity &&
      previous.startsWith("user_") &&
      !keepCache &&
      wasExplicitSignOut()
    ) {
      const doomed = previous;
      setTimeout(() => removePersistedCache(doomed), 1200);
    }

    inMemoryLastIdentity = identity;
    try {
      window.localStorage.setItem(LAST_IDENTITY_KEY, identity);
    } catch {
      /* ignore */
    }
  }, [identity]);

  if (!identity || cacheReadyFor !== identity) return <AuthLoadingScreen />;

  return (
    <PersistQueryClientProvider
      key={identity}
      client={queryClient}
      persistOptions={{
        persister: createIdentityPersister(identity),
        // Keep persisted data for up to 7 days — matches the queryClient's
        // gcTime so nothing is evicted from storage before memory would
        // drop it.
        maxAge: 7 * 24 * 60 * 60 * 1000,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

/**
 * React to the server reporting an expired session (API 401).
 *
 * This automates the workaround users discovered by hand: reload, and if
 * that doesn't heal the session, sign out and sign back in.
 *
 *   - First 401 while Clerk believes we're signed in: hard-reload once
 *     (a fresh page makes Clerk refresh its token and warms a cold-started
 *     server). Rate-limited to one reload per 60 s so a persistently dead
 *     session can't loop.
 *   - Another 401 inside that window: the session is truly dead — sign out
 *     locally and land on /sign-in, exactly the manual flow that always
 *     recovered things.
 *   - 401 while signed out: just go to /sign-in.
 */
const RELOAD_GUARD_KEY = "qurantracker.authReloadAt";
// In-memory fallback for the reload guard. sessionStorage can be blocked
// (private mode, strict storage settings); without a durable guard every
// signed-in 401 would trigger a fresh reload and loop. The in-memory value
// doesn't survive a reload, but it still breaks reload loops WITHIN one
// page lifetime, and the 60 s window bounds the cross-reload case.
let inMemoryLastAuthReloadAt = 0;

function SessionRecoveryHandler() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoaded) return;

    const onUnauthorized = () => {
      if (!isSignedIn) {
        setLocation("/sign-in");
        return;
      }
      let lastReloadAt = inMemoryLastAuthReloadAt;
      try {
        lastReloadAt = Math.max(
          lastReloadAt,
          Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0),
        );
      } catch {
        /* keep the in-memory value */
      }
      const now = Date.now();
      if (now - lastReloadAt > 60_000) {
        inMemoryLastAuthReloadAt = now;
        try {
          window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
        } catch {
          /* ignore */
        }
        window.location.reload();
        return;
      }
      // Reload didn't heal it — do what the user used to do manually.
      // This sign-out is session repair, not the user leaving: flag it so
      // the identity gate keeps their persisted cache for their return.
      try {
        window.localStorage.setItem(KEEP_CACHE_KEY, "1");
      } catch {
        /* ignore */
      }
      void signOut({ redirectUrl: `${basePath}/sign-in` });
    };

    window.addEventListener("qurantracker:unauthorized", onUnauthorized);
    return () => window.removeEventListener("qurantracker:unauthorized", onUnauthorized);
  }, [isLoaded, isSignedIn, signOut, setLocation]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to continue your memorization",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Begin tracking your Quran memorization",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <IdentityPersistGate>
        <SessionRecoveryHandler />
        <TooltipProvider>
          <ErrorBoundary>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="*" component={ProtectedApp} />
            </Switch>
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </IdentityPersistGate>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
