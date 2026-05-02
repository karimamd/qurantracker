import { useState, useEffect } from "react";
import { Pencil, RotateCcw, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRenamePage, getListPageProgressQueryKey, getGetJuzDetailQueryKey, getGetHomeworkQueryKey, getGetProgressOverviewQueryKey, getGetRecentActivityQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getPageDisplayName, getDefaultPageName } from "@/lib/page-names";
import { useTranslation } from "react-i18next";

interface PageLabelProps {
  pageNumber: number;
  customName?: string | null;
  className?: string;
  nameClassName?: string;
  prefixClassName?: string;
  showEdit?: boolean;
  homeworkId?: number;
  juzNumber?: number;
}

export function PageLabel({
  pageNumber,
  customName,
  className,
  nameClassName,
  prefixClassName,
  showEdit = true,
  homeworkId,
  juzNumber,
}: PageLabelProps) {
  const name = getPageDisplayName(pageNumber, customName);
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
      {showEdit && (
        <RenameButton pageNumber={pageNumber} customName={customName ?? null} homeworkId={homeworkId} juzNumber={juzNumber} />
      )}
    </span>
  );
}

function RenameButton({
  pageNumber,
  customName,
  homeworkId,
  juzNumber,
}: {
  pageNumber: number;
  customName: string | null;
  homeworkId?: number;
  juzNumber?: number;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(customName ?? "");
  const rename = useRenamePage();
  const qc = useQueryClient();
  const { t } = useTranslation();

  useEffect(() => {
    if (open) setValue(customName ?? "");
  }, [open, customName]);

  const invalidateAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getListPageProgressQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() }),
      ...(homeworkId ? [qc.invalidateQueries({ queryKey: getGetHomeworkQueryKey(homeworkId) })] : []),
      ...(juzNumber ? [qc.invalidateQueries({ queryKey: getGetJuzDetailQueryKey(juzNumber) })] : []),
    ]);
  };

  const handleSave = async () => {
    await rename.mutateAsync({ pageNumber, data: { customName: value.trim() || null } });
    await invalidateAll();
    setOpen(false);
  };
  const handleReset = async () => {
    await rename.mutateAsync({ pageNumber, data: { customName: null } });
    await invalidateAll();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground/60 hover:text-primary p-0.5 rounded"
          aria-label={t("pageLabel.ariaRename", { n: pageNumber })}
          data-testid={`page-rename-${pageNumber}`}
        >
          <Pencil className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div className="text-sm font-medium">{t("pageLabel.renamePage", { n: pageNumber })}</div>
          <div className="text-xs text-muted-foreground">
            {t("common.default")}: <span dir="rtl" lang="ar" className="font-serif">{getDefaultPageName(pageNumber)}</span>
          </div>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("pageLabel.customName")}
            dir="auto"
            data-testid={`page-rename-input-${pageNumber}`}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleReset()}
              disabled={rename.isPending}
              data-testid={`page-rename-reset-${pageNumber}`}
            >
              <RotateCcw className="w-3.5 h-3.5 me-1" />
              {t("common.default")}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSave()}
                disabled={rename.isPending}
                data-testid={`page-rename-save-${pageNumber}`}
              >
                <Check className="w-3.5 h-3.5 me-1" />
                {t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
