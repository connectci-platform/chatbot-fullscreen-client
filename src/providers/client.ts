import { Client } from "@langchain/langgraph-sdk";
import { authorize, createAgentFetch } from "@/lib/agent-fetch";
import { getAgentTokenSource } from "@/lib/agent-token";

/**
 * The one way this app builds an SDK client, so every agent call (the run
 * stream, history, and the sidebar's /threads/search) carries the Bearer
 * token and gets the single re-mint on a 401.
 *
 * `signInEpoch` counts sign-ins made after the page loaded. useStream keys
 * its history fetch on the client's config (url, key, default headers), so a
 * new epoch sends a header that changes that key and makes the history load
 * again as the signed-in person. The agent ignores the header.
 */
export function createClient(
  apiUrl: string,
  apiKey: string | undefined,
  authScheme: string | undefined,
  signInEpoch = 0,
) {
  const source = getAgentTokenSource();
  return new Client({
    apiKey,
    apiUrl,
    ...((authScheme || signInEpoch > 0) && {
      defaultHeaders: {
        ...(authScheme && { "X-Auth-Scheme": authScheme }),
        ...(signInEpoch > 0 && { "X-Sign-In-Epoch": String(signInEpoch) }),
      },
    }),
    // The SDK retries 429, 5xx and network errors on its own, which could
    // send a run twice after a write already happened.
    callerOptions: { maxRetries: 0, fetch: createAgentFetch(source) },
    onRequest: (_url, init) => authorize(source, init),
  });
}
