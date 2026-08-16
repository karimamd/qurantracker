/**
 * Rewards page (/rewards) — points balance, earning history, prizes, and
 * redemption history.
 *
 * Points are earned automatically on the server as the user recites pages,
 * upgrades page status, and reads Telawa (see api-server lib/rewards.ts).
 * This page is the spend side: parents/users define prizes with a point
 * cost and collect them when the balance allows. Point values per metric
 * are configurable here via the shared settings PATCH.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  useGetRewardsSummary,
  getGetRewardsSummaryQueryKey,
  useListRewardPrizes,
  getListRewardPrizesQueryKey,
  useCreateRewardPrize,
  useUpdateRewardPrize,
  useDeleteRewardPrize,
  useRedeemRewardPrize,
  useListRewardRedemptions,
  getListRewardRedemptionsQueryKey,
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Trophy, Gift, Star, Plus, Pencil, Trash2, History, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const METRICS = ["recitation", "statusUpgrade", "telawaRead", "telawaGoal"] as const;
type Metric = (typeof METRICS)[number];

const SETTINGS_KEY_BY_METRIC: Record<Metric, "pointsRecitation" | "pointsStatusUpgrade" | "pointsTelawaRead" | "pointsTelawaGoal"> = {
  recitation: "pointsRecitation",
  statusUpgrade: "pointsStatusUpgrade",
  telawaRead: "pointsTelawaRead",
  telawaGoal: "pointsTelawaGoal",
};

function SummarySection() {
  const { t } = useTranslation();
  const { data, isLoading } = useGetRewardsSummary();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }
  if (!data) return null;

  const chartData = data.dailyPoints.map(d => ({
    ...d,
    label: format(parseISO(d.date), "MMM d"),
    shortLabel: format(parseISO(d.date), "d"),
  }));
  const hasAny = data.dailyPoints.some(d => d.points > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="border shadow-sm" data-testid="rewards-balance-card">
          <CardContent className="py-4 px-4 text-center">
            <Star className="w-5 h-5 mx-auto text-amber-500 mb-1" />
            <p className="text-2xl font-bold" data-testid="rewards-balance-value">{data.balance}</p>
            <p className="text-xs text-muted-foreground">{t("rewards.balance")}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="py-4 px-4 text-center">
            <Trophy className="w-5 h-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold" data-testid="rewards-today-value">{data.todayPoints}</p>
            <p className="text-xs text-muted-foreground">{t("rewards.today")}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="py-4 px-4 text-center">
            <Gift className="w-5 h-5 mx-auto text-rose-500 mb-1" />
            <p className="text-2xl font-bold">{data.totalSpent}</p>
            <p className="text-xs text-muted-foreground">{t("rewards.spent")}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border shadow-sm" data-testid="rewards-daily-chart">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("rewards.dailyChartTitle")}</CardTitle>
            <span className="text-xs text-muted-foreground">{t("rewards.last14Days")}</span>
          </div>
        </CardHeader>
        <CardContent className="pt-2 pb-4 px-2">
          {!hasAny ? (
            <div className="h-32 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{t("rewards.noPointsYet")}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
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
                    const d = payload[0].payload as (typeof chartData)[0];
                    return (
                      <div className="bg-background border rounded-lg shadow-md px-3 py-2 text-sm">
                        <div className="font-medium">{d.label}</div>
                        <div className="text-muted-foreground">{t("rewards.pointsCount", { count: d.points })}</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="points" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {data.byMetric.length > 0 && (
        <Card className="border shadow-sm" data-testid="rewards-breakdown">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("rewards.breakdownTitle")}</CardTitle>
              <span className="text-xs text-muted-foreground">{t("rewards.last30Days")}</span>
            </div>
          </CardHeader>
          <CardContent className="pt-1 pb-3">
            <div className="divide-y">
              {data.byMetric.map(row => (
                <div key={row.metric} className="flex items-center justify-between py-2">
                  <span className="text-sm">{t(`rewards.metric.${row.metric}`, { defaultValue: row.metric })}</span>
                  <span className="text-sm font-semibold">{t("rewards.pointsCount", { count: row.points })}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PrizesSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: summary } = useGetRewardsSummary();
  const { data: prizes, isLoading } = useListRewardPrizes();
  const createPrize = useCreateRewardPrize();
  const updatePrize = useUpdateRewardPrize();
  const deletePrize = useDeleteRewardPrize();
  const redeemPrize = useRedeemRewardPrize();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [redeemTarget, setRedeemTarget] = useState<{ id: number; name: string; cost: number } | null>(null);

  const balance = summary?.balance ?? 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListRewardPrizesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRewardsSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListRewardRedemptionsQueryKey() });
  };

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setCost("");
    setDialogOpen(true);
  };
  const openEdit = (p: { id: number; name: string; cost: number }) => {
    setEditingId(p.id);
    setName(p.name);
    setCost(String(p.cost));
    setDialogOpen(true);
  };

  const submit = () => {
    const costNum = parseInt(cost, 10);
    if (!name.trim() || !Number.isFinite(costNum) || costNum < 1) return;
    const onSettled = () => invalidate();
    if (editingId !== null) {
      updatePrize.mutate(
        { id: editingId, data: { name: name.trim(), cost: costNum } },
        { onSuccess: () => setDialogOpen(false), onSettled },
      );
    } else {
      createPrize.mutate(
        { data: { name: name.trim(), cost: costNum } },
        { onSuccess: () => setDialogOpen(false), onSettled },
      );
    }
  };

  return (
    <Card className="border shadow-sm" data-testid="rewards-prizes-section">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="w-4 h-4 text-primary" />
            {t("rewards.prizesTitle")}
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={openCreate} data-testid="rewards-add-prize">
            <Plus className="w-3.5 h-3.5" />
            {t("rewards.addPrize")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-1 pb-3">
        {isLoading ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : !prizes || prizes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center">{t("rewards.noPrizes")}</p>
        ) : (
          <div className="divide-y">
            {prizes.map(p => {
              const affordable = balance >= p.cost;
              return (
                <div key={p.id} className="flex items-center gap-2 py-2.5" data-testid={`prize-row-${p.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{t("rewards.pointsCount", { count: p.cost })}</p>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!affordable || redeemPrize.isPending}
                    onClick={() => setRedeemTarget({ id: p.id, name: p.name, cost: p.cost })}
                    data-testid={`prize-redeem-${p.id}`}
                  >
                    {t("rewards.redeem")}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)} aria-label={t("common.edit")}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(p.id)} aria-label={t("common.delete")}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? t("rewards.editPrize") : t("rewards.addPrize")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="prize-name">{t("rewards.prizeName")}</Label>
              <Input id="prize-name" value={name} onChange={e => setName(e.target.value)} maxLength={200} data-testid="prize-name-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prize-cost">{t("rewards.prizeCost")}</Label>
              <Input
                id="prize-cost"
                type="number"
                inputMode="numeric"
                min={1}
                value={cost}
                onChange={e => setCost(e.target.value)}
                data-testid="prize-cost-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={submit}
              disabled={!name.trim() || !(parseInt(cost, 10) >= 1) || createPrize.isPending || updatePrize.isPending}
              data-testid="prize-save"
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rewards.deletePrizeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("rewards.deletePrizeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId !== null) {
                  deletePrize.mutate({ id: deleteId }, { onSettled: invalidate });
                }
                setDeleteId(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={redeemTarget !== null} onOpenChange={open => { if (!open) setRedeemTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rewards.redeemConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {redeemTarget ? t("rewards.redeemConfirmDescription", { name: redeemTarget.name, cost: redeemTarget.cost }) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="redeem-confirm"
              onClick={() => {
                if (redeemTarget) {
                  redeemPrize.mutate(
                    { id: redeemTarget.id },
                    {
                      onSuccess: () => toast({ description: t("rewards.redeemSuccess", { name: redeemTarget.name }) }),
                      onError: () => toast({ variant: "destructive", description: t("rewards.redeemInsufficient") }),
                      onSettled: invalidate,
                    },
                  );
                }
                setRedeemTarget(null);
              }}
            >
              {t("rewards.redeem")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function RedemptionsSection() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useListRewardRedemptions();

  if (isLoading) return <Skeleton className="h-16 rounded-xl" />;
  if (!data || data.length === 0) return null;

  return (
    <Card className="border shadow-sm" data-testid="rewards-redemptions-section">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          {t("rewards.redemptionsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1 pb-3">
        <div className="divide-y">
          {data.map(r => (
            <div key={r.id} className="flex items-center justify-between py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.prizeName}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.redeemedAt).toLocaleDateString(i18n.language === "ar" ? "ar" : "en", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <span className="text-sm font-semibold text-rose-500 shrink-0 ms-2">
                -{t("rewards.pointsCount", { count: r.cost })}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PointConfigSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();

  if (!settings) return null;

  const onChange = (metric: Metric, raw: string) => {
    const value = parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 0 || value > 1000) return;
    const key = SETTINGS_KEY_BY_METRIC[metric];
    if (settings[key] === value) return;
    updateSettings.mutate(
      { data: { [key]: value } },
      {
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
      },
    );
  };

  return (
    <Card className="border shadow-sm" data-testid="rewards-config-section">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          {t("rewards.configTitle")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("rewards.configHint")}</p>
      </CardHeader>
      <CardContent className="pt-1 pb-3 space-y-3">
        {METRICS.map(metric => (
          <div key={metric} className="flex items-center justify-between gap-3">
            <Label htmlFor={`points-${metric}`} className="text-sm font-normal flex-1">
              {t(`rewards.metric.${metric}`)}
            </Label>
            <Input
              id={`points-${metric}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              className="w-20 h-8 text-center"
              defaultValue={settings[SETTINGS_KEY_BY_METRIC[metric]]}
              onBlur={e => onChange(metric, e.target.value)}
              data-testid={`points-config-${metric}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function RewardsPage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4" data-testid="rewards-page">
      <div className="flex items-center gap-2">
        <Trophy className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold">{t("rewards.title")}</h1>
      </div>
      <SummarySection />
      <PrizesSection />
      <RedemptionsSection />
      <PointConfigSection />
    </div>
  );
}
