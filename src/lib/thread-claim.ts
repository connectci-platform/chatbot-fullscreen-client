import { authorize, createAgentFetch } from "./agent-fetch";
import { getAgentTokenSource } from "./agent-token";

const STORAGE_KEY = "thread-claim-key";

// Only used when local storage is unavailable.
let memoryKey: string | null = null;

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(key: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, key);
    return true;
  } catch {
    return false;
  }
}

function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * This browser's secret for the conversations it started signed out. The
 * thread id is in the URL, so it proves nothing; the agent reads, continues or
 * links an unclaimed conversation only for the key that started it. Read fresh
 * each time so a sign-out in another tab takes effect here too. With storage
 * blocked the key lasts until the page unloads, and so does access.
 */
export function getClaimKey(): string {
  const stored = readStored();
  if (stored) return stored;
  const key = memoryKey ?? newKey();
  memoryKey = store(key) ? null : key;
  return key;
}

/**
 * Forgets the key at sign-out, so the next person on this browser can't reach
 * or link the conversations it started. Any still unclaimed are lost for good.
 */
export function clearClaimKey() {
  memoryKey = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Blocked storage holds no key to remove.
  }
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
