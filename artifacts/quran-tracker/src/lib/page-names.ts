import pageNamesData from "./page-names.json";

const PAGE_NAMES = pageNamesData as Record<string, { surah: number; ayah: number; text: string }>;

export function getDefaultPageName(pageNumber: number): string {
  return PAGE_NAMES[String(pageNumber)]?.text ?? "";
}

export function getPageMeta(
  pageNumber: number,
): { surah: number; ayah: number; text: string } | null {
  return PAGE_NAMES[String(pageNumber)] ?? null;
}

export function getPageDisplayName(
  pageNumber: number,
  customName?: string | null,
): string {
  if (customName && customName.length > 0) return customName;
  return getDefaultPageName(pageNumber);
}

export function formatPageLabel(
  pageNumber: number,
  customName?: string | null,
): string {
  const name = getPageDisplayName(pageNumber, customName);
  return name ? `Page ${pageNumber}: ${name}` : `Page ${pageNumber}`;
}
