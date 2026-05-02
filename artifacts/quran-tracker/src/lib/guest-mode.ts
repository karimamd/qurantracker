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
