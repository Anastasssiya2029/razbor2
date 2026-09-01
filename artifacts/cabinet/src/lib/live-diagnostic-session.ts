// Tracks whether the manager is currently inside the client-facing "live"
// analysis session (the /analysis/:id carousel with the growth map and
// archetype) for a given diagnostic, as opposed to just viewing its saved
// result. The live page, the Plan page, and the Gift page are separate route
// mounts, so nothing in React state survives navigating between them --
// this needs a storage-backed flag instead.
//
// Session storage (not local storage) is deliberate: it clears itself when
// the tab closes, so an abandoned session from days ago can never resurface
// and redirect "Разбор" to a stale live page instead of the saved result.
const STORAGE_KEY = "tbs_live_diagnostic_session";

export function markLiveDiagnosticSession(diagnosticId: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, diagnosticId);
  } catch {
    // Storage can be unavailable (private mode, quota). Worst case "Разбор"
    // just falls back to the saved result -- not worth surfacing an error.
  }
}

export function hasLiveDiagnosticSession(diagnosticId: string): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === diagnosticId;
  } catch {
    return false;
  }
}

// Call when the manager reaches "Мои разборы" -- the explicit exit point
// from the live session, however they got there (button, hamburger menu,
// browser back/forward, a typed-in URL).
export function clearLiveDiagnosticSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
