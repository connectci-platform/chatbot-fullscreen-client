import type { AgentTokenSource } from "./agent-token";
import { TurnstileChallenge } from "./run-errors";

/**
 * Adds the current Bearer token to a request for the agent, or no
 * Authorization header when the user is signed out. Credentials are left at
 * the default: the token is the identity, so the agent needs no cookie.
 */
export async function authorize(
  source: AgentTokenSource,
  init: RequestInit = {},
  options?: { strict?: boolean },
): Promise<RequestInit> {
  return withBearer(init, await source.getToken(options));
}

/**
 * A fetch for agent requests that were prepared with `authorize`. On a 401 it
 * mints once and sends the request once more. The agent answers 401 before it
 * starts a run or a stream, so this is the one safe automatic retry; anything
 * else, including a 5xx, is returned as it came. A Turnstile challenge on a
 * run rejects with TurnstileChallenge.
 */
export function createAgentFetch(
  source: AgentTokenSource,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): typeof fetch {
  return async (input, init) => {
    const res = await fetchWithRefresh(source, fetchImpl, input, init);
    await rejectChallenge(input, res);
    return res;
  };
}

async function fetchWithRefresh(
  source: AgentTokenSource,
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
): Promise<Response> {
  const res = await fetchImpl(input, init);
  if (res.status !== 401) return res;

  const sent = bearerToken(init?.headers);
  const body = init?.body;
  if (!sent || (body != null && typeof body !== "string")) return res;

  const token = await source.refresh(sent);
  if (!token) return res;
  return fetchImpl(input, withBearer(init ?? {}, token));
}

/**
 * The agent answers a challenge as JSON with a 200 on the run route. The SDK
 * only reads an event stream there and would report a generic failure, losing
 * the site key.
 */
async function rejectChallenge(
  input: Parameters<typeof fetch>[0],
  res: Response,
): Promise<void> {
  if (!String(input).endsWith("/runs/stream")) return;
  if (!res.headers.get("Content-Type")?.includes("application/json")) return;

  const body = await res
    .clone()
    .json()
    .catch(() => null);
  if (body?.requires_turnstile === true) {
    throw new TurnstileChallenge(body.site_key ?? "");
  }
}

function withBearer(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    headers.delete("Authorization");
  }
  return { ...init, headers };
}

function bearerToken(headers: HeadersInit | undefined): string | null {
  const value = new Headers(headers).get("Authorization");
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : null;
}
