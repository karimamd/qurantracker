import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect, Link } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import Layout from "@/components/layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { useTranslation } from "react-i18next";
import { useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { setLanguage, type SupportedLanguage } from "@/i18n";
import Dashboard from "@/pages/dashboard";
import JuzList from "@/pages/juz-list";
import JuzDetail from "@/pages/juz-detail";
import Rob3List from "@/pages/rob3-list";
import Reader from "@/pages/reader";
import SurahList from "@/pages/surah-list";
import SurahDetail from "@/pages/surah-detail";
import PageList from "@/pages/page-list";
import Recite from "@/pages/recite";
import HomeworkList from "@/pages/homework-list";
import TelawaPage from "@/pages/telawa";
import HomeworkDetail from "@/pages/homework-detail";
import MistakesPage from "@/pages/mistakes";
import SettingsPage from "@/pages/settings-page";
import NotFound from "@/pages/not-found";
import { BookOpen, ArrowRight } from "lucide-react";
import { enterGuestMode, isGuestMode } from "@/lib/guest-mode";

const queryClient = new QueryClient();

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
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const handleTryAsGuest = () => {
    enterGuestMode();
    setLocation("/dashboard");
  };
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-background via-card to-[hsl(168_25%_94%)]">
      <header className="px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <img src={`${basePath}/logo.svg`} alt="Logo" className="h-9 w-9" />
          <span className="font-semibold text-foreground text-lg">{t("app.name")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm" data-testid="link-sign-in">{t("auth.signIn")}</Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="link-sign-up">{t("auth.getStarted")}</Button>
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-20 sm:pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-medium px-3 py-1 rounded-full mb-6">
          <BookOpen className="w-3.5 h-3.5" />
          {t("landing.badge")}
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold text-foreground tracking-tight mb-4">
          {t("landing.title")}
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
          {t("landing.subtitle")}
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <Button
            size="lg"
            variant="outline"
            onClick={handleTryAsGuest}
            data-testid="cta-try-guest"
            className="border-primary text-primary hover:bg-primary/10"
          >
            {t("landing.tryGuest")} <ArrowRight className="w-4 h-4 ml-2 rtl:rotate-180" />
          </Button>
          <Link href="/sign-up">
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto" data-testid="cta-sign-up">
              {t("landing.createAccount")}
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="ghost" data-testid="cta-sign-in">{t("auth.signIn")}</Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mt-6 max-w-md mx-auto">
          {t("landing.guestNote")}
        </p>
      </main>
    </div>
  );
}

/** Sync the user's persisted language preference into i18n + <html dir/lang>. */
function LanguageSync() {
  const { isLoaded, isSignedIn } = useAuth();
  const enabled = isLoaded && (isSignedIn || isGuestMode());
  const { data: settings } = useGetSettings({ query: { enabled, queryKey: getGetSettingsQueryKey() } });
  useEffect(() => {
    const lang = settings?.language;
    if (lang === "en" || lang === "ar") {
      setLanguage(lang as SupportedLanguage);
    }
  }, [settings?.language]);
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
  if (!isLoaded) return <AuthLoadingScreen />;
  if (!isSignedIn && !isGuestMode()) return <Redirect to="/" />;
  return (
    <Layout>
      <LanguageSync />
      <ErrorBoundary>
        <Switch>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/juz" component={JuzList} />
          <Route path="/juz/:id" component={JuzDetail} />
          <Route path="/rub" component={Rob3List} />
          <Route path="/surah" component={SurahList} />
          <Route path="/surah/:id" component={SurahDetail} />
          <Route path="/pages" component={PageList} />
          <Route path="/reader" component={Reader} />
          <Route path="/reader/:page" component={Reader} />
          <Route path="/recite" component={Recite} />
          <Route path="/homework" component={HomeworkList} />
          <Route path="/homework/:id" component={HomeworkDetail} />
          <Route path="/telawa" component={TelawaPage} />
          <Route path="/mistakes" component={MistakesPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </Layout>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

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
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <ErrorBoundary>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in" nest component={SignInPage} />
              <Route path="/sign-up" nest component={SignUpPage} />
              <Route path="*" component={ProtectedApp} />
            </Switch>
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
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
