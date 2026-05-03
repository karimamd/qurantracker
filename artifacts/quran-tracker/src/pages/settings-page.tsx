import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Save } from "lucide-react";
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
  const [language, setLanguageState] = useState<SupportedLanguage>("en");

  useEffect(() => {
    if (settings) {
      setExcellentDays(String(settings.excellentDays));
      setGoodDays(String(settings.goodDays));
      setHardDays(String(settings.hardDays));
      setRelearnDays(String(settings.relearnDays));
      setTelawaPagesPerDay(String(settings.telawaPagesPerDay));
      setReaderFontSize(String(settings.readerFontSize));
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
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("settings.intervals.saved") });
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
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

          <Button onClick={handleSave} disabled={updateSettings.isPending} className="w-full" data-testid="btn-save-settings">
            <Save className="w-4 h-4 me-2" />
            {updateSettings.isPending ? t("common.saving") : t("settings.intervals.save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
