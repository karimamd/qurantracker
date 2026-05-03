/**
 * Shared helpers for the homework "page range" text input used by both the
 * Create and Edit homework dialogs. Keeping the parsing / formatting in
 * one place ensures that the string a user types into the Create dialog
 * round-trips identically when they later open the Edit dialog.
 */

/** Parse a comma/range string like "1-3, 5, 7-8" into a sorted unique page list. */
export function parsePageRange(rangeStr: string): number[] {
  if (!rangeStr.trim()) return [];
  const seen = new Set<number>();
  const parts = rangeStr.split(",").map(p => p.trim());
  for (const part of parts) {
    if (part.includes("-")) {
      const [s, e] = part.split("-").map(n => parseInt(n.trim(), 10));
      if (!isNaN(s) && !isNaN(e)) {
        const lo = Math.min(s, e);
        const hi = Math.max(s, e);
        for (let i = lo; i <= hi; i++) seen.add(i);
      }
    } else {
      const n = parseInt(part, 10);
      if (!isNaN(n)) seen.add(n);
    }
  }
  return Array.from(seen).sort((a, b) => a - b);
}

/** Append a numeric range to an existing user-edited string, preserving their formatting. */
export function appendPageRange(current: string, startPage: number, endPage: number): string {
  const fragment = startPage === endPage ? `${startPage}` : `${startPage}-${endPage}`;
  const trimmed = current.trim();
  if (!trimmed) return fragment;
  return `${trimmed.replace(/,\s*$/, "")}, ${fragment}`;
}

/**
 * Compress a sorted unique page list back into the text-input format —
 * consecutive runs collapse to "a-b" so the Edit dialog initial value
 * stays readable for large homeworks instead of a comma-spam list.
 */
export function compressPages(pages: number[]): string {
  if (pages.length === 0) return "";
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const groups: string[] = [];
  let runStart = sorted[0];
  let runEnd = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === runEnd + 1) {
      runEnd = sorted[i];
    } else {
      groups.push(runStart === runEnd ? `${runStart}` : `${runStart}-${runEnd}`);
      runStart = sorted[i];
      runEnd = sorted[i];
    }
  }
  groups.push(runStart === runEnd ? `${runStart}` : `${runStart}-${runEnd}`);
  return groups.join(", ");
}
