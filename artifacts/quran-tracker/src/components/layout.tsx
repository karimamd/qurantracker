import { Link, useLocation } from "wouter";
import { LayoutDashboard, BookOpen, Layers, FileText, PenLine, ClipboardList, Settings } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/juz", label: "Juz", icon: Layers },
  { href: "/surah", label: "Surah", icon: BookOpen },
  { href: "/pages", label: "Pages", icon: FileText },
  { href: "/recite", label: "Recite", icon: PenLine },
  { href: "/homework", label: "Homework", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex" data-testid="app-layout">
      <aside className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col py-4 shrink-0" data-testid="sidebar">
        <div className="px-5 mb-6">
          <h1 className="text-lg font-semibold text-sidebar-foreground tracking-tight">Quran Tracker</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Memorization Progress</p>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map(item => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
