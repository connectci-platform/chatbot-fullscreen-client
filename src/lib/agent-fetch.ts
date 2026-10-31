import type { AgentTokenSource } from "./agent-token";

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
 * else, including a 5xx, is returned as it came.
 */
export function createAgentFetch(
  source: AgentTokenSource,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): typeof fetch {
  return async (input, init) => {
    const res = await fetchImpl(input, init);
    if (res.status !== 401) return res;

    const sent = bearerToken(init?.headers);
    const body = init?.body;
    if (!sent || (body != null && typeof body !== "string")) return res;

    const token = await source.refresh(sent);
    if (!token) return res;
    return fetchImpl(input, withBearer(init ?? {}, token));
  };
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
