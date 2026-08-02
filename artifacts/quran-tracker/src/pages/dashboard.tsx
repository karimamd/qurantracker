/**
 * Dashboard page (/dashboard) — the home screen for authenticated users.
 *
 * Composed of three roughly-independent sections, each fed by its own
 * /api/progress endpoint so they can refresh / loading-skeleton in parallel:
 *   1. Overview cards: total memorized, in-scope, overdue, streak
 *      (useGetProgressOverview).
 *   2. Daily and progress sparklines (useGetDailyChart, useGetProgressChart)
 *      driven by recitation_log aggregates.
 *   3. "Due today" + recent activity feed (useListPageProgress filtered to
 *      due/overdue + useGetRecentActivity).
 *
 * Status backgrounds come from lib/quality.ts (getStatusBgClass /
 * getStatusBarColor) so day/page tiles share their palette with the rest
 * of the app; the per-quality button colors below are a small dashboard-
 * local map intentionally kept inline rather than imported.
 */
import {
  useGetProgressOverview,
  useGetRecentActivity,
  useListPageProgress,
  useGetDailyChart,
  useGetProgressChart,
  useListHomework,
  useGetTelawaToday,
  useGetTelawaScopeToday,
  useGetTelawaHomeworkReading,
  useGetTelawaHomeworkAyahCorrectness,
  getGetTelawaHomeworkAyahCorrectnessQueryKey,
  useUpdateSettings,
  getGetSettingsQueryKey,
  useUpdatePageProgress,
  useUndoRecitation,
  useGetSettings,
  getListPageProgressQueryKey,
  getGetProgressOverviewQueryKey,
  getGetRecentActivityQueryKey,
  getListJuzProgressQueryKey,
  getListSurahProgressQueryKey,
  getGetJuzDetailQueryKey,
  getGetSurahDetailQueryKey,
  getGetDailyChartQueryKey,
  getGetProgressChartQueryKey,
  getListHomeworkQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityBadge } from "@/components/quality-badge";
import { Progress } from "@/components/ui/progress";
import { BookOpen, AlertTriangle, Clock, CheckCircle, CheckCircle2, Flame, ChevronRight, ChevronDown, Undo2, Repeat, BookOpenCheck, PlusCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LabelList,
} from "recharts";
import { format, parseISO } from "date-fns";
import { PageLabel } from "@/components/page-label";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import GuestSavePrompt from "@/components/guest-save-prompt";
import { OnboardingScopeSetup } from "@/components/onboarding-scope-setup";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { readerUrl } from "@/lib/reader-url";
import { SURAHS } from "@/lib/quran-ref";

type Quality = "excellent" | "good" | "hard" | "relearn";

const QUALITY_VALUES: Quality[] = ["excellent", "good", "hard", "relearn"];

function OnboardingTrigger({ variant = "default" }: { variant?: "default" | "link" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (variant === "link") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-primary hover:underline"
          data-testid="onboarding-open-link"
        >
          {t("onboarding.openCta")}
        </button>
        <OnboardingScopeSetup open={open} onOpenChange={setOpen} />
      </>
    );
  }
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        size="sm"
        className="gap-1.5"
        data-testid="onboarding-open-button"
      >
        <Sparkles className="w-4 h-4" />
        {t("onboarding.openCta")}
      </Button>
      <OnboardingScopeSetup open={open} onOpenChange={setOpen} />
    </>
  );
}

