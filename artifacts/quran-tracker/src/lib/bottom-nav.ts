/**
 * Single source of truth for the mobile bottom-nav configurability feature.
 *
 * Layout.tsx renders the bar from the user's `settings.bottomNavKeys`,
 * falling back to DEFAULT_BOTTOM_NAV_KEYS when the array is empty or
 * contains only unknown keys (e.g. an older client receiving a key the
 * server side later added). The Settings page lets the user pick which
 * of ALLOWED_BOTTOM_NAV_KEYS to include and in what order, capped at
 * MAX_BOTTOM_NAV_ITEMS so the bar stays tappable on small phones.
 *
 * Keep ALLOWED_BOTTOM_NAV_KEYS in sync with the OpenAPI enum at
 * `lib/api-spec/openapi.yaml` (Settings.bottomNavKeys / UpdateSettingsBody).
 */
export const ALLOWED_BOTTOM_NAV_KEYS = [
  "homework",
  "dashboard",
  "telawa",
  "reader",
  "mistakes",
  "juz",
  "rub",
  "surah",
  "pages",
  "ayahs",
  "recite",
  "welcome",
  "settings",
  "rewards",
] as const;

export type BottomNavKey = (typeof ALLOWED_BOTTOM_NAV_KEYS)[number];

export const DEFAULT_BOTTOM_NAV_KEYS: readonly BottomNavKey[] = [
  "homework",
  "dashboard",
  "telawa",
  "reader",
  "mistakes",
];

export const MAX_BOTTOM_NAV_ITEMS = 5;

export function isBottomNavKey(value: string): value is BottomNavKey {
  return (ALLOWED_BOTTOM_NAV_KEYS as readonly string[]).includes(value);
}

/**
 * Normalise a server-supplied list: drop unknown values, dedupe while
 * preserving order, and fall back to the historical defaults when the
 * cleaned result is empty so the bar never renders blank.
 */
export function resolveBottomNavKeys(
  raw: readonly string[] | null | undefined,
): readonly BottomNavKey[] {
  if (!raw || raw.length === 0) return DEFAULT_BOTTOM_NAV_KEYS;
  const seen = new Set<BottomNavKey>();
  const out: BottomNavKey[] = [];
  for (const k of raw) {
    if (!isBottomNavKey(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= MAX_BOTTOM_NAV_ITEMS) break;
  }
  return out.length > 0 ? out : DEFAULT_BOTTOM_NAV_KEYS;
}
