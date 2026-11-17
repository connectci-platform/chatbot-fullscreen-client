import { authorize, createAgentFetch } from "./agent-fetch";
import { getAgentTokenSource } from "./agent-token";
import { withClaimKey } from "./thread-claim";

/**
 * Deleting conversations (D8-3126). The agent removes a conversation and
 * everything kept for it: its messages, shared files, ratings and quality
 * records. It keeps only a note that a deletion happened.
 */

export class DeleteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const BUSY = "An answer is still being written. Try again when it finishes.";
const FAILED = "Couldn't delete. Try again.";

async function request(apiUrl: string, path: string): Promise<Response> {
  const source = getAgentTokenSource();
  // The claim key lets a signed-out browser delete a conversation it started.
  const res = await createAgentFetch(source)(
    `${apiUrl}${path}`,
    await authorize(source, withClaimKey({ method: "DELETE" })),
  );
  if (res.ok) return res;
  throw new DeleteError(res.status === 409 ? BUSY : FAILED, res.status);
}

/** Deletes one conversation the user owns or started in this browser. */
export async function deleteConversation(
  apiUrl: string,
  threadId: string,
): Promise<void> {
  await request(apiUrl, `/threads/${encodeURIComponent(threadId)}`);
}

/** Deletes every conversation of the signed-in user. Returns how many. */
export async function deleteAllConversations(apiUrl: string): Promise<number> {
  const res = await request(apiUrl, "/me/conversations");
  const body: unknown = await res.json().catch(() => null);
  const deleted = (body as { deleted?: unknown } | null)?.deleted;
  return typeof deleted === "number" ? deleted : 0;
}
