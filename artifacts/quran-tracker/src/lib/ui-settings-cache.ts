/**
 * Tiny synchronous localStorage mirror of the UI-critical user settings.
 *
 * WHY THIS EXISTS
 * ---------------
 * Mobile browsers unload backgrounded tabs after a minute or two. When the
 * user switches back, the page performs a full reload: React state is gone
 * and the React Query cache starts empty. Settings like the reader font
 * size live on the server (`GET /api/settings`), so there is a window —
 * potentially an indefinite one on a slow or offline connection — where the
 * UI renders hardcoded defaults instead of the user's saved preferences.
 * That is what makes the font "snap back to default" after locking a phone.
 *
 * React Query cache persistence does not solve this on its own: it restores
 * asynchronously, and any cache-clearing event wipes it.
 *
 * So the handful of settings that affect first paint are ALSO mirrored here,
 * in a single small localStorage entry that can be read synchronously during
 * the initial render. The server remains the source of truth: whenever fresh
 * settings arrive they overwrite this mirror, and components still prefer
 * server data once it loads. This is purely a "render the right thing
 * immediately" layer.
 *
 * IDENTITY SCOPING
 * ----------------
 * The stored payload is stamped with the identity it belongs to, and reads
 * require the caller to pass the identity they expect. A mismatch returns
 * empty rather than the stored value.
 *
 * This matters because consumers seed React state from this mirror during
 * *render*, while cache invalidation on an account switch necessarily runs
 * later, in an effect. Without the stamp, signing in as a different user
 * could paint that session with the previous user's font size and nav order
 * — and if `/api/settings` were slow or offline, it would stay that way.
 * Stamping makes the leak impossible by construction instead of relying on
 * effect ordering.
 *
 * Keep this payload SMALL and non-sensitive — it is only first-paint state.
 */
import { isGuestMode } from "@/lib/guest-mode";

export interface CachedUiSettings {
  readerFontSize?: number;
  ayahViewFontSize?: number;
  bottomNavKeys?: string[];
}

interface StoredPayload {
  identity: string;
  settings: CachedUiSettings;
}

const KEY = "qurantracker.uisettings.v1";

/**
 * Stable string for "who this cached state belongs to". Mirrors the
 * identity used by QueryCacheIdentityGuard in App.tsx so both layers agree
 * on what counts as a user change.
 */
export function resolveIdentity(userId: string | null | undefined): string {
  return userId ?? (isGuestMode() ? "guest" : "anon");
}

function parseSettings(value: unknown): CachedUiSettings {
  if (!value || typeof value !== "object") return {};
  const { readerFontSize, ayahViewFontSize, bottomNavKeys } = value as Record<string, unknown>;
  const out: CachedUiSettings = {};
  if (typeof readerFontSize === "number" && Number.isFinite(readerFontSize)) {
    out.readerFontSize = readerFontSize;
  }
  if (typeof ayahViewFontSize === "number" && Number.isFinite(ayahViewFontSize)) {
    out.ayahViewFontSize = ayahViewFontSize;
  }
  if (Array.isArray(bottomNavKeys) && bottomNavKeys.every(k => typeof k === "string")) {
    out.bottomNavKeys = bottomNavKeys as string[];
  }
  return out;
}

/**
 * Read the mirrored settings for `identity`. Returns `{}` if nothing is
 * stored, if the stored entry belongs to a different identity, or if
 * storage is unavailable/corrupt — callers then fall back to their own
 * defaults. Never throws.
 */
export function readCachedUiSettings(identity: string): CachedUiSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const payload = parsed as Partial<StoredPayload>;
    // Entries without a stamp predate identity scoping — treat as foreign.
    if (typeof payload.identity !== "string" || payload.identity !== identity) return {};
    return parseSettings(payload.settings);
  } catch {
    return {};
  }
}

/** Merge a partial update into the mirror for `identity`. Never throws. */
export function writeCachedUiSettings(identity: string, patch: CachedUiSettings): void {
  try {
    const next: StoredPayload = {
      identity,
      settings: { ...readCachedUiSettings(identity), ...patch },
    };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — the mirror is an optimisation, not a
    // requirement, so losing it is survivable.
  }
}

/**
 * Drop the mirror entirely. Belt-and-braces alongside identity stamping,
 * used when the signed-in identity changes.
 */
export function clearCachedUiSettings(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Ignore — nothing we can do, and nothing depends on this succeeding.
  }
}

/**
 * Clamp helper shared by the font-size consumers so a corrupt or
 * out-of-range mirrored value can never render an absurd font.
 */
export function clampFontSize(
  value: number | undefined,
  min: number,
  max: number,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < min || value > max) return undefined;
  return value;
}
