import type { AuthStatus } from "./agent-token";

const GENERIC = "Something went wrong. Please try again.";
const TOO_LARGE =
  "That's too much to send at once. Shorten the question, or share long text as a file.";

// Names the SDK reports when the user stopped the run on purpose.
const SILENT = new Set(["cancelled", "AbortError"]);

/** True when the run ended because it was stopped, not because it failed. */
export function isStopError(error: unknown): boolean {
  return error instanceof Error && SILENT.has(error.name);
}

/**
 * The agent wants a signed-out person to pass a Turnstile check before it
 * answers. Shows no error toast, because the challenge panel explains it.
 */
export class TurnstileChallenge extends Error {
  override name = "TurnstileChallenge";

  constructor(readonly siteKey: string) {
    super("Turnstile check required");
  }
}

export function isTurnstileChallenge(
  error: unknown,
): error is TurnstileChallenge {
  return error instanceof TurnstileChallenge;
}

/** True for the SDK's HTTPError with status 404. */
export function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as Error & { status?: unknown }).status === 404
  );
}

/**
 * The agent's explanation for a 413, such as a question over its length
 * limit. The proxy's own 413, for a request over its size cap, has none.
 */
function tooLargeDetail(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const { status, text } = error as Error & {
    status?: unknown;
    text?: unknown;
  };
  if (status !== 413) return null;
  try {
    const detail: unknown = JSON.parse(String(text)).detail;
    return typeof detail === "string" && detail ? detail : TOO_LARGE;
  } catch {
    return TOO_LARGE;
  }
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
    closeButton: true,
    ...(isNotFound(error) && {
      duration: Infinity,
      action: { label: "New conversation", onClick: startNew },
    }),
  };
}

/**
 * Signing in lifts the limit, so a challenged question goes out again as the
 * signed-in person. Only on the change to signed in, from any other status (a
 * failed first mint leaves it unknown), so a repeat challenge can't loop.
 */
export function shouldResendAfterSignIn(
  previous: AuthStatus,
  next: AuthStatus,
  error: unknown,
): boolean {
  return (
    previous !== "signed_in" &&
    next === "signed_in" &&
    isTurnstileChallenge(error)
  );
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
  if (isStopError(error) || isTurnstileChallenge(error)) return null;
  if (name === "timeout") return "That took too long. Please try again.";
  return tooLargeDetail(error) ?? GENERIC;
}
