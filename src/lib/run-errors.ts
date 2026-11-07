import type { AuthStatus } from "./agent-token";

const GENERIC = "Something went wrong. Please try again.";

// Names the SDK reports when the user stopped the run on purpose.
const SILENT = new Set(["cancelled", "AbortError"]);

/** True for the SDK's HTTPError with status 404. */
export function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as Error & { status?: unknown }).status === 404
  );
}

/**
 * A conversation that 404ed while signed out may be the person's own, so
 * after they sign in the page reloads to open it as them.
 */
export function shouldReloadAfterSignIn(
  previous: AuthStatus,
  next: AuthStatus,
  error: unknown,
): boolean {
  return previous === "signed_out" && next === "signed_in" && isNotFound(error);
}

/**
 * Toast options for a failed run. A refused conversation hides the header's
 * New conversation button, so the toast offers it and stays until used.
 */
export function runErrorToastOptions(error: unknown, startNew: () => void) {
  return {
    richColors: true,
    closeButton: true,
    ...(isNotFound(error) && {
      duration: Infinity,
      action: { label: "New conversation", onClick: startNew },
    }),
  };
}

/** Plain text for a failed run, or null when nothing should be shown. */
export function runErrorMessage(
  error: unknown,
  authStatus: AuthStatus,
): string | null {
  // A 404 comes from opening a thread the caller can't read: someone else's,
  // or one this browser no longer has the key for.
  if (isNotFound(error)) {
    return authStatus === "signed_in"
      ? "This conversation isn't available. Start a new one."
      : "That conversation isn't available. Start a new one, or sign in if it was yours.";
  }
  const name = error instanceof Error ? error.name : "";
  if (SILENT.has(name)) return null;
  if (name === "timeout") return "That took too long. Please try again.";
  return GENERIC;
}
