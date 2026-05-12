/**
 * App chrome shared by every authenticated page.
 *
 * Three responsive surfaces:
 *   - md+ desktop: persistent left sidebar with the full nav list and the
 *     auth footer (Clerk UserButton or guest CTA).
 *   - <md mobile: top header (app name + UserButton/sign-up + burger) plus
 *     a fixed bottom nav showing the five most-used screens. The burger
 *     opens a drawer with the FULL nav list (kept in sync via navItems).
 *   - Guest banner: amber strip on top of <main> when isGuestMode() is on
 *     and Clerk says signed-out — converts guests via /sign-up.
 *
 * Sign-out path always invalidates the React Query cache (via the global
 * ClerkQueryClientCacheInvalidator in App.tsx for sign-out, and
 * `queryClient.clear()` here for guest exit) so the next user's data starts
 * cold.
 */
import { Link, useLocation } from "wouter";
import { LayoutDashboard, BookOpen, BookMarked, Layers, Grid3x3, FileText, PenLine, ClipboardList, Settings, LogOut, UserPlus, Info, AlertTriangle, Repeat, Sparkles, Compass, WifiOff } from "lucide-react";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { UserButton, useUser, useClerk, useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useGetSettings } from "@workspace/api-client-react";
import { isGuestMode, exitGuestMode } from "@/lib/guest-mode";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { resolveBottomNavKeys } from "@/lib/bottom-nav";

const navItems = [
  { href: "/homework", key: "homework", testId: "homework", icon: ClipboardList },
  { href: "/dashboard", key: "dashboard", testId: "dashboard", icon: LayoutDashboard },
  { href: "/telawa", key: "telawa", testId: "telawa", icon: Repeat },
  { href: "/reader", key: "reader", testId: "reader", icon: BookMarked },
  { href: "/mistakes", key: "mistakes", testId: "mistakes", icon: AlertTriangle },
  { href: "/juz", key: "juz", testId: "juz", icon: Layers },
  { href: "/rub", key: "rub", testId: "rub'", icon: Grid3x3 },
  { href: "/surah", key: "surah", testId: "surah", icon: BookOpen },
  { href: "/pages", key: "pages", testId: "pages", icon: FileText },
  { href: "/ayahs", key: "ayahs", testId: "ayahs", icon: Sparkles },
  { href: "/recite", key: "recite", testId: "recite", icon: PenLine },
  { href: "/welcome", key: "welcome", testId: "welcome", icon: Compass },
  { href: "/settings", key: "settings", testId: "settings", icon: Settings },
] as const;

