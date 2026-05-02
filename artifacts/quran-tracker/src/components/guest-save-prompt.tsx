import { Link } from "wouter";
import { useAuth } from "@clerk/react";
import { Card, CardContent } from "@/components/ui/card";
import { useGetProgressOverview } from "@workspace/api-client-react";
import { isGuestMode } from "@/lib/guest-mode";
import { CloudUpload, ArrowRight } from "lucide-react";

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
      className="border-teal-200 bg-gradient-to-br from-teal-50 to-white shadow-sm"
      data-testid="guest-save-prompt"
    >
      <CardContent className="py-4 px-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="shrink-0 w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
          <CloudUpload className="w-5 h-5 text-teal-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm sm:text-base font-semibold text-slate-900" data-testid="guest-save-prompt-headline">
            {hasProgress ? (
              <>
                Save your progress to your account
              </>
            ) : (
              <>
                Sign up so your progress follows you everywhere
              </>
            )}
          </div>
          <div className="text-xs sm:text-sm text-slate-600 mt-0.5">
            {hasProgress ? (
              <>
                You have <span className="font-medium text-teal-700">{pagesTracked} {pagesTracked === 1 ? "page" : "pages"} in scope</span>
                {recitations > 0 && (
                  <>
                    {" "}and <span className="font-medium text-teal-700">{recitations} {recitations === 1 ? "recitation" : "recitations"}</span>
                  </>
                )}{" "}
                stored on this device. Sign up and we'll move it all to your account automatically.
              </>
            ) : (
              <>Right now your progress is only on this device. Sign up to keep it across devices — takes a few seconds.</>
            )}
          </div>
        </div>
        <Link
          href="/sign-up"
          className="shrink-0 inline-flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors"
          data-testid="guest-save-prompt-button"
        >
          Sign up
          <ArrowRight className="w-4 h-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
