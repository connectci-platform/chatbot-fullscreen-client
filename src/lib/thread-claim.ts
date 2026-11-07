import { authorize, createAgentFetch } from "./agent-fetch";
import { getAgentTokenSource } from "./agent-token";

const STORAGE_KEY = "thread-claim-key";

let memoryKey: string | null = null;

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(key: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Blocked storage: the key lasts until this page unloads.
  }
}

/**
 * This tab's secret for claiming conversations it started signed out. The
 * thread id is in the URL, so anyone with a shared link has it; this key never
 * leaves the tab except to the agent, which is how the agent tells the person
 * who started a conversation from someone who was sent the link. Session
 * storage, not local, so the next person on a shared computer doesn't get it.
 */
export function getClaimKey(): string {
  memoryKey ??= readStored();
  if (!memoryKey) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    memoryKey = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    store(memoryKey);
  }
  return memoryKey;
}

export function withClaimKey(init: RequestInit): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("X-Thread-Claim-Key", getClaimKey());
  return { ...init, headers };
}

/**
 * Links a conversation this tab started signed out to the person who just
 * signed in. False when the agent refused it or the request failed; their next
 * message tries again, since runs carry the same key.
 */
export async function claimThread(
  apiUrl: string,
  threadId: string,
): Promise<boolean> {
  const source = getAgentTokenSource();
  try {
    const init = await authorize(source, withClaimKey({ method: "POST" }));
    const res = await createAgentFetch(source)(
      `${apiUrl}/threads/${encodeURIComponent(threadId)}/claim`,
      init,
    );
    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}
