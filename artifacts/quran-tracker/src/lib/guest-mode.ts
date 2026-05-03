/**
 * Client-side flag for "user is browsing as a guest".
 *
 * The flag in localStorage is purely a UI hint — the actual identity is
 * proved server-side by the `guest_id` cookie issued in
 * artifacts/api-server/src/middlewares/requireAuth.ts. We mirror the
 * state in localStorage so App.tsx and Layout can render the right gate
 * (Landing vs ProtectedApp vs guest banner) without waiting on a network
 * round-trip.
 *
 * Storage failures (private mode, quota, etc.) are swallowed: the API
 * still works because the cookie is the source of truth.
 */
const GUEST_FLAG_KEY = "qt_guest_mode";

export function isGuestMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GUEST_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function enterGuestMode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_FLAG_KEY, "1");
  } catch {
    // ignore storage failures (private mode, etc.) — server still issues a
    // guest cookie, the flag is only a UI hint.
  }
}

export function exitGuestMode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_FLAG_KEY);
  } catch {
    // ignore
  }
}
