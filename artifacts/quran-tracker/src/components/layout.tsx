import { Link, useLocation } from "wouter";
import { LayoutDashboard, BookOpen, Layers, FileText, PenLine, ClipboardList, Settings, LogOut, UserPlus, Info } from "lucide-react";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { UserButton, useUser, useClerk, useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { isGuestMode, exitGuestMode } from "@/lib/guest-mode";

const navItems = [
  { href: "/homework", label: "Homework", icon: ClipboardList },
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/juz", label: "Juz", icon: Layers },
  { href: "/surah", label: "Surah", icon: BookOpen },
  { href: "/pages", label: "Pages", icon: FileText },
  { href: "/recite", label: "Recite", icon: PenLine },
  { href: "/settings", label: "Settings", icon: Settings },
];

const bottomNavItems = [
  { href: "/homework", label: "Homework", icon: ClipboardList },
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/juz", label: "Juz", icon: Layers },
  { href: "/surah", label: "Surah", icon: BookOpen },
  { href: "/pages", label: "Pages", icon: FileText },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();

  const guestMode = !isSignedIn && isGuestMode();

  const isActive = (href: string) =>
    location === href || (href !== "/" && location.startsWith(href));

  const userLabel = user?.primaryEmailAddress?.emailAddress ?? user?.firstName ?? "Account";

  const handleExitGuest = () => {
    exitGuestMode();
    queryClient.clear();
    setLocation("/");
  };

  return (
    <div className="min-h-screen flex" data-testid="app-layout">
      <aside className="hidden md:flex w-56 bg-sidebar border-r border-sidebar-border flex-col py-4 shrink-0" data-testid="sidebar">
        <div className="px-5 mb-6">
          <h1 className="text-lg font-semibold text-sidebar-foreground tracking-tight">Quran Tracker</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Memorization Progress</p>
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
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-3 pt-3 mt-3 border-t border-sidebar-border space-y-2">
          {guestMode ? (
            <>
              <div className="px-1 text-xs text-muted-foreground" data-testid="guest-info">
                Signed in as <span className="font-medium text-sidebar-foreground">Guest</span>
              </div>
              <Link
                href="/sign-up"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium bg-teal-700 text-white hover:bg-teal-800 transition-colors"
                data-testid="button-guest-sign-up"
              >
                <UserPlus className="w-4 h-4" />
                Sign up to save
              </Link>
              <button
                onClick={handleExitGuest}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                data-testid="button-exit-guest"
              >
                <LogOut className="w-4 h-4" />
                Exit guest mode
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
                Sign out
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-background sticky top-0 z-30">
          <div>
            <h1 className="text-base font-semibold leading-tight">Quran Tracker</h1>
          </div>
          <div className="flex items-center gap-2">
            {guestMode ? (
              <Link
                href="/sign-up"
                className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-teal-700 text-white hover:bg-teal-800"
                data-testid="mobile-guest-sign-up"
              >
                Sign up
              </Link>
            ) : (
              <UserButton />
            )}
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Open menu"
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
                  <h1 className="text-lg font-semibold text-sidebar-foreground">Quran Tracker</h1>
                  <p className="text-xs text-muted-foreground mt-0.5">Memorization Progress</p>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
                  aria-label="Close menu"
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
                    data-testid={`mobile-nav-${item.label.toLowerCase()}`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="px-3 pt-3 mt-3 border-t border-sidebar-border space-y-2">
                {guestMode ? (
                  <>
                    <Link
                      href="/sign-up"
                      onClick={() => setDrawerOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium bg-teal-700 text-white hover:bg-teal-800 transition-colors"
                      data-testid="mobile-button-guest-sign-up"
                    >
                      <UserPlus className="w-4 h-4" />
                      Sign up to save
                    </Link>
                    <button
                      onClick={() => { setDrawerOpen(false); handleExitGuest(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                      data-testid="mobile-button-exit-guest"
                    >
                      <LogOut className="w-4 h-4" />
                      Exit guest mode
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setDrawerOpen(false); signOut({ redirectUrl: "/" }); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                    data-testid="mobile-button-sign-out"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          {guestMode && (
            <div
              className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-2.5 flex items-center gap-3"
              data-testid="guest-mode-banner"
            >
              <Info className="w-4 h-4 text-amber-700 shrink-0" />
              <p className="text-xs sm:text-sm text-amber-900 flex-1 min-w-0">
                You're trying it as a guest — your progress is saved on this device only.{" "}
                <Link href="/sign-up" className="underline font-medium hover:text-amber-950" data-testid="banner-sign-up-link">
                  Sign up to keep it across devices
                </Link>
                .
              </p>
            </div>
          )}
          <div className="max-w-6xl mx-auto p-4 md:p-6">
            {children}
          </div>
        </main>

        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-background border-t z-30 flex" data-testid="bottom-nav">
          {bottomNavItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                isActive(item.href)
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
              data-testid={`bottom-nav-${item.label.toLowerCase()}`}
            >
              <item.icon className={`w-5 h-5 ${isActive(item.href) ? "text-primary" : "text-muted-foreground"}`} />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
