import { authorize, createAgentFetch } from "./agent-fetch";
import { getAgentTokenSource } from "./agent-token";

export type HandoffResult =
  | { status: "exchanged"; threadId: string | null }
  | { status: "not_sent"; message: string };

/**
 * Exchanges a widget handoff token for a thread_id. Waits for the agent
 * token first: an exchange sent without it would be refused, using up the
 * handoff token. When the mint fails the exchange isn't sent ("not_sent"),
 * even for a user who may be anonymous, so the handoff token is still unused.
 */
export async function exchangeHandoffToken(
  apiUrl: string,
  token: string,
): Promise<HandoffResult> {
  const source = getAgentTokenSource();
  let init: RequestInit;
  try {
    init = await authorize(
      source,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      },
      { strict: true },
    );
  } catch (e) {
    console.error(e);
    return {
      status: "not_sent",
      message: e instanceof Error ? e.message : String(e),
    };
  }
  try {
    const res = await createAgentFetch(source)(
      `${apiUrl}/handoff/exchange`,
      init,
    );
    if (!res.ok) return { status: "exchanged", threadId: null };
    const data = (await res.json()) as { thread_id?: string };
    return { status: "exchanged", threadId: data.thread_id ?? null };
  } catch (e) {
    console.error(e);
    return { status: "exchanged", threadId: null };
  }
}
