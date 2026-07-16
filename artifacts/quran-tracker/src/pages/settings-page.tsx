import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import { useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Save, Download, Upload, ArrowUp, ArrowDown, X, Plus, RotateCcw } from "lucide-react";
import { setLanguage, type SupportedLanguage } from "@/i18n";
import {
  ALLOWED_BOTTOM_NAV_KEYS,
  DEFAULT_BOTTOM_NAV_KEYS,
  MAX_BOTTOM_NAV_ITEMS,
  resolveBottomNavKeys,
  type BottomNavKey,
} from "@/lib/bottom-nav";

export default function SettingsPage() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();

  const [excellentDays, setExcellentDays] = useState("");
  const [goodDays, setGoodDays] = useState("");
  const [hardDays, setHardDays] = useState("");
  const [relearnDays, setRelearnDays] = useState("");
  const [telawaPagesPerDay, setTelawaPagesPerDay] = useState("");
  const [homeworkWeeklyReadGoal, setHomeworkWeeklyReadGoal] = useState("");
  const [readerFontSize, setReaderFontSize] = useState("");
  const [ayahViewFontSize, setAyahViewFontSize] = useState("");
  const [language, setLanguageState] = useState<SupportedLanguage>("en");
  // Mobile bottom-tab order. Hydrated from settings via the same shared
  // normaliser the Layout uses so the picker and the live bar always agree
  // on what's "selected" even when the server returns unknown/legacy keys.
  const [bottomNavKeys, setBottomNavKeys] = useState<BottomNavKey[]>([]);
  // Auto-assign page recitation from same-day ayah marks. Persisted in
  // settings.autoAssignPageFromAyahs and toggled instantly (separate
  // mutation, no Save button needed) so the user gets immediate feedback.
  const [autoAssign, setAutoAssign] = useState(false);
  // Thresholds (inclusive) feeding the auto-assign quality bucketing.
  // Saved together with the day-buffer settings via the page-level Save
  // button so users see one confirmation toast for the whole card.
  const [mistakesGoodMax, setMistakesGoodMax] = useState("");
  const [mistakesHardMax, setMistakesHardMax] = useState("");
  // Auto-expire per-ayah marks after 14 days. Toggled instantly like
  // autoAssign — no Save button needed.
  const [autoExpireAyahMarks, setAutoExpireAyahMarks] = useState(false);
  // Whether the "Pages Requiring Attention" surah groups on the Dashboard
  // start collapsed by default. Toggled instantly — no Save button needed.
  const [duePagesSectionCollapsed, setDuePagesSectionCollapsed] = useState(true);
  // When true, the Reader auto-enters hide mode when opened from Dashboard
  // due-pages or Homework. Toggled instantly — no Save button needed.
  const [hideReaderOnJump, setHideReaderOnJump] = useState(true);

  useEffect(() => {
    if (settings) {
      setExcellentDays(String(settings.excellentDays));
      setGoodDays(String(settings.goodDays));
      setHardDays(String(settings.hardDays));
      setRelearnDays(String(settings.relearnDays));
      setTelawaPagesPerDay(String(settings.telawaPagesPerDay));
      setHomeworkWeeklyReadGoal(String(settings.homeworkWeeklyReadGoal));
      setReaderFontSize(String(settings.readerFontSize));
      setAyahViewFontSize(String(settings.ayahViewFontSize));
      setBottomNavKeys([...resolveBottomNavKeys(settings.bottomNavKeys)]);
      setAutoAssign(settings.autoAssignPageFromAyahs);
      setMistakesGoodMax(String(settings.mistakesGoodMax));
      setMistakesHardMax(String(settings.mistakesHardMax));
      setAutoExpireAyahMarks(settings.autoExpireAyahMarks);
      setDuePagesSectionCollapsed(settings.duePagesSectionCollapsed);
      setHideReaderOnJump(settings.hideReaderOnJump);
      const lang = settings.language === "ar" ? "ar" : "en";
      setLanguageState(lang);
    }
  }, [settings]);

  const handleToggleAutoAssign = (next: boolean) => {
    // Optimistic: update local state immediately so the switch animates.
    setAutoAssign(next);
    updateSettings.mutate(
      { data: { autoAssignPageFromAyahs: next } },
      {
        onSuccess: () => {
          // Intentionally do NOT touch the React Query cache here.
          // Calling setQueryData or invalidateQueries would re-run the
          // useEffect([settings]) that rehydrates all local form inputs,
          // wiping any unsaved threshold / day-buffer edits in progress.
          // The value is already persisted on the server; the next full
          // settings fetch (on page reload or after Save) will reflect it.
        },
        onError: () => {
          // Roll back the local toggle so the UI doesn't lie about the
          // persisted state.
          setAutoAssign(!next);
        },
      }
    );
  };

  const handleToggleAutoExpireAyahMarks = (next: boolean) => {
    setAutoExpireAyahMarks(next);
    updateSettings.mutate(
      { data: { autoExpireAyahMarks: next } },
      {
        onError: () => {
          setAutoExpireAyahMarks(!next);
        },
      }
    );
  };

  const handleToggleDuePagesSectionCollapsed = (next: boolean) => {
    setDuePagesSectionCollapsed(next);
    updateSettings.mutate(
      { data: { duePagesSectionCollapsed: next } },
      {
        onError: () => {
          setDuePagesSectionCollapsed(!next);
        },
      }
    );
  };

  const handleToggleHideReaderOnJump = (next: boolean) => {
    setHideReaderOnJump(next);
    updateSettings.mutate(
      { data: { hideReaderOnJump: next } },
      {
        onError: () => {
          setHideReaderOnJump(!next);
        },
      }
    );
  };

  const handleLanguageChange = (value: string) => {
    const lang: SupportedLanguage = value === "ar" ? "ar" : "en";
    const previous = i18n.language === "ar" ? "ar" : "en";
    setLanguageState(lang);
    // Apply immediately for snappy UX, then persist.
    setLanguage(lang);
    updateSettings.mutate(
      { data: { language: lang } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
        onError: () => {
          // Roll the i18n side effect back so the UI doesn't end up in a
          // language the server never agreed to.
          setLanguage(previous);
          setLanguageState(previous);
          toast({ title: t("settings.saveFailed"), variant: "destructive" });
        },
      }
    );
  };

  const handleSave = () => {
    const tppd = parseInt(telawaPagesPerDay, 10);
    const hwrg = parseInt(homeworkWeeklyReadGoal, 10);
    const rfs = parseInt(readerFontSize, 10);
    const avfs = parseInt(ayahViewFontSize, 10);
    const mgm = parseInt(mistakesGoodMax, 10);
    const mhm = parseInt(mistakesHardMax, 10);
    // Both thresholds are required to be in 0..100 AND hard > good
    // (strictly — equality collapses the "good" bucket to nothing).
    // If either is out of range or the ordering is wrong we surface a
    // toast and bail rather than half-saving the form.
    const goodValid = Number.isFinite(mgm) && mgm >= 0 && mgm <= 100;
    const hardValid = Number.isFinite(mhm) && mhm >= 0 && mhm <= 100;
    if (goodValid && hardValid && mhm <= mgm) {
      toast({ title: t("settings.mistakeThresholds.hardBelowGood"), variant: "destructive" });
      return;
    }
    updateSettings.mutate(
      {
        data: {
          excellentDays: parseInt(excellentDays, 10),
          goodDays: parseInt(goodDays, 10),
          hardDays: parseInt(hardDays, 10),
          relearnDays: parseInt(relearnDays, 10),
          telawaPagesPerDay: Number.isFinite(tppd) && tppd >= 1 && tppd <= 604 ? tppd : undefined,
          // Per-page weekly read target for homework pages. Bounds mirror the
          // OpenAPI schema (1-50); out-of-range drops the field so the rest of
          // the form still saves.
          homeworkWeeklyReadGoal: Number.isFinite(hwrg) && hwrg >= 1 && hwrg <= 50 ? hwrg : undefined,
          // Bounds match the OpenAPI schema (14-64). Drop the field when
          // the user typed something out of range so the server keeps the
          // existing value rather than 400'ing the whole save.
          readerFontSize: Number.isFinite(rfs) && rfs >= 14 && rfs <= 64 ? rfs : undefined,
          // Same out-of-range fallback strategy as readerFontSize. Bounds
          // mirror the OpenAPI schema for ayahViewFontSize (14-96).
          ayahViewFontSize: Number.isFinite(avfs) && avfs >= 14 && avfs <= 96 ? avfs : undefined,
          bottomNavKeys: bottomNavKeys.slice(0, MAX_BOTTOM_NAV_ITEMS),
          mistakesGoodMax: goodValid ? mgm : undefined,
          mistakesHardMax: hardValid ? mhm : undefined,
        },
      },
      {
        onSuccess: (data) => {
          // Write the server response directly into the cache so any
          // screen we navigate to next (Reader, Ayahs, etc.) reads the
          // new values synchronously, without the brief window of stale
          // data that an invalidate-then-refetch produces.
          queryClient.setQueryData(getGetSettingsQueryKey(), data);
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({ title: t("settings.intervals.saved") });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-2xl font-semibold">{t("settings.title")}</h2>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const fields = [
    { key: "excellent", value: excellentDays, setter: setExcellentDays, color: "border-l-emerald-500" },
    { key: "good", value: goodDays, setter: setGoodDays, color: "border-l-teal-500" },
    { key: "hard", value: hardDays, setter: setHardDays, color: "border-l-amber-500" },
    { key: "relearn", value: relearnDays, setter: setRelearnDays, color: "border-l-rose-500" },
  ] as const;

  return (
    <div className="space-y-6 max-w-2xl" data-testid="settings-page">
      <div>
        <h2 className="text-2xl font-semibold">{t("settings.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.subtitle")}</p>
      </div>

      <Card className="border shadow-sm" data-testid="settings-language-card">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.language.title")}</CardTitle>
          <CardDescription>{t("settings.language.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">{t("settings.language.label")}</div>
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-44" data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en" data-testid="lang-option-en">{t("settings.language.english")}</SelectItem>
                <SelectItem value="ar" data-testid="lang-option-ar">{t("settings.language.arabic")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.intervals.title")}</CardTitle>
          <CardDescription>{t("settings.intervals.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map(field => (
            <div key={field.key} className={`flex items-center justify-between p-3 rounded-lg border-s-4 ${field.color} bg-muted/30`} data-testid={`setting-${field.key}`}>
              <div>
                <div className="font-medium text-sm">{t(`quality.${field.key}`)}</div>
                <div className="text-xs text-muted-foreground">{t(`settings.intervals.${field.key}Desc`)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  className="w-20 text-center"
                  value={field.value}
                  onChange={e => field.setter(e.target.value)}
                  data-testid={`input-${field.key}-days`}
                />
                <span className="text-sm text-muted-foreground">{t("settings.intervals.days")}</span>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between p-3 rounded-lg border-s-4 border-l-primary bg-muted/30" data-testid="setting-telawa">
            <div>
              <div className="font-medium text-sm">{t("settings.telawa.label")}</div>
              <div className="text-xs text-muted-foreground">{t("settings.telawa.description")}</div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={604}
                className="w-20 text-center"
                value={telawaPagesPerDay}
                onChange={(e) => setTelawaPagesPerDay(e.target.value)}
                data-testid="input-telawa-pages-per-day"
              />
              <span className="text-sm text-muted-foreground">{t("settings.telawa.pagesUnit")}</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border-s-4 border-l-primary bg-muted/30" data-testid="setting-homework-weekly-read-goal">
            <div>
              <div className="font-medium text-sm">{t("settings.homeworkReadGoal.label")}</div>
              <div className="text-xs text-muted-foreground">{t("settings.homeworkReadGoal.description")}</div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={50}
                className="w-20 text-center"
                value={homeworkWeeklyReadGoal}
                onChange={(e) => setHomeworkWeeklyReadGoal(e.target.value)}
                data-testid="input-homework-weekly-read-goal"
              />
              <span className="text-sm text-muted-foreground">{t("settings.homeworkReadGoal.unit")}</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border-s-4 border-l-primary bg-muted/30" data-testid="setting-reader-font-size">
            <div>
              <div className="font-medium text-sm">{t("settings.readerFontSize.label")}</div>
              <div className="text-xs text-muted-foreground">{t("settings.readerFontSize.description")}</div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={14}
                max={64}
                step={2}
                className="w-20 text-center"
                value={readerFontSize}
                onChange={(e) => setReaderFontSize(e.target.value)}
                data-testid="input-reader-font-size"
              />
              <span className="text-sm text-muted-foreground">{t("settings.readerFontSize.unit")}</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border-s-4 border-l-primary bg-muted/30" data-testid="setting-ayah-view-font-size">
            <div>
              <div className="font-medium text-sm">{t("settings.ayahViewFontSize.label")}</div>
              <div className="text-xs text-muted-foreground">{t("settings.ayahViewFontSize.description")}</div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={14}
                max={96}
                step={2}
                className="w-20 text-center"
                value={ayahViewFontSize}
                onChange={(e) => setAyahViewFontSize(e.target.value)}
                data-testid="input-ayah-view-font-size"
              />
              <span className="text-sm text-muted-foreground">{t("settings.ayahViewFontSize.unit")}</span>
            </div>
          </div>

          <Button onClick={handleSave} disabled={updateSettings.isPending} className="w-full" data-testid="btn-save-settings">
            <Save className="w-4 h-4 me-2" />
            {updateSettings.isPending ? t("common.saving") : t("settings.intervals.save")}
          </Button>
        </CardContent>
      </Card>

      <Card className="border shadow-sm" data-testid="settings-auto-assign-card">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.autoAssign.title")}</CardTitle>
          <CardDescription>{t("settings.autoAssign.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border-s-4 border-l-primary bg-muted/30" data-testid="setting-auto-assign-toggle">
            <div className="text-sm font-medium">{t("settings.autoAssign.label")}</div>
            <Switch
              checked={autoAssign}
              onCheckedChange={handleToggleAutoAssign}
              data-testid="switch-auto-assign-page"
              aria-label={t("settings.autoAssign.label")}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("settings.autoExpire.title")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("settings.autoExpire.description")}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border-s-4 border-l-amber-500 bg-muted/30" data-testid="setting-auto-expire-toggle">
            <div className="text-sm font-medium">{t("settings.autoExpire.label")}</div>
            <Switch
              checked={autoExpireAyahMarks}
              onCheckedChange={handleToggleAutoExpireAyahMarks}
              data-testid="switch-auto-expire-ayah-marks"
              aria-label={t("settings.autoExpire.label")}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("settings.duePagesSectionCollapsed.title")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("settings.duePagesSectionCollapsed.description")}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border-s-4 border-l-sky-500 bg-muted/30" data-testid="setting-due-pages-collapsed-toggle">
            <div className="text-sm font-medium">{t("settings.duePagesSectionCollapsed.label")}</div>
            <Switch
              checked={duePagesSectionCollapsed}
              onCheckedChange={handleToggleDuePagesSectionCollapsed}
              data-testid="switch-due-pages-section-collapsed"
              aria-label={t("settings.duePagesSectionCollapsed.label")}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("settings.hideReaderOnJump.title")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("settings.hideReaderOnJump.description")}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border-s-4 border-l-violet-500 bg-muted/30" data-testid="setting-hide-reader-on-jump-toggle">
            <div className="text-sm font-medium">{t("settings.hideReaderOnJump.label")}</div>
            <Switch
              checked={hideReaderOnJump}
              onCheckedChange={handleToggleHideReaderOnJump}
              data-testid="switch-hide-reader-on-jump"
              aria-label={t("settings.hideReaderOnJump.label")}
            />
          </div>

          {autoAssign && <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("settings.mistakeThresholds.title")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("settings.mistakeThresholds.description")}
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border-s-4 border-l-teal-500 bg-muted/30" data-testid="setting-mistakes-good-max">
              <div className="font-medium text-sm">{t("settings.mistakeThresholds.goodLabel")}</div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="w-20 text-center"
                  value={mistakesGoodMax}
                  onChange={(e) => setMistakesGoodMax(e.target.value)}
                  data-testid="input-mistakes-good-max"
                />
                <span className="text-sm text-muted-foreground">{t("settings.mistakeThresholds.mistakesUnit")}</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border-s-4 border-l-amber-500 bg-muted/30" data-testid="setting-mistakes-hard-max">
              <div className="font-medium text-sm">{t("settings.mistakeThresholds.hardLabel")}</div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="w-20 text-center"
                  value={mistakesHardMax}
                  onChange={(e) => setMistakesHardMax(e.target.value)}
                  data-testid="input-mistakes-hard-max"
                />
                <span className="text-sm text-muted-foreground">{t("settings.mistakeThresholds.mistakesUnit")}</span>
              </div>
            </div>
          </div>}
        </CardContent>
      </Card>

      <BottomNavCard
        selected={bottomNavKeys}
        onChange={setBottomNavKeys}
      />

      <BackupCard />
    </div>
  );
}

/**
 * Lets the user pick which screens appear in the mobile bottom-tab bar
 * and in what order. Selection is capped at MAX_BOTTOM_NAV_ITEMS to keep
 * the bar tappable. Changes are staged into the parent's bottomNavKeys
 * state and persisted alongside the other settings via the page-level
 * Save button — there is no separate save here so users see one
 * confirmation toast for the whole settings card.
 */
function BottomNavCard({
  selected,
  onChange,
}: {
  selected: BottomNavKey[];
  onChange: (next: BottomNavKey[]) => void;
}) {
  const { t } = useTranslation();

  const available = useMemo<BottomNavKey[]>(() => {
    const picked = new Set(selected);
    return ALLOWED_BOTTOM_NAV_KEYS.filter((k) => !picked.has(k));
  }, [selected]);

  const atLimit = selected.length >= MAX_BOTTOM_NAV_ITEMS;

  const move = (idx: number, delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= selected.length) return;
    const next = selected.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };
  const remove = (key: BottomNavKey) =>
    onChange(selected.filter((k) => k !== key));
  const add = (key: BottomNavKey) => {
    if (selected.includes(key) || atLimit) return;
    onChange([...selected, key]);
  };
  const reset = () => onChange([...DEFAULT_BOTTOM_NAV_KEYS]);

  return (
    <Card className="border shadow-sm" data-testid="settings-bottom-nav-card">
      <CardHeader>
        <CardTitle className="text-base">{t("settings.bottomNav.title")}</CardTitle>
        <CardDescription>{t("settings.bottomNav.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("settings.bottomNav.shown")}{" "}
              <span className="text-muted-foreground/70 normal-case font-medium">
                ({selected.length}/{MAX_BOTTOM_NAV_ITEMS})
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              data-testid="btn-bottom-nav-reset"
            >
              <RotateCcw className="w-3.5 h-3.5 me-1.5" />
              {t("settings.bottomNav.resetDefault")}
            </Button>
          </div>
          {selected.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3 rounded-lg border border-dashed">
              {t("settings.bottomNav.empty")}
            </div>
          ) : (
            <ul className="space-y-1.5" data-testid="bottom-nav-selected-list">
              {selected.map((key, idx) => (
                <li
                  key={key}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30"
                  data-testid={`bottom-nav-selected-${key}`}
                >
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-primary/10 text-primary text-xs font-semibold">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">
                    {t(`nav.${key}`)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    aria-label={t("settings.bottomNav.moveUp")}
                    data-testid={`btn-bottom-nav-up-${key}`}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => move(idx, 1)}
                    disabled={idx === selected.length - 1}
                    aria-label={t("settings.bottomNav.moveDown")}
                    data-testid={`btn-bottom-nav-down-${key}`}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(key)}
                    aria-label={t("settings.bottomNav.remove")}
                    data-testid={`btn-bottom-nav-remove-${key}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {t("settings.bottomNav.available")}
          </div>
          {atLimit && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mb-2">
              {t("settings.bottomNav.limitReached")}
            </div>
          )}
          {available.length === 0 ? null : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5" data-testid="bottom-nav-available-list">
              {available.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => add(key)}
                    disabled={atLimit}
                    className="w-full flex items-center gap-2 p-2 rounded-lg border bg-background hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-start"
                    data-testid={`btn-bottom-nav-add-${key}`}
                  >
                    <Plus className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium flex-1 min-w-0 truncate">
                      {t(`nav.${key}`)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Lightweight self-serve backup: download every user-owned row as a single
 * JSON file, or restore from one. Mounted on the Settings page as a sibling
 * to the intervals card. Uses plain fetch + same-origin cookies so it works
 * for both Clerk-signed-in users and guest accounts.
 */
function BackupCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/backup/export", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      // Pull the filename out of the server-set Content-Disposition so the
      // date stamp matches what the route generated. Fall back to a generic
      // name if the header is missing for any reason.
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] ?? `quran-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: t("settings.backup.exportSuccess") });
    } catch {
      toast({ title: t("settings.backup.exportFailed"), variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    // Always reset the input so picking the same file twice in a row still
    // fires the change event.
    e.target.value = "";
    if (file) setPendingFile(file);
  };

  const handleConfirmImport = async () => {
    const file = pendingFile;
    if (!file) return;
    setPendingFile(null);
    setIsImporting(true);
    try {
      const text = await file.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        toast({ title: t("settings.backup.importInvalid"), variant: "destructive" });
        setIsImporting(false);
        return;
      }
      const res = await fetch("/api/backup/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 400) {
          toast({ title: t("settings.backup.importInvalid"), variant: "destructive" });
        } else {
          toast({ title: t("settings.backup.importFailed"), variant: "destructive" });
        }
        setIsImporting(false);
        return;
      }
      const data = (await res.json()) as { counts?: Record<string, number> };
      const total = Object.values(data.counts ?? {}).reduce((s, n) => s + n, 0);
      // Wipe every cached query so each screen refetches against the freshly
      // restored rows.
      await queryClient.invalidateQueries();
      toast({
        title: t("settings.backup.importSuccess"),
        description: t("settings.backup.importSuccessDesc", { n: total }),
      });
    } catch {
      toast({ title: t("settings.backup.importFailed"), variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <Card className="border shadow-sm" data-testid="settings-backup-card">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.backup.title")}</CardTitle>
          <CardDescription>{t("settings.backup.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border-s-4 border-l-primary bg-muted/30">
            <div className="min-w-0">
              <div className="font-medium text-sm">{t("settings.backup.exportLabel")}</div>
              <div className="text-xs text-muted-foreground">{t("settings.backup.exportHint")}</div>
            </div>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={isExporting}
              data-testid="btn-backup-export"
              className="shrink-0"
            >
              <Download className="w-4 h-4 me-2" />
              {isExporting ? t("settings.backup.exporting") : t("settings.backup.exportBtn")}
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border-s-4 border-l-amber-500 bg-muted/30">
            <div className="min-w-0">
              <div className="font-medium text-sm">{t("settings.backup.importLabel")}</div>
              <div className="text-xs text-muted-foreground">{t("settings.backup.importHint")}</div>
            </div>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              data-testid="btn-backup-import"
              className="shrink-0"
            >
              <Upload className="w-4 h-4 me-2" />
              {isImporting ? t("settings.backup.importing") : t("settings.backup.importBtn")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handlePickFile}
              data-testid="input-backup-file"
            />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={pendingFile !== null} onOpenChange={(open) => !open && setPendingFile(null)}>
        <AlertDialogContent data-testid="dialog-backup-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.backup.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.backup.confirmBody", { file: pendingFile?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-backup-cancel">
              {t("settings.backup.confirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmImport} data-testid="btn-backup-confirm">
              {t("settings.backup.confirmConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
