import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Save, Download, Upload } from "lucide-react";
import { setLanguage, type SupportedLanguage } from "@/i18n";

export default function SettingsPage() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [excellentDays, setExcellentDays] = useState("");
  const [goodDays, setGoodDays] = useState("");
  const [hardDays, setHardDays] = useState("");
  const [relearnDays, setRelearnDays] = useState("");
  const [telawaPagesPerDay, setTelawaPagesPerDay] = useState("");
  const [readerFontSize, setReaderFontSize] = useState("");
  const [ayahViewFontSize, setAyahViewFontSize] = useState("");
  const [language, setLanguageState] = useState<SupportedLanguage>("en");

  useEffect(() => {
    if (settings) {
      setExcellentDays(String(settings.excellentDays));
      setGoodDays(String(settings.goodDays));
      setHardDays(String(settings.hardDays));
      setRelearnDays(String(settings.relearnDays));
      setTelawaPagesPerDay(String(settings.telawaPagesPerDay));
      setReaderFontSize(String(settings.readerFontSize));
      setAyahViewFontSize(String(settings.ayahViewFontSize));
      const lang = settings.language === "ar" ? "ar" : "en";
      setLanguageState(lang);
    }
  }, [settings]);

  const handleLanguageChange = (value: string) => {
    const lang: SupportedLanguage = value === "ar" ? "ar" : "en";
    setLanguageState(lang);
    // Apply immediately for snappy UX, then persist.
    setLanguage(lang);
    updateSettings.mutate(
      { data: { language: lang } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
      }
    );
  };

  const handleSave = () => {
    const tppd = parseInt(telawaPagesPerDay, 10);
    const rfs = parseInt(readerFontSize, 10);
    const avfs = parseInt(ayahViewFontSize, 10);
    updateSettings.mutate(
      {
        data: {
          excellentDays: parseInt(excellentDays, 10),
          goodDays: parseInt(goodDays, 10),
          hardDays: parseInt(hardDays, 10),
          relearnDays: parseInt(relearnDays, 10),
          telawaPagesPerDay: Number.isFinite(tppd) && tppd >= 1 && tppd <= 604 ? tppd : undefined,
          // Bounds match the OpenAPI schema (14-64). Drop the field when
          // the user typed something out of range so the server keeps the
          // existing value rather than 400'ing the whole save.
          readerFontSize: Number.isFinite(rfs) && rfs >= 14 && rfs <= 64 ? rfs : undefined,
          // Same out-of-range fallback strategy as readerFontSize. Bounds
          // mirror the OpenAPI schema for ayahViewFontSize (14-96).
          ayahViewFontSize: Number.isFinite(avfs) && avfs >= 14 && avfs <= 96 ? avfs : undefined,
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

      <BackupCard />
    </div>
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
