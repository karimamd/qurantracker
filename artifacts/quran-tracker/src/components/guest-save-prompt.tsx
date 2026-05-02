import { Link } from "wouter";
import { useAuth } from "@clerk/react";
import { Card, CardContent } from "@/components/ui/card";
import { useGetProgressOverview } from "@workspace/api-client-react";
import { isGuestMode } from "@/lib/guest-mode";
import { CloudUpload, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Guest-only call-to-action shown above dashboard content.
 *
 * Renders nothing for signed-in users. For guests, surfaces the concrete
 * count of pages already tracked on this device (when > 0) to make the
 * "if you sign up, we'll keep this" promise tangible. The migration is
 * automatic on first signed-in request — see `requireAuth.ts`.
 */
export default function GuestSavePrompt() {
  const { isSignedIn } = useAuth();
  const { data: overview } = useGetProgressOverview();
  const { t } = useTranslation();

  if (isSignedIn || !isGuestMode()) return null;

  const pagesTracked = overview?.pagesInScope ?? 0;
  const recitations =
    (overview?.excellentCount ?? 0) +
    (overview?.goodCount ?? 0) +
    (overview?.hardCount ?? 0) +
    (overview?.relearnCount ?? 0);

  const hasProgress = pagesTracked > 0 || recitations > 0;

  return (
    <Card
      className="border-primary/20 bg-gradient-to-br from-primary/5 to-card shadow-sm"
      data-testid="guest-save-prompt"
    >
      <CardContent className="py-4 px-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <CloudUpload className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm sm:text-base font-semibold text-foreground" data-testid="guest-save-prompt-headline">
            {hasProgress ? t("guestPrompt.savedTitle") : t("guestPrompt.intro")}
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {hasProgress ? (
              <>
                {t("guestPrompt.haveStored")}{" "}
                <span className="font-medium text-primary">{t("guestPrompt.pages", { count: pagesTracked })}</span>
                {recitations > 0 && (
                  <>
                    {" "}{t("guestPrompt.andLine")}{" "}
                    <span className="font-medium text-primary">{t("guestPrompt.recitations", { count: recitations })}</span>
                  </>
                )}{" "}
                {t("guestPrompt.storedTail")}
              </>
            ) : (
              <>{t("guestPrompt.introTail")}</>
            )}
          </div>
        </div>
        <Link
          href="/sign-up"
          className="shrink-0 inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-md transition-colors"
          data-testid="guest-save-prompt-button"
        >
          {t("guestPrompt.signUp")}
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
      </CardContent>
    </Card>
  );
}
