import { useEffect, useRef, useState } from "react";
import { usePageAyahs } from "@/hooks/use-page-ayahs";
import { getRob3Boundary } from "@/lib/quran-ref";

interface Rob3FirstAyahPreviewProps {
  rob3Number: number;
  enabled?: boolean;
  className?: string;
  wordCount?: number;
}

const BISMILLAH_RE = /^\ufeff?بِسْمِ\s+اللَّهِ\s+الرَّحْمَ?ٰ?نِ\s+الرَّحِيمِ\s*/u;

/**
 * Shows the first ayah of a Rub al-Hizb (the ayah where the Rub starts),
 * not the first ayah of the Rub's starting page. Lazy-loads via
 * IntersectionObserver and re-uses the cached page-ayahs query.
 */
export function Rob3FirstAyahPreview({
  rob3Number,
  enabled = true,
  className = "",
  wordCount = 7,
}: Rob3FirstAyahPreviewProps) {
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

  const boundary = getRob3Boundary(rob3Number);
  const { data, isLoading, isError } = usePageAyahs(boundary?.page ?? 1, {
    enabled: enabled && inView && !!boundary,
  });

  if (!enabled || !boundary) return null;
  if (!inView) {
    return (
      <span
        ref={ref}
        className={`inline-block h-4 w-44 bg-muted/20 rounded ${className}`}
        aria-hidden="true"
      />
    );
  }
  if (isLoading) {
    return (
      <span
        className={`inline-block h-4 w-44 bg-muted/40 rounded animate-pulse ${className}`}
        aria-hidden="true"
      />
    );
  }
  if (isError || !data || data.length === 0) {
    return null;
  }

  // Find the ayah that matches this Rub's start (surah + ayah number).
  const match = data.find(
    a => a.surah?.number === boundary.surah && a.numberInSurah === boundary.ayah,
  );
  const ayah = match ?? data[0];
  const cleaned = ayah.text.replace(BISMILLAH_RE, "");
  const text = cleaned.length > 0 ? cleaned : ayah.text;
  const words = text.split(/\s+/);
  const preview = words.slice(0, wordCount).join(" ") + (words.length > wordCount ? " …" : "");

  return (
    <span
      ref={ref}
      className={`font-serif text-muted-foreground/90 truncate ${className}`}
      dir="rtl"
      lang="ar"
      title={ayah.text}
      data-testid={`rob3-first-ayah-${rob3Number}`}
    >
      {preview}
    </span>
  );
}
