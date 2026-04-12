import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

export default function SettingsPage() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [excellentDays, setExcellentDays] = useState("");
  const [goodDays, setGoodDays] = useState("");
  const [hardDays, setHardDays] = useState("");
  const [relearnDays, setRelearnDays] = useState("");

  useEffect(() => {
    if (settings) {
      setExcellentDays(String(settings.excellentDays));
      setGoodDays(String(settings.goodDays));
      setHardDays(String(settings.hardDays));
      setRelearnDays(String(settings.relearnDays));
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(
      {
        data: {
          excellentDays: parseInt(excellentDays, 10),
          goodDays: parseInt(goodDays, 10),
          hardDays: parseInt(hardDays, 10),
          relearnDays: parseInt(relearnDays, 10),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Settings saved" });
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-2xl font-semibold">Settings</h2>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const fields = [
    { label: "Excellent", desc: "Perfect recitation - days until next review", value: excellentDays, setter: setExcellentDays, color: "border-l-emerald-500" },
    { label: "Good", desc: "2 or fewer mistakes per page", value: goodDays, setter: setGoodDays, color: "border-l-sky-500" },
    { label: "Hard", desc: "Up to 3 mistakes per page average", value: hardDays, setter: setHardDays, color: "border-l-amber-500" },
    { label: "Relearn", desc: "Needs significant rework", value: relearnDays, setter: setRelearnDays, color: "border-l-rose-500" },
  ];

  return (
    <div className="space-y-6 max-w-2xl" data-testid="settings-page">
      <div>
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure your revision intervals</p>
      </div>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Review Intervals</CardTitle>
          <CardDescription>
            Set how many days to wait before a page is due for review based on its quality rating.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map(field => (
            <div key={field.label} className={`flex items-center justify-between p-3 rounded-lg border-l-4 ${field.color} bg-muted/30`} data-testid={`setting-${field.label.toLowerCase()}`}>
              <div>
                <div className="font-medium text-sm">{field.label}</div>
                <div className="text-xs text-muted-foreground">{field.desc}</div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  className="w-20 text-center"
                  value={field.value}
                  onChange={e => field.setter(e.target.value)}
                  data-testid={`input-${field.label.toLowerCase()}-days`}
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </div>
          ))}

          <Button onClick={handleSave} disabled={updateSettings.isPending} className="w-full" data-testid="btn-save-settings">
            <Save className="w-4 h-4 mr-2" />
            {updateSettings.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
