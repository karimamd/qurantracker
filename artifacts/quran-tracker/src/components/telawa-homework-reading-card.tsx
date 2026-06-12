import { useGetTelawaHomeworkReading } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageLabel } from "@/components/page-label";
import { GraduationCap, CheckCircle, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

/**
 * "Homework Reading Goal" — a global weekly per-page read target across the
 * pages in the user's active homework sessions. Either an explicit Telawa
 * read OR any recitation counts toward the weekly goal for each page.
 */
export function TelawaHomeworkReadingCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useGetTelawaHomeworkReading();

  if (isLoading || !data) {
    return <Skeleton className="h-40 rounded-xl" data-testid="telawa-homework-reading-loading" />;
  }

  const goal = Math.max(1, data.weeklyGoal);
  const metCount = data.pages.filter((p) => p.weekCount >= goal).length;

  return (
    <Card className="border shadow-sm" data-testid="telawa-homework-reading-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-primary" />
          {t("telawa.homeworkReading.title")}
        </CardTitle>
        <CardDescription>
          {t("telawa.homeworkReading.description", { goal })}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {data.pages.length === 0 ? (
          <div
            className="px-4 pb-4 text-sm text-muted-foreground"
            data-testid="telawa-homework-reading-empty"
          >
            {t("telawa.homeworkReading.empty")}
          </div>
        ) : (
          <>
            <div className="px-4 pb-2 text-xs text-muted-foreground" data-testid="telawa-homework-reading-summary">
              {t("telawa.homeworkReading.summary", { met: metCount, total: data.pages.length })}
            </div>
            <ul className="divide-y border-t">
              {data.pages.map((page) => {
                const pct = Math.min(100, Math.round((page.weekCount / goal) * 100));
                const met = page.weekCount >= goal;
                return (
                  <li
                    key={page.pageNumber}
                    className="px-4 py-2.5"
                    data-testid={`telawa-homework-reading-page-${page.pageNumber}`}
                  >
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/reader/${page.pageNumber}`}
                        className="flex-1 min-w-0 hover:underline"
                        title={t("telawa.openInReader")}
                      >
                        <PageLabel
                          pageNumber={page.pageNumber}
                          customName={page.name}
                          prefixClassName="font-medium text-sm"
                          nameClassName="text-sm"
                        />
                      </Link>
                      <span
                        className={`text-xs tabular-nums shrink-0 inline-flex items-center gap-1 ${
                          met ? "text-emerald-600" : "text-muted-foreground"
                        }`}
                        data-testid={`telawa-homework-reading-count-${page.pageNumber}`}
                      >
                        {met && <CheckCircle className="w-3.5 h-3.5" />}
                        {page.weekCount} / {goal}
                      </span>
                      <Link href={`/reader/${page.pageNumber}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          title={t("telawa.openInReader")}
                          data-testid={`telawa-homework-reading-open-${page.pageNumber}`}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full transition-all ${met ? "bg-emerald-500" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
