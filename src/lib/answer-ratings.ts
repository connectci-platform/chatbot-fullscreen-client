import type { Message } from "@langchain/langgraph-sdk";
import { getContentString } from "@/components/thread/utils";
import { authorize, createAgentFetch } from "./agent-fetch";
import { getAgentTokenSource } from "./agent-token";
import { withClaimKey } from "./thread-claim";

export type Rating = "helpful" | "not_helpful";
export type ThreadRatings = Record<string, Rating>;

/** The agent keeps this much of a comment. */
export const MAX_FEEDBACK_CHARS = 500;

// One read per thread, shared by every answer on screen.
const loaded = new Map<string, Promise<ThreadRatings>>();

const cacheKey = (apiUrl: string, threadId: string) => `${apiUrl}\n${threadId}`;

async function agentRequest(
  apiUrl: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const source = getAgentTokenSource();
  return createAgentFetch(source)(
    `${apiUrl}${path}`,
    await authorize(source, withClaimKey(init)),
  );
}

function threadPath(threadId: string) {
  return `/threads/${encodeURIComponent(threadId)}`;
}

function isRating(value: unknown): value is Rating {
  return value === "helpful" || value === "not_helpful";
}

async function fetchRatings(
  apiUrl: string,
  threadId: string,
): Promise<ThreadRatings | null> {
  try {
    const res = await agentRequest(apiUrl, `${threadPath(threadId)}/ratings`, {
      method: "GET",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { ratings?: unknown };
    const ratings = body?.ratings;
    if (!ratings || typeof ratings !== "object" || Array.isArray(ratings)) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(ratings).filter(([, value]) => isRating(value)),
    ) as ThreadRatings;
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * What this browser rated in a thread, so a reload shows it. Empty when the
 * agent can't say; that answer isn't kept, so the next answer asks again.
 */
export function loadRatings(
  apiUrl: string,
  threadId: string,
): Promise<ThreadRatings> {
  const key = cacheKey(apiUrl, threadId);
  let pending = loaded.get(key);
  if (!pending) {
    pending = fetchRatings(apiUrl, threadId).then((ratings) => {
      if (!ratings) loaded.delete(key);
      return ratings ?? {};
    });
    loaded.set(key, pending);
  }
  return pending;
}

/**
 * Rates one answer, replacing any earlier rating of it. False when the agent
 * didn't save it.
 */
export async function saveRating(
  apiUrl: string,
  threadId: string,
  messageId: string,
  rating: Rating,
  feedback?: string,
): Promise<boolean> {
  try {
    const res = await agentRequest(
      apiUrl,
      `${threadPath(threadId)}/messages/${encodeURIComponent(messageId)}/rating`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedback ? { rating, feedback } : { rating }),
      },
    );
    if (!res.ok) return false;
  } catch (e) {
    console.error(e);
    return false;
  }
  const cached = loaded.get(cacheKey(apiUrl, threadId));
  if (cached) {
    loaded.set(
      cacheKey(apiUrl, threadId),
      cached.then((ratings) => ({ ...ratings, [messageId]: rating })),
    );
  }
  return true;
}

/**
 * Whether this message is its turn's answer: the last AI message with text
 * before the next question. The agent rates only those, so interim notes
 * written between tool calls get no buttons.
 */
export function isTurnAnswer(messages: Message[], messageId: string): boolean {
  const index = messages.findIndex((m) => m.id === messageId);
  if (index < 0 || messages[index].type !== "ai") return false;
  if (!getContentString(messages[index].content).trim()) return false;
  for (const later of messages.slice(index + 1)) {
    if (later.type === "human") return true;
    if (later.type === "ai" && getContentString(later.content).trim()) {
      return false;
    }
  }
  return true;
}
