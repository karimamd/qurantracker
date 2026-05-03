/**
 * Welcome / onboarding screen — comprehensive showcase of every major
 * surface in the app. Renders in two modes:
 *
 *   - Public (signed-out): shown at "/" when no auth + no guest session.
 *     Includes the marketing header, language toggle, and CTAs to sign
 *     in / sign up / try as guest.
 *
 *   - In-app (signed-in / guest): shown at "/welcome" via the layout's
 *     "Tour" entry. Header + CTAs are hidden — the layout chrome owns
 *     auth — and the section content focuses purely on the tour.
 *
 * The visuals are intentionally hand-built mock UIs (not screenshots)
 * so they stay pixel-aligned with the live design tokens, scale crisply
 * at every breakpoint, and follow the app's RTL flip without any extra
 * asset pipeline.
 */
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  BookMarked,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardList,
  Globe,
  LayoutDashboard,
  Link2,
  Repeat,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { setLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";
import { enterGuestMode } from "@/lib/guest-mode";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface WelcomeProps {
  /** When true, render header + sign-in/up CTAs (public landing). When
   * false, omit them — the app shell already owns the user's identity. */
  withAuthChrome: boolean;
}

function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const current = (i18n.language?.startsWith("ar") ? "ar" : "en") as SupportedLanguage;
  return (
    <div
      role="group"
      aria-label={t("settings.language.label")}
      className="inline-flex items-center rounded-full border border-border bg-background/70 p-0.5 text-xs"
      data-testid="welcome-language-toggle"
    >
      {SUPPORTED_LANGUAGES.map((lang) => {
        const active = current === lang;
        const label = lang === "ar" ? t("settings.language.arabic") : t("settings.language.english");
        return (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            aria-pressed={active}
            data-testid={`welcome-lang-${lang}`}
            className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** A small browser-window chrome wrapper used for every mockup so the
 *  visuals read as "screens" without us shipping real screenshots. */
function MockFrame({
  label,
  children,
  tone = "default",
}: {
  label: string;
  children: React.ReactNode;
  tone?: "default" | "primary";
}) {
  return (
    <div
      className={`rounded-2xl border shadow-xl overflow-hidden bg-card ${
        tone === "primary" ? "border-primary/30 ring-1 ring-primary/10" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-400/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
        <span className="ms-2 text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
          {label}
        </span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/** Reader mockup: mushaf page with a few ayahs and one of each mark. */
function ReaderMock() {
  const { t } = useTranslation();
  const lines = [
    { txt: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ", mark: null as null | "mistake" | "link" | "clear" },
    { txt: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ", mark: "clear" as const },
    { txt: "ٱلرَّحْمَٰنِ ٱلرَّحِيمِ", mark: "link" as const },
    { txt: "مَٰلِكِ يَوْمِ ٱلدِّينِ", mark: "mistake" as const },
    { txt: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ", mark: null },
  ];
  return (
    <MockFrame label={t("welcome.mocks.reader")} tone="primary">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="font-medium">{t("welcome.mocks.surahLabel")}</span>
          <span>{t("welcome.mocks.pageOf", { n: 1, total: 604 })}</span>
        </div>
        <div className="rounded-xl border bg-background px-4 py-5 space-y-3" dir="rtl">
          {lines.map((l, i) => (
            <p
              key={i}
              className={`text-base sm:text-lg leading-loose text-right transition-colors ${
                l.mark === "mistake" ? "text-rose-600 font-semibold" : "text-foreground"
              } ${l.mark === "link" ? "bg-amber-100 ring-1 ring-amber-300 rounded px-1" : ""} ${
                l.mark === "clear" ? "text-emerald-700" : ""
              }`}
              style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif" }}
            >
              {l.txt}
            </p>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Check className="w-3 h-3" />
            {t("welcome.mocks.markClear")}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            <X className="w-3 h-3" />
            {t("welcome.mocks.markMistake")}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <Link2 className="w-3 h-3" />
            {t("welcome.mocks.markLink")}
          </span>
        </div>
      </div>
    </MockFrame>
  );
}

/** Dashboard mockup: stat tiles + a tiny progress ring + due bar. */
function DashboardMock() {
  const { t } = useTranslation();
  const stats = [
    { label: t("welcome.mocks.statMemorized"), value: "187", tone: "primary" as const },
    { label: t("welcome.mocks.statDue"), value: "12", tone: "amber" as const },
    { label: t("welcome.mocks.streakDays", { n: 21 }), value: "21", tone: "emerald" as const },
  ];
  return (
    <MockFrame label={t("welcome.mocks.dashboard")}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border px-3 py-2.5 ${
                s.tone === "primary"
                  ? "bg-primary/5 border-primary/20"
                  : s.tone === "amber"
                    ? "bg-amber-50 border-amber-200"
                    : "bg-emerald-50 border-emerald-200"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                {s.label}
              </div>
              <div
                className={`text-xl font-bold tabular-nums ${
                  s.tone === "primary"
                    ? "text-primary"
                    : s.tone === "amber"
                      ? "text-amber-700"
                      : "text-emerald-700"
                }`}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{t("welcome.mocks.overall")}</span>
            <span className="tabular-nums text-muted-foreground">31%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-emerald-500" style={{ width: "31%" }} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{t("welcome.mocks.juzCount", { n: 6 })}</span>
            <span>{t("welcome.mocks.pageCount", { n: 187 })}</span>
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

/** Ayahs list mockup: a few searchable cards. */
function AyahsMock() {
  const { t } = useTranslation();
  const cards = [
    { ar: "ٱلرَّحْمَٰنُ عَلَّمَ ٱلْقُرْءَانَ", surahKey: "rahman", num: 55, page: 531 },
    { ar: "إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا", surahKey: "sharh", num: 94, page: 596 },
    { ar: "وَأَقِيمُوا۟ ٱلصَّلَوٰةَ", surahKey: "baqarah", num: 2, page: 7 },
  ];
  return (
    <MockFrame label={t("welcome.mocks.ayahs")}>
      <div className="space-y-3">
        <div className="relative">
          <Sparkles className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-primary" />
          <div className="ps-8 pe-3 py-2 rounded-md border bg-background text-xs text-muted-foreground" dir="auto">
            {t("welcome.mocks.searchExample")}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {cards.map((c, i) => (
            <div key={i} className="rounded-lg border p-2.5 bg-background">
              <p
                dir="rtl"
                className="text-sm leading-relaxed text-right text-foreground line-clamp-2"
                style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif" }}
              >
                {c.ar}
              </p>
              <div className="mt-2 flex items-center justify-between text-[10px] font-medium">
                <span className="text-primary">
                  {c.num}. {t(`welcome.mocks.surah.${c.surahKey}`)}
                </span>
                <span className="text-muted-foreground">
                  {t("welcome.mocks.pageShort", { n: c.page })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MockFrame>
  );
}

/** Mistakes feed mockup. */
function MistakesMock() {
  const { t } = useTranslation();
  const rows = [
    { surahKey: "baqarah", aya: 255, kind: "mistake" as const, agoKey: "hours", agoN: 2 },
    { surahKey: "nisa", aya: 36, kind: "link" as const, agoKey: "days", agoN: 1 },
    { surahKey: "maidah", aya: 3, kind: "mistake" as const, agoKey: "days", agoN: 3 },
  ];
  return (
    <MockFrame label={t("welcome.mocks.mistakes")}>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-lg border p-2.5 bg-background"
          >
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                r.kind === "mistake"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {r.kind === "mistake" ? <X className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">
                {t(`welcome.mocks.surah.${r.surahKey}`)} · {t("welcome.mocks.ayahN", { n: r.aya })}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {t(`welcome.mocks.ago.${r.agoKey}`, { n: r.agoN })}
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground rtl:rotate-180" />
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

/** Telawa rotation mockup: weekly heat strip. */
function TelawaMock() {
  const { t } = useTranslation();
  const days = [4, 6, 5, 5, 7, 3, 5];
  const labels = [
    t("welcome.mocks.dayShort.mon"),
    t("welcome.mocks.dayShort.tue"),
    t("welcome.mocks.dayShort.wed"),
    t("welcome.mocks.dayShort.thu"),
    t("welcome.mocks.dayShort.fri"),
    t("welcome.mocks.dayShort.sat"),
    t("welcome.mocks.dayShort.sun"),
  ];
  return (
    <MockFrame label={t("welcome.mocks.telawa")}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs">
            <div className="font-medium">{t("welcome.mocks.dailyGoal")}</div>
            <div className="text-muted-foreground text-[11px]">{t("welcome.mocks.pagesPerDay", { n: 5 })}</div>
          </div>
          <div className="text-end">
            <div className="text-xl font-bold text-primary tabular-nums">35</div>
            <div className="text-[10px] text-muted-foreground">{t("welcome.mocks.thisWeek")}</div>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((n, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className="w-full rounded-md bg-primary/15 flex items-end overflow-hidden"
                style={{ height: 38 }}
              >
                <div
                  className="w-full bg-gradient-to-t from-primary to-emerald-500"
                  style={{ height: `${Math.min(100, (n / 7) * 100)}%` }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground font-medium">{labels[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </MockFrame>
  );
}

/** Pages list mockup with status pills + due dates. */
function PagesMock() {
  const { t } = useTranslation();
  const rows = [
    { p: 12, status: "excellent", due: 30 },
    { p: 13, status: "good", due: 14 },
    { p: 14, status: "hard", due: 7 },
    { p: 15, status: "relearn", due: 3 },
  ];
  const tone: Record<string, string> = {
    excellent: "bg-emerald-100 text-emerald-700 border-emerald-200",
    good: "bg-teal-100 text-teal-700 border-teal-200",
    hard: "bg-amber-100 text-amber-700 border-amber-200",
    relearn: "bg-rose-100 text-rose-700 border-rose-200",
  };
  return (
    <MockFrame label={t("welcome.mocks.pages")}>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.p}
            className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"
          >
            <div className="text-xs font-bold text-foreground tabular-nums w-10">
              {t("common.page")} {r.p}
            </div>
            <span
              className={`inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full border ${tone[r.status]}`}
            >
              {t(`welcome.mocks.status.${r.status}`)}
            </span>
            <div className="ms-auto text-[10px] text-muted-foreground">
              {t("welcome.mocks.dueIn", { n: r.due })}
            </div>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

interface FeatureSection {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  mock: React.ReactNode;
  reverse?: boolean;
}

export default function Welcome({ withAuthChrome }: WelcomeProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const handleTryAsGuest = () => {
    enterGuestMode();
    setLocation("/dashboard");
  };

  const features: FeatureSection[] = [
    { key: "reader", icon: BookMarked, mock: <ReaderMock />, reverse: false },
    { key: "dashboard", icon: LayoutDashboard, mock: <DashboardMock />, reverse: true },
    { key: "ayahs", icon: Sparkles, mock: <AyahsMock />, reverse: false },
    { key: "mistakes", icon: AlertTriangle, mock: <MistakesMock />, reverse: true },
    { key: "telawa", icon: Repeat, mock: <TelawaMock />, reverse: false },
    { key: "pages", icon: ClipboardList, mock: <PagesMock />, reverse: true },
  ];

  const steps = [
    { key: "mark", icon: Target },
    { key: "schedule", icon: TrendingUp },
    { key: "review", icon: Repeat },
  ];

  return (
    <div
      className={
        withAuthChrome
          ? "min-h-[100dvh] bg-gradient-to-br from-background via-card to-[hsl(168_25%_94%)]"
          : ""
      }
      data-testid="welcome-page"
    >
      {withAuthChrome && (
        <header className="px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <img src={`${basePath}/logo.svg`} alt="Logo" className="h-9 w-9" />
            <span className="font-semibold text-foreground text-lg">{t("app.name")}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Button asChild variant="ghost" size="sm" data-testid="link-sign-in">
              <Link href="/sign-in">{t("auth.signIn")}</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="link-sign-up"
            >
              <Link href="/sign-up">{t("auth.getStarted")}</Link>
            </Button>
          </div>
        </header>
      )}

      <main
        className={`max-w-6xl mx-auto px-4 sm:px-6 ${
          withAuthChrome ? "pb-20 sm:pb-24" : "pb-12"
        }`}
      >
        {/* Hero */}
        <section
          className={`text-center ${withAuthChrome ? "pt-8 sm:pt-14" : "pt-2"} pb-12`}
          data-testid="welcome-hero"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-medium px-3 py-1 rounded-full mb-5">
            <BookOpen className="w-3.5 h-3.5" />
            {t("landing.badge")}
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-foreground tracking-tight mb-4 max-w-3xl mx-auto">
            {t("landing.title")}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            {t("landing.subtitle")}
          </p>
          {withAuthChrome && (
            <>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleTryAsGuest}
                  data-testid="cta-try-guest"
                  className="border-primary text-primary hover:bg-primary/10"
                >
                  {t("landing.tryGuest")} <ArrowRight className="w-4 h-4 ms-2 rtl:rotate-180" />
                </Button>
                <Button
                  asChild
                  size="lg"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto"
                  data-testid="cta-sign-up"
                >
                  <Link href="/sign-up">{t("landing.createAccount")}</Link>
                </Button>
                <Button asChild size="lg" variant="ghost" data-testid="cta-sign-in">
                  <Link href="/sign-in">{t("auth.signIn")}</Link>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-6 max-w-md mx-auto">
                {t("landing.guestNote")}
              </p>
            </>
          )}
        </section>

        {/* Quick highlight strip */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-16" data-testid="welcome-highlights">
          {[
            { icon: BookOpen, label: t("welcome.highlights.pages"), value: "604" },
            { icon: Sparkles, label: t("welcome.highlights.ayahs"), value: "6,236" },
            { icon: Globe, label: t("welcome.highlights.languages"), value: "AR · EN" },
            { icon: Repeat, label: t("welcome.highlights.offline"), value: t("welcome.highlights.offlineValue") },
          ].map((h) => (
            <div
              key={h.label}
              className="rounded-xl border bg-card p-3 sm:p-4 flex flex-col items-center text-center gap-1"
            >
              <h.icon className="w-5 h-5 text-primary mb-1" />
              <div className="text-base sm:text-lg font-bold tabular-nums text-foreground">{h.value}</div>
              <div className="text-[11px] text-muted-foreground font-medium">{h.label}</div>
            </div>
          ))}
        </section>

        {/* How it works */}
        <section className="mb-20" data-testid="welcome-how-it-works">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t("welcome.how.title")}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-xl mx-auto">
              {t("welcome.how.subtitle")}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {steps.map((s, i) => (
              <div
                key={s.key}
                className="relative rounded-2xl border bg-card p-5 sm:p-6 hover:border-primary/40 transition-colors"
              >
                <div className="absolute -top-3 start-5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {i + 1}
                </div>
                <s.icon className="w-7 h-7 text-primary mb-3" />
                <h3 className="font-semibold text-base mb-1.5">{t(`welcome.how.${s.key}.title`)}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(`welcome.how.${s.key}.body`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Feature deep-dives — alternating two-column layout */}
        <section className="space-y-16 sm:space-y-24" data-testid="welcome-features">
          {features.map((f) => (
            <div
              key={f.key}
              className={`grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10 items-center ${
                f.reverse ? "md:[&>*:first-child]:order-last" : ""
              }`}
              data-testid={`welcome-feature-${f.key}`}
            >
              <div>
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-medium px-3 py-1 rounded-full mb-3">
                  <f.icon className="w-3.5 h-3.5" />
                  {t(`welcome.features.${f.key}.tag`)}
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
                  {t(`welcome.features.${f.key}.title`)}
                </h3>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-4">
                  {t(`welcome.features.${f.key}.body`)}
                </p>
                <ul className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span className="text-foreground/90">
                        {t(`welcome.features.${f.key}.bullets.${i}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>{f.mock}</div>
            </div>
          ))}
        </section>

        {/* Bilingual strip */}
        <section
          className="mt-20 rounded-2xl border bg-gradient-to-br from-primary/5 via-card to-emerald-500/5 p-6 sm:p-8 text-center"
          data-testid="welcome-bilingual"
        >
          <Globe className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="text-xl sm:text-2xl font-bold mb-2">{t("welcome.bilingual.title")}</h3>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto mb-4">
            {t("welcome.bilingual.body")}
          </p>
          <div className="flex justify-center">
            <LanguageToggle />
          </div>
        </section>

        {/* Final CTA — public-only */}
        {withAuthChrome && (
          <section
            className="mt-16 rounded-2xl border border-primary/30 bg-primary/5 p-8 sm:p-10 text-center"
            data-testid="welcome-final-cta"
          >
            <h3 className="text-2xl sm:text-3xl font-bold mb-3">{t("welcome.cta.title")}</h3>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto mb-6">
              {t("welcome.cta.body")}
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <Button
                size="lg"
                variant="outline"
                onClick={handleTryAsGuest}
                data-testid="cta-try-guest-bottom"
                className="border-primary text-primary hover:bg-primary/10"
              >
                {t("landing.tryGuest")} <ArrowRight className="w-4 h-4 ms-2 rtl:rotate-180" />
              </Button>
              <Button
                asChild
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto"
                data-testid="cta-sign-up-bottom"
              >
                <Link href="/sign-up">{t("landing.createAccount")}</Link>
              </Button>
            </div>
          </section>
        )}

        {/* In-app return shortcut */}
        {!withAuthChrome && (
          <section className="mt-12 text-center" data-testid="welcome-back-to-app">
            <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/dashboard">
                {t("welcome.backToDashboard")} <ArrowRight className="w-4 h-4 ms-2 rtl:rotate-180" />
              </Link>
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