// Mobile bottom-nav: the user picks which screens (and order) appear here
// from Settings. The rest of `navItems` is always available via the burger
// drawer regardless of this preference.
export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  // Settings drives the bottom-nav. Until it loads we render the historical
  // five (resolveBottomNavKeys handles the empty/undefined fallback) so the
  // bar never flickers blank on first paint.
  const { data: settings } = useGetSettings();
  const bottomNavItems = resolveBottomNavKeys(settings?.bottomNavKeys)
    .map(k => navItems.find(n => n.key === k))
    .filter((n): n is (typeof navItems)[number] => n !== undefined);

  const guestMode = !isSignedIn && isGuestMode();

  const isActive = (href: string) =>
    location === href || (href !== "/" && location.startsWith(href));

  const userLabel = user?.primaryEmailAddress?.emailAddress ?? user?.firstName ?? t("auth.account");

  const handleExitGuest = () => {
    exitGuestMode();
    queryClient.clear();
    setLocation("/");
  };

  const isOnline = useOnlineStatus();

  return (
    <div className="min-h-screen flex" data-testid="app-layout">
      <aside className="hidden md:flex w-56 bg-sidebar border-e border-sidebar-border flex-col py-4 shrink-0" data-testid="sidebar">
        <div className="px-5 mb-6">
          <h1 className="text-lg font-semibold text-sidebar-foreground tracking-tight">{t("app.name")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("app.tagline")}</p>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
              data-testid={`nav-${item.testId}`}
            >
              <item.icon className="w-4 h-4" />
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>
        <div className="px-3 pt-3 mt-3 border-t border-sidebar-border space-y-2">
          {guestMode ? (
            <>
              <div className="px-1 text-xs text-muted-foreground" data-testid="guest-info">
                {t("auth.signedInAs")} <span className="font-medium text-sidebar-foreground">{t("auth.guest")}</span>
              </div>
              <Link
                href="/sign-up"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                data-testid="button-guest-sign-up"
              >
                <UserPlus className="w-4 h-4" />
                {t("auth.signUpToSave")}
              </Link>
              <button
                onClick={handleExitGuest}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                data-testid="button-exit-guest"
              >
                <LogOut className="w-4 h-4" />
                {t("auth.exitGuest")}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 px-1" data-testid="user-info">
                <UserButton />
                <span className="text-xs text-sidebar-foreground/80 truncate flex-1" title={userLabel}>{userLabel}</span>
              </div>
              <button
                onClick={() => signOut({ redirectUrl: "/" })}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                data-testid="button-sign-out"
              >
                <LogOut className="w-4 h-4" />
                {t("auth.signOut")}
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30">
          <div>
            <h1 className="text-base font-semibold leading-tight">{t("app.name")}</h1>
          </div>
          <div className="flex items-center gap-2">
            {guestMode ? (
              <Link
                href="/sign-up"
                className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                data-testid="mobile-guest-sign-up"
              >
                {t("auth.signUp")}
              </Link>
            ) : (
              <UserButton />
            )}
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label={t("nav.openMenu")}
              data-testid="mobile-menu-btn"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {drawerOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="relative w-64 bg-sidebar h-full flex flex-col py-4 shadow-xl z-10">
              <div className="flex items-center justify-between px-5 mb-6">
                <div>
                  <h1 className="text-lg font-semibold text-sidebar-foreground">{t("app.name")}</h1>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("app.tagline")}</p>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
                  aria-label={t("nav.closeMenu")}
                >
                  <X className="w-5 h-5 text-sidebar-foreground" />
                </button>
              </div>
              <nav className="flex-1 px-3 space-y-0.5">
                {navItems.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive(item.href)
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    }`}
                    data-testid={`mobile-nav-${item.testId}`}
                  >
                    <item.icon className="w-4 h-4" />
                    {t(`nav.${item.key}`)}
                  </Link>
                ))}
              </nav>
              <div className="px-3 pt-3 mt-3 border-t border-sidebar-border space-y-2">
                {guestMode ? (
                  <>
                    <Link
                      href="/sign-up"
                      onClick={() => setDrawerOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      data-testid="mobile-button-guest-sign-up"
                    >
                      <UserPlus className="w-4 h-4" />
                      {t("auth.signUpToSave")}
                    </Link>
                    <button
                      onClick={() => { setDrawerOpen(false); handleExitGuest(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                      data-testid="mobile-button-exit-guest"
                    >
                      <LogOut className="w-4 h-4" />
                      {t("auth.exitGuest")}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setDrawerOpen(false); signOut({ redirectUrl: "/" }); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                    data-testid="mobile-button-sign-out"
                  >
                    <LogOut className="w-4 h-4" />
                    {t("auth.signOut")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          {!isOnline && (
            <div
              className="bg-slate-700 text-slate-100 px-4 md:px-6 py-2 flex items-center gap-2.5"
              data-testid="offline-banner"
              role="status"
              aria-live="polite"
            >
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <p className="text-xs font-medium">{t("offline.banner")}</p>
            </div>
          )}
          {guestMode && (
            <div
              className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-2.5 flex items-center gap-3"
              data-testid="guest-mode-banner"
            >
              <Info className="w-4 h-4 text-amber-700 shrink-0" />
              <p className="text-xs sm:text-sm text-amber-900 flex-1 min-w-0">
                {t("auth.guestBanner")}
                <span className="hidden sm:inline"> {t("auth.guestBannerExtra")}</span>
              </p>
              <Link
                href="/sign-up"
                className="shrink-0 inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-md transition-colors"
                data-testid="banner-sign-up-button"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {t("auth.saveMyProgress")}
              </Link>
            </div>
          )}
          <div className="max-w-6xl mx-auto p-4 md:p-6">
            {children}
          </div>
        </main>

        <nav
          className="md:hidden fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t z-30 flex pb-safe"
          data-testid="bottom-nav"
        >
          {bottomNavItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center min-h-[3.25rem] py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                isActive(item.href)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`bottom-nav-${item.testId}`}
            >
              <item.icon className={`w-5 h-5 ${isActive(item.href) ? "text-primary" : "text-muted-foreground"}`} />
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
