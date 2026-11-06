import { Client } from "@langchain/langgraph-sdk";
import { authorize, createAgentFetch } from "@/lib/agent-fetch";
import { getAgentTokenSource } from "@/lib/agent-token";

/**
 * The one way this app builds an SDK client, so every agent call (the run
 * stream, history, and the sidebar's /threads/search) carries the Bearer
 * token and gets the single re-mint on a 401.
 */
export function createClient(
  apiUrl: string,
  apiKey: string | undefined,
  authScheme: string | undefined,
) {
  const source = getAgentTokenSource();
  return new Client({
    apiKey,
    apiUrl,
    ...(authScheme && {
      defaultHeaders: {
        "X-Auth-Scheme": authScheme,
      },
    }),
    // The SDK retries 429, 5xx and network errors on its own, which could
    // send a run twice after a write already happened.
    callerOptions: { maxRetries: 0, fetch: createAgentFetch(source) },
    onRequest: (_url, init) => authorize(source, init),
  });
}