function OnboardingScopeAuto({ open: shouldShow }: { open: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (!shouldShow || dismissed) return null;
  return (
    <Card className="border-2 border-dashed border-primary/30 bg-primary/5 shadow-none" data-testid="onboarding-banner">
      <CardContent className="py-4 px-5 flex flex-wrap items-center gap-3 justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {t("onboarding.bannerTitle")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t("onboarding.bannerBody")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
            data-testid="onboarding-banner-dismiss"
          >
            {t("onboarding.skip")}
          </button>
          <Button type="button" size="sm" onClick={() => setOpen(true)} className="gap-1.5" data-testid="onboarding-banner-cta">
            {t("onboarding.openCta")}
          </Button>
        </div>
        <OnboardingScopeSetup open={open} onOpenChange={setOpen} />
      </CardContent>
    </Card>
  );
}

const qualityStyle: Record<Quality, { active: string; hover: string }> = {
  excellent: { active: "bg-emerald-500 border-emerald-500 text-white", hover: "hover:border-emerald-300 hover:text-emerald-700" },
  good:      { active: "bg-teal-600 border-teal-600 text-white",       hover: "hover:border-teal-300 hover:text-teal-700" },
  hard:      { active: "bg-amber-500 border-amber-500 text-white",     hover: "hover:border-amber-300 hover:text-amber-700" },
  relearn:   { active: "bg-rose-500 border-rose-500 text-white",       hover: "hover:border-rose-300 hover:text-rose-700" },
};

function ActiveHomeworkSection() {
  const { t } = useTranslation();
  const { data: sessions, isLoading } = useListHomework();

  if (isLoading) {
    return <Skeleton className="h-20 rounded-xl" />;
  }

  const active = sessions?.find(s => s.status === "active");
  if (!active) return null;

  const pct = active.totalItems > 0 ? Math.round((active.completedItems / active.totalItems) * 100) : 0;
  const remaining = active.totalItems - active.completedItems;

  return (
    <Link href={`/homework/${active.id}`}>
      <Card
        className="border shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
        data-testid="active-homework-card"
      >
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary uppercase tracking-wide mb-0.5">{t("dashboard.activeHomework")}</p>
              <p className="font-semibold text-sm truncate">{active.title}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 ms-3">
              <div className="text-end">
                <p className="text-xs text-muted-foreground">{t("dashboard.due", { date: new Date(active.dueDate).toLocaleDateString() })}</p>
                <p className="text-xs font-medium">{remaining > 0 ? t("dashboard.remaining", { count: remaining }) : t("dashboard.allDone")}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground rtl:rotate-180" />
            </div>
          </div>
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1.5">{t("dashboard.pagesCompleted", { done: active.completedItems, total: active.totalItems })}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function TelawaCard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data, isLoading } = useGetTelawaToday();
  const { data: settings } = useGetSettings();
  const hideOnJump = settings?.hideReaderOnJump !== false;

  if (isLoading) return <Skeleton className="h-20 rounded-xl" />;
  if (!data) return null;

  const pct = Math.min(100, Math.round((data.readToday / Math.max(1, data.pagesPerDay)) * 100));
  const remaining = Math.max(0, data.pagesPerDay - data.readToday);

  return (
    <div
      className="border rounded-xl shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer bg-card"
      onClick={() => setLocation("/telawa")}
      data-testid="dashboard-telawa-card"
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setLocation("/telawa"); }}
    >
      <div className="py-4 px-5">
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary uppercase tracking-wide mb-0.5 flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5" />
              {t("telawa.dashboard.title")}
            </p>
            <p className="font-semibold text-sm truncate">
              {t("telawa.dashboard.subtitle", { next: data.nextPage, cycle: data.cycleNumber })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ms-3">
            <div className="text-end">
              <p className="text-xs text-muted-foreground">
                {t("telawa.dashboard.todayProgress", {
                  done: data.readToday,
                  total: data.pagesPerDay,
                })}
              </p>
              <p className="text-xs font-medium">
                {remaining > 0
                  ? t("telawa.dashboard.remaining", { count: remaining })
                  : t("telawa.dashboard.allDone")}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground rtl:rotate-180" />
          </div>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-xs text-muted-foreground">
            {t("telawa.dashboard.totalRead", { count: data.totalRead })}
          </p>
          <Link
            href={readerUrl(data.nextPage, hideOnJump)}
            onClick={e => e.stopPropagation()}
          >
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs gap-1 px-2 py-0"
              onClick={e => e.stopPropagation()}
            >
              <BookOpen className="w-3 h-3" />
              {t("telawa.dashboard.readNext", { page: data.nextPage })}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function TelawaScopeCard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data, isLoading } = useGetTelawaScopeToday();
  const { data: settings } = useGetSettings();
  const hideOnJump = settings?.hideReaderOnJump !== false;

  if (isLoading) return <Skeleton className="h-20 rounded-xl" />;
  if (!data || data.totalInScope === 0) return null;

  const cyclePct = Math.min(100, Math.round((data.readInCycle / Math.max(1, data.totalInScope)) * 100));
  const remaining = Math.max(0, data.pagesPerDay - data.readToday);
  const nextPage = data.upcomingPages[0];

  return (
    <div
      className="border rounded-xl shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer bg-card"
      onClick={() => setLocation("/telawa")}
      data-testid="dashboard-telawa-scope-card"
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setLocation("/telawa"); }}
    >
      <div className="py-4 px-5">
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wide mb-0.5 flex items-center gap-1.5">
              <BookOpenCheck className="w-3.5 h-3.5" />
              {t("telawa.scope.dashboard.title")}
            </p>
            <p className="font-semibold text-sm">
              {t("telawa.scope.dashboard.cycleProgress", {
                done: data.readInCycle,
                total: data.totalInScope,
                cycle: data.cycleNumber,
              })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ms-3">
            <div className="text-end">
              <p className="text-xs text-muted-foreground">
                {t("telawa.scope.dashboard.todayProgress", {
                  done: data.readToday,
                  total: data.pagesPerDay,
                })}
              </p>
              <p className="text-xs font-medium">
                {remaining > 0
                  ? t("telawa.scope.dashboard.remaining", { count: remaining })
                  : t("telawa.scope.dashboard.allDone")}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground rtl:rotate-180" />
          </div>
        </div>
        <Progress value={cyclePct} className="h-2" />
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-xs text-muted-foreground">
            {t("telawa.scope.dashboard.cyclePct", { pct: cyclePct, cycle: data.cycleNumber })}
          </p>
          {nextPage != null && (
            <Link
              href={readerUrl(nextPage, hideOnJump)}
              onClick={e => e.stopPropagation()}
            >
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1 px-2 py-0"
                onClick={e => e.stopPropagation()}
              >
                <BookOpen className="w-3 h-3" />
                {t("telawa.scope.dashboard.readNext", { page: nextPage })}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function HomeworkReadingCard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data, isLoading } = useGetTelawaHomeworkReading();
  const { data: settings } = useGetSettings();
  const hideOnJump = settings?.hideReaderOnJump !== false;
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (isLoading) return <Skeleton className="h-20 rounded-xl" />;
  if (!data || data.pages.length === 0) return null;

  const { weeklyGoal, pages } = data;
  const totalNeeded = pages.length * weeklyGoal;
  const totalDone = pages.reduce((sum, p) => sum + Math.min(p.weekCount, weeklyGoal), 0);
  const pct = Math.min(100, Math.round((totalDone / Math.max(1, totalNeeded)) * 100));
  const pagesMet = pages.filter(p => p.weekCount >= weeklyGoal).length;
  const allDone = pagesMet === pages.length;
  const nextPage = pages.find(p => p.weekCount < weeklyGoal);

  const handleIncreaseGoal = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newGoal = weeklyGoal + 2;
    updateSettings.mutate(
      { data: { homeworkWeeklyReadGoal: newGoal } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({ title: t("telawa.homeworkReading.dashboard.goalIncreased", { goal: newGoal }) });
        },
        onError: () => {
          toast({ title: t("telawa.homeworkReading.dashboard.goalIncreaseFailed"), variant: "destructive" });
        },
      },
    );
  };

  return (
    <div
      className="border rounded-xl shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer bg-card"
      onClick={() => setLocation("/telawa")}
      data-testid="dashboard-homework-reading-card"
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setLocation("/telawa"); }}
    >
      <div className="py-4 px-5">
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-0.5 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              {t("telawa.homeworkReading.dashboard.title")}
            </p>
            <p className="font-semibold text-sm">
              {t("telawa.homeworkReading.dashboard.progress", {
                done: totalDone,
                total: totalNeeded,
                goal: weeklyGoal,
              })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ms-3">
            <div className="text-end">
              <p className="text-xs text-muted-foreground">
                {t("telawa.homeworkReading.dashboard.pagesMet", {
                  met: pagesMet,
                  total: pages.length,
                })}
              </p>
              <p className="text-xs font-medium">
                {allDone
                  ? t("telawa.homeworkReading.dashboard.allDone")
                  : t("telawa.homeworkReading.dashboard.remaining", {
                      count: pages.length - pagesMet,
                    })}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground rtl:rotate-180" />
          </div>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-xs text-muted-foreground">
            {t("telawa.homeworkReading.dashboard.pct", { pct })}
          </p>
          {allDone ? (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs gap-1 px-2 py-0 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950"
              onClick={handleIncreaseGoal}
              disabled={updateSettings.isPending}
            >
              <PlusCircle className="w-3 h-3" />
              {t("telawa.homeworkReading.dashboard.increaseGoal", { current: weeklyGoal, next: weeklyGoal + 2 })}
            </Button>
          ) : nextPage != null ? (
            <Link
              href={readerUrl(nextPage.pageNumber, hideOnJump)}
              onClick={e => e.stopPropagation()}
            >
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1 px-2 py-0"
                onClick={e => e.stopPropagation()}
              >
                <BookOpen className="w-3 h-3" />
                {t("telawa.homeworkReading.dashboard.readNext", {
                  page: nextPage.pageNumber,
                  count: nextPage.weekCount,
                  goal: weeklyGoal,
                })}
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HomeworkAyahCorrectnessCard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data, isLoading } = useGetTelawaHomeworkAyahCorrectness();

  if (isLoading) return <Skeleton className="h-20 rounded-xl" />;
  if (!data) return null;

  const { homeworkTitle, dueDate, isOverdue, totalAyahs, correctAyahs, firstIncorrectAyahNumber } = data;
  const pct = Math.min(100, Math.round((correctAyahs / Math.max(1, totalAyahs)) * 100));
  const allCorrect = correctAyahs === totalAyahs;

  const dueDateLabel = isOverdue
    ? t("telawa.homeworkAyahCorrectness.dashboard.overdue")
    : t("telawa.homeworkAyahCorrectness.dashboard.dueIn", {
        date: format(new Date(dueDate), "MMM d"),
      });

  return (
    <div
      className="border rounded-xl shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer bg-card"
      onClick={() => setLocation("/homework")}
      data-testid="dashboard-homework-ayah-correctness-card"
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setLocation("/homework"); }}
    >
      <div className="py-4 px-5">
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-0.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t("telawa.homeworkAyahCorrectness.dashboard.title")}
            </p>
            <p className="font-semibold text-sm truncate" title={homeworkTitle}>
              {homeworkTitle}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ms-3">
            <div className="text-end">
              <p className="text-xs text-muted-foreground">
                {t("telawa.homeworkAyahCorrectness.dashboard.progress", {
                  correct: correctAyahs,
                  total: totalAyahs,
                })}
              </p>
              <p className={`text-xs font-medium ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                {dueDateLabel}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground rtl:rotate-180" />
          </div>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-xs text-muted-foreground">
            {t("telawa.homeworkAyahCorrectness.dashboard.pct", { pct })}
          </p>
          {allCorrect ? (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {t("telawa.homeworkAyahCorrectness.dashboard.doneLabel")}
            </span>
          ) : firstIncorrectAyahNumber != null ? (
            <Link
              href={`/ayahs/${firstIncorrectAyahNumber}`}
              onClick={e => e.stopPropagation()}
            >
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1 px-2 py-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950"
                onClick={e => e.stopPropagation()}
              >
                <BookOpenCheck className="w-3 h-3" />
                {t("telawa.homeworkAyahCorrectness.dashboard.practiceNext", {
                  ayah: firstIncorrectAyahNumber,
                })}
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DuePagesSection() {
  const { t, i18n } = useTranslation();
  const { data: overdue, isLoading: loadingOverdue } = useListPageProgress({ status: "overdue", inScope: true });
  const { data: dueSoon, isLoading: loadingDueSoon } = useListPageProgress({ status: "due_soon", inScope: true });
  const { data: settings } = useGetSettings();
  const updatePage = useUpdatePageProgress();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedSurahs, setExpandedSurahs] = useState<Set<number>>(new Set());
  const initializedRef = useRef(false);

  const allPages = useMemo(() => [
    ...(overdue ?? []).map(p => ({ ...p, urgency: "overdue" as const })),
    ...(dueSoon ?? []).map(p => ({ ...p, urgency: "due_soon" as const })),
  ].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    return da - db;
  }), [overdue, dueSoon]);

  // Group pages by surah. Pages spanning multiple surahs appear under each one.
  const surahGroups = useMemo(() => {
    const map = new Map<number, { surah: typeof SURAHS[number]; pages: typeof allPages }>();
    for (const page of allPages) {
      const matchedSurahs = SURAHS.filter(s => s.startPage <= page.pageNumber && s.endPage >= page.pageNumber);
      for (const s of matchedSurahs) {
        if (!map.has(s.number)) map.set(s.number, { surah: s, pages: [] });
        map.get(s.number)!.pages.push(page);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.surah.number - b.surah.number)
      .map(g => ({ ...g, pages: [...g.pages].sort((a, b) => a.pageNumber - b.pageNumber) }));
  }, [allPages]);

  // Initialize group expand/collapse state on first load, respecting the
  // user's duePagesSectionCollapsed preference. Wait until both settings and
  // groups are available so we don't initialise before the setting is fetched.
  useEffect(() => {
    if (!initializedRef.current && surahGroups.length > 0 && settings !== undefined) {
      initializedRef.current = true;
      // When collapsed preference is true (default), start with nothing expanded.
      // When false (old behaviour), expand all groups immediately.
      const startCollapsed = settings.duePagesSectionCollapsed;
      setExpandedSurahs(startCollapsed ? new Set() : new Set(surahGroups.map(g => g.surah.number)));
    }
  }, [surahGroups, settings]);

  const toggleSurah = (surahNumber: number) => {
    setExpandedSurahs(prev => {
      const next = new Set(prev);
      if (next.has(surahNumber)) next.delete(surahNumber);
      else next.add(surahNumber);
      return next;
    });
  };

  const isLoading = loadingOverdue || loadingDueSoon;

  const handleQuality = (pageNumber: number, quality: Quality) => {
    updatePage.mutate(
      { pageNumber, data: { quality } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListJuzProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListSurahProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDailyChartQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProgressChartQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
          queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/homework/") });
        },
        onError: () => toast({ title: t("errors.failedRecord"), variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  if (allPages.length === 0) {
    return (
      <Card className="border shadow-sm" data-testid="due-pages-empty">
        <CardContent className="py-6 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium">{t("dashboard.allCaughtUp")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.noPagesDue")}</p>
        </CardContent>
      </Card>
    );
  }

  const isAr = i18n.language === "ar";

  const renderPageRow = (page: typeof allPages[number]) => {
    const isOverdue = page.urgency === "overdue";
    const daysLabel = page.daysUntilDue !== null
      ? isOverdue
        ? t("dashboard.daysOverdue", { count: Math.abs(page.daysUntilDue) })
        : t("dashboard.dueInDays", { count: page.daysUntilDue })
      : null;
    const q = page.quality as Quality | null;

    return (
      <div
        key={page.pageNumber}
        className={`px-4 py-3 ${isOverdue ? "bg-rose-50/50" : "bg-amber-50/30"}`}
        data-testid={`due-page-${page.pageNumber}`}
      >
        <div className="flex items-center gap-3 min-w-0 mb-2">
          <div className={`w-1.5 h-7 rounded-full shrink-0 ${isOverdue ? "bg-rose-500" : "bg-amber-400"}`} />
          <div className="min-w-0 flex-1">
            <PageLabel
              pageNumber={page.pageNumber}
              customName={page.customName}
              prefixClassName="font-medium text-sm"
              nameClassName="text-sm"
            />
            <div className="text-xs text-muted-foreground truncate">{page.surahs.split(",")[0]}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <QualityBadge quality={page.quality} effectiveQuality={page.effectiveQuality} qualityDowngrades={page.qualityDowngrades} />
            {daysLabel && (
              <span className={`text-xs font-medium ${isOverdue ? "text-rose-600" : "text-amber-600"}`}>
                {daysLabel}
              </span>
            )}
            <Link href={readerUrl(page.pageNumber, settings?.hideReaderOnJump !== false)}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title={t("dashboard.openInReader")}
                data-testid={`due-page-open-reader-${page.pageNumber}`}
              >
                <BookOpen className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-1 ps-4">
          {QUALITY_VALUES.map((value) => {
            const isActive = q === value;
            const style = qualityStyle[value];
            return (
              <button
                key={value}
                onClick={() => handleQuality(page.pageNumber, value)}
                disabled={updatePage.isPending}
                className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-all ${
                  isActive ? style.active : `border-border bg-background text-muted-foreground ${style.hover}`
                }`}
                data-testid={`due-page-quality-${page.pageNumber}-${value}`}
              >
                {t(`quality.${value}`)}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card className="border shadow-sm" data-testid="due-pages-section">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500" />
          {t("dashboard.pagesAttention")}
          <span className="ms-auto text-xs font-normal text-muted-foreground">{t("dashboard.pagesCount", { count: allPages.length })}</span>
        </CardTitle>
      </CardHeader>
      <Tabs defaultValue="surah">
        <div className="px-4 pb-2">
          <TabsList className="h-8">
            <TabsTrigger value="surah" className="text-xs px-3 h-6">{t("dashboard.viewBySurah")}</TabsTrigger>
            <TabsTrigger value="all" className="text-xs px-3 h-6">{t("dashboard.viewAllPages")}</TabsTrigger>
          </TabsList>
        </div>
        <CardContent className="p-0">
          {/* Primary view: pages grouped by surah (collapsible) */}
          <TabsContent value="surah" className="mt-0">
            <div className="divide-y max-h-[32rem] overflow-y-auto">
              {surahGroups.map(({ surah, pages }) => {
                const isExpanded = expandedSurahs.has(surah.number);
                const overdueCount = pages.filter(p => p.urgency === "overdue").length;
                const dueSoonCount = pages.filter(p => p.urgency === "due_soon").length;

                return (
                  <div key={surah.number}>
                    <button
                      type="button"
                      onClick={() => toggleSurah(surah.number)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors text-start"
                    >
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      }
                      <span className="flex-1 min-w-0 flex items-baseline gap-1.5 truncate">
                        <span className="font-medium text-sm" dir="rtl">{surah.arabic}</span>
                        {!isAr && (
                          <span className="text-xs text-muted-foreground truncate">{surah.number}. {surah.name}</span>
                        )}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {overdueCount > 0 && (
                          <span className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 leading-none">
                            {overdueCount}
                          </span>
                        )}
                        {dueSoonCount > 0 && (
                          <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 leading-none">
                            {dueSoonCount}
                          </span>
                        )}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="divide-y">
                        {pages.map(page => renderPageRow(page))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* Secondary view: flat list, most overdue first */}
          <TabsContent value="all" className="mt-0">
            <div className="divide-y max-h-[32rem] overflow-y-auto">
              {allPages.map(page => renderPageRow(page))}
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}

function DailyChartSection() {
  const { t } = useTranslation();
  const { data: chartData, isLoading } = useGetDailyChart({ days: 14 });

  if (isLoading) {
    return <Skeleton className="h-52 rounded-xl" />;
  }

  const hasAny = chartData?.some(d => d.pages > 0);

  const formatted = chartData?.map(d => ({
    ...d,
    label: format(parseISO(d.date), "MMM d"),
    shortLabel: format(parseISO(d.date), "d"),
  })) ?? [];

  return (
    <Card className="border shadow-sm" data-testid="daily-chart-section">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t("dashboard.dailyRecitation")}</CardTitle>
          <span className="text-xs text-muted-foreground">{t("dashboard.last30Days")}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-4 px-2">
        {!hasAny ? (
          <div className="h-40 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">{t("dashboard.noRecitations30")}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={formatted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={8}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="shortLabel"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof formatted)[0];
                  return (
                    <div className="bg-background border rounded-lg shadow-md px-3 py-2 text-sm">
                      <div className="font-medium">{d.label}</div>
                      <div className="text-muted-foreground">{t("dashboard.pagesCount", { count: d.pages })}</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="pages" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// Renders a value label only at sparse intervals (every Nth point) and skips
// zeros, so the line chart numbers are readable without crowding.
function makeSparseLabel(totalPoints: number, fill: string) {
  // Aim for ~6-7 labels visible regardless of series length.
  const step = Math.max(1, Math.ceil(totalPoints / 7));
  return function SparseLabel(props: {
    x?: number;
    y?: number;
    value?: number;
    index?: number;
  }) {
    const { x, y, value, index } = props;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof value !== "number" ||
      typeof index !== "number"
    ) {
      return null;
    }
    const isLast = index === totalPoints - 1;
    if (value === 0) return null;
    if (!isLast && index % step !== 0) return null;
    return (
      <text
        x={x}
        y={y}
        dy={-6}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        fill={fill}
      >
        {value}
      </text>
    );
  };
}

function ProgressChartSection() {
  const { t } = useTranslation();
  const { data: chartData, isLoading } = useGetProgressChart({ days: 14 });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    );
  }

  let cumMemo = 0, cumLink = 0;
  const formatted = chartData?.map(d => {
    const total = d.overdueCount + d.onTrackCount;
    cumMemo += d.dailyMemoMistakes;
    cumLink += d.dailyLinkMistakes;
    return {
      ...d,
      label: format(parseISO(d.date), "MMM d"),
      shortLabel: format(parseISO(d.date), "d"),
      overduePercent: total > 0 ? Math.round((d.overdueCount / total) * 100) : 0,
      onTrackPercent: total > 0 ? Math.round((d.onTrackCount / total) * 100) : 0,
      cumMemoMistakes: cumMemo,
      cumLinkMistakes: cumLink,
    };
  }) ?? [];

  const today = formatted.length > 0 ? formatted[formatted.length - 1] : null;
  const hasStatus = formatted.some(d => d.overdueCount > 0 || d.onTrackCount > 0);
  const hasActivity = formatted.some(d => d.dailyRecitedCount > 0 || d.dailyTelawaCount > 0);
  const hasMistakesData = formatted.some(d => d.cumMemoMistakes > 0 || d.cumLinkMistakes > 0);

  const sharedXAxis = (
    <XAxis
      dataKey="shortLabel"
      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
      axisLine={false}
      tickLine={false}
      interval={1}
    />
  );

  const sharedGrid = (
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
  );

  return (
    <div className="space-y-4" data-testid="progress-chart-section">

      {/* Chart 1: Overdue & On Track — counts (left) + percentages (right) */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-1 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">{t("dashboard.statusChart")}</CardTitle>
            <span className="text-xs text-muted-foreground">{t("dashboard.last14Days")}</span>
          </div>
          {today && (
            <div className="flex items-center gap-3 flex-wrap mt-0.5">
              <span className="flex items-center gap-1 text-[11px]">
                <span className="w-2 h-2 rounded-full shrink-0 bg-rose-500" />
                <span className="text-muted-foreground">{t("dashboard.overduePages")}:</span>
                <span className="font-semibold ms-1">{today.overdueCount}</span>
              </span>
              <span className="flex items-center gap-1 text-[11px]">
                <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-500" />
                <span className="text-muted-foreground">{t("dashboard.onTrackPages")}:</span>
                <span className="font-semibold ms-1">{today.onTrackCount}</span>
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-1 pb-3 px-2">
          {!hasStatus ? (
            <div className="h-40 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{t("dashboard.noProgressYet")}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={formatted} margin={{ top: 6, right: 40, left: -8, bottom: 0 }}>
                {sharedGrid}
                {sharedXAxis}
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof formatted)[0];
                    return (
                      <div className="bg-background border rounded-lg shadow-md px-3 py-2 text-xs space-y-1">
                        <div className="font-semibold text-sm mb-1">{d.label}</div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                          <span className="text-muted-foreground">{t("dashboard.overduePages")}:</span>
                          <span className="font-semibold ms-auto ps-2">{d.overduePercent}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="text-muted-foreground">{t("dashboard.onTrackPages")}:</span>
                          <span className="font-semibold ms-auto ps-2">{d.onTrackPercent}%</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                  iconType="circle"
                  iconSize={9}
                  formatter={(value) => (
                    <span style={{ color: "hsl(var(--foreground))", fontSize: 11 }}>{value}</span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="overduePercent"
                  name={t("dashboard.overduePages")}
                  stroke="#f43f5e"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "#f43f5e", strokeWidth: 0 }}
                  activeDot={{ r: 4.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="onTrackPercent"
                  name={t("dashboard.onTrackPages")}
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "#10b981", strokeWidth: 0 }}
                  activeDot={{ r: 4.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Chart 2: Daily Reading Activity — memorization recited + telawa */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-1 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">{t("dashboard.dailyActivityChart")}</CardTitle>
            <span className="text-xs text-muted-foreground">{t("dashboard.last14Days")}</span>
          </div>
          {today && (
            <div className="flex items-center gap-3 flex-wrap mt-0.5">
              <span className="flex items-center gap-1 text-[11px]">
                <span className="w-2 h-2 rounded-full shrink-0 bg-primary" />
                <span className="text-muted-foreground">{t("dashboard.pagesRecitedToday")}:</span>
                <span className="font-semibold ms-1">{today.dailyRecitedCount}</span>
              </span>
              <span className="flex items-center gap-1 text-[11px]">
                <span className="w-2 h-2 rounded-full shrink-0 bg-violet-500" />
                <span className="text-muted-foreground">{t("dashboard.telawaPages")}:</span>
                <span className="font-semibold ms-1">{today.dailyTelawaCount}</span>
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-1 pb-3 px-2">
          {!hasActivity ? (
            <div className="h-36 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{t("dashboard.noProgressYet")}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={formatted} margin={{ top: 6, right: 40, left: -8, bottom: 0 }}>
                {sharedGrid}
                {sharedXAxis}
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof formatted)[0];
                    return (
                      <div className="bg-background border rounded-lg shadow-md px-3 py-2 text-xs space-y-1">
                        <div className="font-semibold text-sm mb-1">{d.label}</div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
                          <span className="text-muted-foreground">{t("dashboard.pagesRecitedToday")}:</span>
                          <span className="font-semibold ms-auto ps-2">{d.dailyRecitedCount}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0" />
                          <span className="text-muted-foreground">{t("dashboard.telawaPages")}:</span>
                          <span className="font-semibold ms-auto ps-2">{d.dailyTelawaCount}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                  iconType="circle"
                  iconSize={9}
                  formatter={(value) => (
                    <span style={{ color: "hsl(var(--foreground))", fontSize: 11 }}>{value}</span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="dailyRecitedCount"
                  name={t("dashboard.pagesRecitedToday")}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                  activeDot={{ r: 4.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="dailyTelawaCount"
                  name={t("dashboard.telawaPages")}
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "#8b5cf6", strokeWidth: 0 }}
                  activeDot={{ r: 4.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Chart 3: Cumulative Ayah Mistakes — memorization + link */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-1 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">{t("dashboard.mistakesChart")}</CardTitle>
            <span className="text-xs text-muted-foreground">{t("dashboard.last14Days")}</span>
          </div>
          {today && (
            <div className="flex items-center gap-3 flex-wrap mt-0.5">
              <span className="flex items-center gap-1 text-[11px]">
                <span className="w-2 h-2 rounded-full shrink-0 bg-rose-500" />
                <span className="text-muted-foreground">{t("dashboard.memoMistakes")}:</span>
                <span className="font-semibold ms-1">{today.cumMemoMistakes}</span>
              </span>
              <span className="flex items-center gap-1 text-[11px]">
                <span className="w-2 h-2 rounded-full shrink-0 bg-violet-500" />
                <span className="text-muted-foreground">{t("dashboard.linkMistakes")}:</span>
                <span className="font-semibold ms-1">{today.cumLinkMistakes}</span>
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-1 pb-3 px-2">
          {!hasMistakesData ? (
            <div className="h-36 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{t("dashboard.noProgressYet")}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={formatted} margin={{ top: 6, right: 40, left: -8, bottom: 0 }}>
                {sharedGrid}
                {sharedXAxis}
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof formatted)[0];
                    return (
                      <div className="bg-background border rounded-lg shadow-md px-3 py-2 text-xs space-y-1">
                        <div className="font-semibold text-sm mb-1">{d.label}</div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                          <span className="text-muted-foreground">{t("dashboard.memoMistakes")}:</span>
                          <span className="font-semibold ms-auto ps-2">{d.cumMemoMistakes}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0" />
                          <span className="text-muted-foreground">{t("dashboard.linkMistakes")}:</span>
                          <span className="font-semibold ms-auto ps-2">{d.cumLinkMistakes}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                  iconType="circle"
                  iconSize={9}
                  formatter={(value) => (
                    <span style={{ color: "hsl(var(--foreground))", fontSize: 11 }}>{value}</span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="cumMemoMistakes"
                  name={t("dashboard.memoMistakes")}
                  stroke="#f43f5e"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "#f43f5e", strokeWidth: 0 }}
                  activeDot={{ r: 4.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="cumLinkMistakes"
                  name={t("dashboard.linkMistakes")}
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "#8b5cf6", strokeWidth: 0 }}
                  activeDot={{ r: 4.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

function RecentActivitySection() {
  const { t } = useTranslation();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ limit: 10 });
  const undo = useUndoRecitation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingUndo, setPendingUndo] = useState<{ id: number; pageNumber: number; quality: string } | null>(null);

  const handleConfirm = () => {
    if (!pendingUndo) return;
    const { id, pageNumber } = pendingUndo;
    undo.mutate(
      { id },
      {
        onSuccess: () => {
          setPendingUndo(null);
          toast({ title: t("dashboard.undoSuccess"), description: t("dashboard.undoSuccessDesc", { page: pageNumber }) });
          queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListJuzProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListSurahProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDailyChartQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProgressChartQueryKey() });
          // Detail keys are per-id (e.g. ["/api/progress/juz/3"]). Use a predicate
          // to invalidate any open juz/surah detail — we don't know which one the
          // page belongs to without duplicating server logic on the client.
          queryClient.invalidateQueries({
            predicate: (q) => {
              const k = q.queryKey[0];
              return typeof k === "string" && (k.startsWith("/api/progress/juz/") || k.startsWith("/api/progress/surah/"));
            },
          });
        },
        onError: () => {
          toast({ title: t("dashboard.undoFailed"), variant: "destructive" });
          setPendingUndo(null);
        },
      },
    );
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("dashboard.recentActivity")}</CardTitle>
      </CardHeader>
      <CardContent>
        {activityLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : activity && activity.length > 0 ? (
          <div className="space-y-2">
            {activity.map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
                data-testid={`activity-${entry.id}`}
              >
                <div className="min-w-0 flex-1">
                  <PageLabel
                    pageNumber={entry.pageNumber}
                    customName={null}
                    showEdit={false}
                    prefixClassName="text-sm font-medium"
                    nameClassName="text-sm"
                  />
                  <div className="text-xs text-muted-foreground truncate">{entry.surahName}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <QualityBadge quality={entry.quality} />
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {new Date(entry.recitedAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingUndo({ id: entry.id, pageNumber: entry.pageNumber, quality: entry.quality })}
                    disabled={undo.isPending}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    aria-label={t("dashboard.undoTitle")}
                    title={t("dashboard.undoTitle")}
                    data-testid={`undo-activity-${entry.id}`}
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">{t("dashboard.noRecitations")}</p>
        )}

        <AlertDialog open={pendingUndo !== null} onOpenChange={(open) => { if (!open) setPendingUndo(null); }}>
          <AlertDialogContent data-testid="undo-confirm-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("dashboard.undoTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingUndo
                  ? t("dashboard.undoDescription", { quality: t(`quality.${pendingUndo.quality}`), page: pendingUndo.pageNumber })
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="undo-cancel">{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirm}
                disabled={undo.isPending}
                data-testid="undo-confirm"
                className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
              >
                {undo.isPending ? t("dashboard.undoing") : t("dashboard.undo")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { data: overview, isLoading: overviewLoading } = useGetProgressOverview();

  if (overviewLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">{t("dashboard.title")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!overview) return null;

  const showOnboardingCta = overview.pagesInScope === 0;

  const pct = (value: number, denom: number) =>
    denom > 0 ? Math.round((value / denom) * 100) : 0;

  const statCards = [
    {
      key: "in-scope",
      label: t("dashboard.stats.inScope"),
      value: overview.pagesInScope,
      total: overview.totalPages,
      percent: pct(overview.pagesInScope, overview.totalPages),
      percentLabel: t("dashboard.stats.ofQuran"),
      icon: BookOpen,
      color: "text-primary",
    },
    {
      key: "overdue",
      label: t("dashboard.stats.overdue"),
      value: overview.pagesOverdue,
      percent: pct(overview.pagesOverdue, overview.pagesInScope),
      percentLabel: t("dashboard.stats.ofInScope"),
      icon: AlertTriangle,
      color: "text-rose-500",
    },
    {
      key: "due-soon",
      label: t("dashboard.stats.dueSoon"),
      value: overview.pagesDueSoon,
      percent: pct(overview.pagesDueSoon, overview.pagesInScope),
      percentLabel: t("dashboard.stats.ofInScope"),
      icon: Clock,
      color: "text-amber-500",
    },
    {
      key: "on-track",
      label: t("dashboard.stats.onTrack"),
      value: overview.pagesOnTrack,
      percent: pct(overview.pagesOnTrack, overview.pagesInScope),
      percentLabel: t("dashboard.stats.ofInScope"),
      icon: CheckCircle,
      color: "text-emerald-500",
    },
  ];

  return (
    <div className="space-y-5" data-testid="dashboard-page">
      <GuestSavePrompt />
      <OnboardingScopeAuto open={showOnboardingCta} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{t("dashboard.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
        </div>
        {overview.streakDays > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl" data-testid="streak-counter">
            <Flame className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-semibold text-amber-700">{t("dashboard.streak", { count: overview.streakDays })}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(stat => (
          <Card key={stat.key} className="border shadow-sm" data-testid={`stat-${stat.key}`}>
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                {stat.total && (
                  <span className="text-xs text-muted-foreground">/ {stat.total}</span>
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className={`text-xs font-medium ${stat.color}`} data-testid={`stat-${stat.key}-percent`}>
                  {stat.percent}%
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {stat.label} <span className="opacity-60">· {stat.percentLabel}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ActiveHomeworkSection />

      <TelawaCard />

      <TelawaScopeCard />

      <HomeworkReadingCard />

      <HomeworkAyahCorrectnessCard />

      <ProgressChartSection />

      <DuePagesSection />

      <DailyChartSection />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("dashboard.qualityBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { key: "excellent" as Quality, count: overview.excellentCount, color: "bg-emerald-500" },
                { key: "good" as Quality, count: overview.goodCount, color: "bg-teal-600" },
                { key: "hard" as Quality, count: overview.hardCount, color: "bg-amber-500" },
                { key: "relearn" as Quality, count: overview.relearnCount, color: "bg-rose-500" },
              ].map(item => {
                const total = overview.pagesInScope || 1;
                const pct = Math.round((item.count / total) * 100);
                return (
                  <div key={item.key} className="flex items-center gap-3" data-testid={`quality-bar-${item.key}`}>
                    <span className="text-sm w-20 text-muted-foreground">{t(`quality.${item.key}`)}</span>
                    <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-medium w-10 text-end">{item.count}</span>
                  </div>
                );
              })}
            </div>
            {overview.pagesInScope === 0 && (
              <div className="text-center py-4 space-y-2">
                <p className="text-sm text-muted-foreground">{t("dashboard.noPagesScope")}</p>
                <OnboardingTrigger variant="link" />
              </div>
            )}
          </CardContent>
        </Card>

        <RecentActivitySection />
      </div>
    </div>
  );
}
