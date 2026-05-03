import { getDefaultPageName } from "@/lib/page-names";
import { useTranslation } from "react-i18next";

interface PageLabelProps {
  pageNumber: number;
  /** Deprecated: page names are no longer user-editable. Accepted for backward compatibility but ignored. */
  customName?: string | null;
  className?: string;
  nameClassName?: string;
  prefixClassName?: string;
  /** Deprecated: editing is no longer supported. Accepted for backward compatibility but ignored. */
  showEdit?: boolean;
  /** Deprecated: only used by the previous rename popover. Accepted for backward compatibility but ignored. */
  homeworkId?: number;
  /** Deprecated: only used by the previous rename popover. Accepted for backward compatibility but ignored. */
  juzNumber?: number;
}

export function PageLabel({
  pageNumber,
  className,
  nameClassName,
  prefixClassName,
}: PageLabelProps) {
  const name = getDefaultPageName(pageNumber);
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className ?? ""}`} data-testid={`page-label-${pageNumber}`}>
      <span className={prefixClassName}>{t("pageLabel.pageColon", { n: pageNumber })}</span>
      {name && (
        <span
          className={`font-serif ${nameClassName ?? "text-sm"}`}
          dir="rtl"
          lang="ar"
          data-testid={`page-name-${pageNumber}`}
        >
          {name}
        </span>
      )}
    </span>
  );
}
