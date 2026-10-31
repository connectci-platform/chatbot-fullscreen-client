// Mints short-lived Bearer tokens for the agent from support's
// /api/agent-token, which authenticates the browser with its support session
// cookie. Rules follow the agent-token contract's browser consumer rules.

export const DEFAULT_SUPPORT_URL = "https://support.access-ci.org";

// Mint again before a request when less than this remains. The agent refuses
// tokens with less than its turn timeout plus 30 seconds (150s) left.
export const REFRESH_MARGIN_MS = 180_000;
// After a failed mint, background requests reuse the failure instead of each
// asking support again; the contract allows no automatic retry.
export const FAILED_MINT_FLOOR_MS = 30_000;
const DEFAULT_RETRY_AFTER_S = 60;

export type AuthStatus = "unknown" | "signed_in" | "signed_out";

export type AgentTokenErrorKind = "temporary" | "rate_limited" | "refused";

const ERROR_MESSAGES: Record<AgentTokenErrorKind, string> = {
  temporary: "Couldn't check your sign-in. Please try again.",
  rate_limited:
    "Sign-in is temporarily unavailable. Please try again in a few minutes.",
  refused: "This page isn't allowed to sign in to the assistant.",
};

export class AgentTokenError extends Error {
  constructor(readonly kind: AgentTokenErrorKind) {
    super(ERROR_MESSAGES[kind]);
    this.name = "AgentTokenError";
  }
}

interface HeldToken {
  value: string;
  deadline: number;
}

export interface AgentTokenSource {
  /**
   * A usable token, or null when the user is signed out. When the mint fails
   * and this page hasn't seen the user signed in, it resolves null too, so
   * anonymous chat keeps working while support is unreachable; `strict`
   * rethrows instead. A user seen signed in always gets the error, since an
   * anonymous request would lose their thread.
   */
  getToken(options?: { strict?: boolean }): Promise<string | null>;
  /**
   * Mints again regardless of the held token. With `stale`, mints only if
   * that is still the held token, so requests that all got a 401 for the
   * same token share one re-mint.
   */
  refresh(stale?: string): Promise<string | null>;
  getStatus(): AuthStatus;
  subscribe(listener: () => void): () => void;
}

export function createAgentTokenSource({
  supportUrl,
  now = Date.now,
  fetchImpl = (...args) => fetch(...args),
}: {
  supportUrl: string;
  now?: () => number;
  fetchImpl?: typeof fetch;
}): AgentTokenSource {
  const mintUrl = `${supportUrl.replace(/\/$/, "")}/api/agent-token`;
  let held: HeldToken | null = null;
  // The last token handed out, kept after it expires so a late 401 for it
  // can be recognized as already handled.
  let issued: string | null = null;
  let status: AuthStatus = "unknown";
  let inflight: Promise<string | null> | null = null;
  let failure: { error: AgentTokenError; until: number } | null = null;
  const listeners = new Set<() => void>();

  const setStatus = (next: AuthStatus) => {
    if (next === status) return;
    status = next;
    listeners.forEach((listener) => listener());
  };

  const fail = (error: AgentTokenError, until: number): never => {
    failure = { error, until };
    throw error;
  };

  const requestToken = async (): Promise<string | null> => {
    let res: Response;
    try {
      res = await fetchImpl(mintUrl, {
        method: "POST",
        credentials: "include",
        referrerPolicy: "strict-origin-when-cross-origin",
      });
    } catch {
      return fail(
        new AgentTokenError("temporary"),
        now() + FAILED_MINT_FLOOR_MS,
      );
    }

    if (res.status === 401) {
      held = null;
      issued = null;
      setStatus("signed_out");
      return null;
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const waitS =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter
          : DEFAULT_RETRY_AFTER_S;
      return fail(new AgentTokenError("rate_limited"), now() + waitS * 1000);
    }
    if (res.status === 403) {
      // Never retried: the origin isn't registered, so nothing will change.
      return fail(new AgentTokenError("refused"), Number.POSITIVE_INFINITY);
    }

    const body: unknown = res.ok ? await res.json().catch(() => null) : null;
    const token = parseToken(body);
    if (!token) {
      return fail(
        new AgentTokenError("temporary"),
        now() + FAILED_MINT_FLOOR_MS,
      );
    }
    // The deadline is local receipt time plus expires_in; `exp` is never read,
    // so a skewed local clock can't make a token look fresher than it is.
    held = { value: token.value, deadline: now() + token.expiresIn * 1000 };
    issued = token.value;
    failure = null;
    setStatus("signed_in");
    return held.value;
  };

  const mint = (): Promise<string | null> => {
    if (failure && now() < failure.until) {
      return Promise.reject(failure.error);
    }
    if (!inflight) {
      inflight = requestToken().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };

  return {
    async getToken({ strict = false } = {}) {
      if (held && held.deadline - now() >= REFRESH_MARGIN_MS) {
        return held.value;
      }
      // Signed out stays signed out until refresh(), which the sign-in popup
      // and window focus trigger. Minting on every request would spend the
      // 120-per-hour limit on anonymous chats.
      if (status === "signed_out") return null;
      try {
        return await mint();
      } catch (e) {
        if (strict || status === "signed_in") throw e;
        return null;
      }
    },
    refresh(stale) {
      if (stale !== undefined && stale !== issued) {
        return Promise.resolve(held?.value ?? null);
      }
      held = null;
      if (failure && failure.error.kind === "temporary") failure = null;
      return mint();
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function parseToken(
  body: unknown,
): { value: string; expiresIn: number } | null {
  if (!body || typeof body !== "object") return null;
  const { access_token, expires_in } = body as Record<string, unknown>;
  if (typeof access_token !== "string" || !access_token) return null;
  if (typeof expires_in !== "number" || !(expires_in > 0)) return null;
  return { value: access_token, expiresIn: expires_in };
}

let pageSource: AgentTokenSource | null = null;

/** The page's one token source, shared by the header and every agent call. */
export function getAgentTokenSource(): AgentTokenSource {
  pageSource ??= createAgentTokenSource({ supportUrl: getSupportUrl() });
  return pageSource;
}

export function getSupportUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPPORT_URL || DEFAULT_SUPPORT_URL).replace(
    /\/$/,
    "",
  );
}
