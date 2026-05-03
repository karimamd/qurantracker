import { useEffect, useRef, useState } from "react";
import { usePageAyahs } from "@/hooks/use-page-ayahs";

interface FirstAyahPreviewProps {
  pageNumber: number;
  enabled?: boolean;
  className?: string;
  wordCount?: number;
}

const BISMILLAH_RE = /^\ufeff?بِسْمِ\s+[اٱ]للَّهِ\s+[اٱ]لرَّحْمَ?ٰ?نِ\s+[اٱ]لرَّحِيمِ\s*/u;

export function FirstAyahPreview({
  pageNumber,
  enabled = true,
  className = "",
  wordCount = 7,
}: FirstAyahPreviewProps) {
  // Lazy-load: only fetch when the row scrolls into view, to avoid bursts
  // of parallel external API calls when long lists (juz/surah/homework) mount.
  const ref = useRef<HTMLSpanElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!enabled || inView) return;
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, inView]);

  const { data, isLoading, isError } = usePageAyahs(pageNumber, { enabled: enabled && inView });

  if (!enabled) return null;
  if (!inView) {
    return (
      <span
        ref={ref}
        className={`inline-block h-4 w-40 bg-muted/20 rounded ${className}`}
        aria-hidden="true"
      />
    );
  }
  if (isLoading) {
    return (
      <span
        className={`inline-block h-4 w-40 bg-muted/40 rounded animate-pulse ${className}`}
        aria-hidden="true"
      />
    );
  }
  if (isError || !data || data.length === 0) return null;

  const first = data[0];
  // Strip leading bismillah for non-Fatiha first ayahs (purely visual; falls back if removal empties)
  const stripped = first.text.replace(BISMILLAH_RE, "").trim();
  const cleaned = stripped.length > 0 ? stripped : first.text;
  const words = cleaned.split(/\s+/);
  const preview = words.slice(0, wordCount).join(" ") + (words.length > wordCount ? " …" : "");

  return (
    <span
      ref={ref}
      className={`font-serif text-muted-foreground/90 truncate ${className}`}
      dir="rtl"
      lang="ar"
      title={first.text}
      data-testid={`first-ayah-${pageNumber}`}
    >
      {preview}
    </span>
  );
}
