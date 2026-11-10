import { authorize, createAgentFetch } from "./agent-fetch";
import { getAgentTokenSource } from "./agent-token";
import { withClaimKey } from "./thread-claim";

/**
 * GETs a path under one thread on the agent, with the Bearer token and the
 * browser's claim key, so it passes the same access check as the thread's
 * history: `threadGet(apiUrl, id)("attachments/abc")`.
 */
export function threadGet(
  apiUrl: string,
  threadId: string,
): (path: string) => Promise<Response> {
  return async (path) => {
    const source = getAgentTokenSource();
    const init = await authorize(source, withClaimKey({ method: "GET" }));
    return createAgentFetch(source)(
      `${apiUrl}/threads/${encodeURIComponent(threadId)}/${path}`,
      init,
    );
  };
}
