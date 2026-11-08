import { authorize, createAgentFetch } from "./agent-fetch";
import { getAgentTokenSource, type AuthStatus } from "./agent-token";

const STORAGE_KEY = "thread-claim-key";
const SIGNED_IN_KEY = "thread-claim-signed-in";

// Only used when local storage is unavailable.
let memoryKey: string | null = null;
let memorySignedIn = false;

function read(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string): boolean {
  try {
    localStorage.setItem(name, value);
    return true;
  } catch {
    return false;
  }
}

function remove(name: string) {
  try {
    localStorage.removeItem(name);
  } catch {
    // Blocked storage holds nothing to remove.
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
  const stored = read(STORAGE_KEY);
  if (stored) return stored;
  const key = memoryKey ?? newKey();
  memoryKey = write(STORAGE_KEY, key) ? null : key;
  return key;
}

/**
 * Forgets the key at sign-out, so the next person on this browser can't reach
 * or link the conversations it started. Any still unclaimed are lost for good.
 */
export function clearClaimKey() {
  memoryKey = null;
  memorySignedIn = false;
  remove(STORAGE_KEY);
  remove(SIGNED_IN_KEY);
}

/**
 * Clears the key after a sign-out this page didn't see, such as logging out on
 * support or a session expiring, by remembering across loads that someone was
 * signed in. Someone who never was keeps their key.
 */
export function noteAuthStatus(status: AuthStatus) {
  if (status === "signed_in") {
    memorySignedIn = !write(SIGNED_IN_KEY, "1");
  } else if (status === "signed_out") {
    if (memorySignedIn || read(SIGNED_IN_KEY)) clearClaimKey();
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
