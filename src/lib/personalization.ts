import { useSyncExternalStore } from "react";
import { authorize, createAgentFetch } from "./agent-fetch";
import { getAgentTokenSource } from "./agent-token";

/**
 * Personalized answers (D8-3124): whether the assistant may use a signed-in
 * user's ACCESS allocations. Off until the user turns it on. The setting
 * lives in their ACCESS profile; the agent reads and writes it for them.
 */
export type ConsentState = "allow" | "deny" | "unset";
export type ConsentChoice = "allow" | "deny" | "not_now";

const PATH = "/me/assistant-consent";

export interface PersonalizationSnapshot {
  /** null until read, or when it couldn't be. */
  consent: ConsentState | null;
  /** The thread whose last answer came with an offer, until it's answered. */
  offerThreadId: string | null;
}

let snapshot: PersonalizationSnapshot = { consent: null, offerThreadId: null };
const listeners = new Set<() => void>();
// Conversations where the user chose Allow once. Kept for this page only:
// the choice is for this conversation, and a reload asks again later.
const allowedOnce = new Set<string>();

function set(next: Partial<PersonalizationSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePersonalization(): PersonalizationSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

function isState(value: unknown): value is ConsentState {
  return value === "allow" || value === "deny" || value === "unset";
}

async function request(
  apiUrl: string,
  init: RequestInit,
): Promise<ConsentState> {
  const source = getAgentTokenSource();
  const res = await createAgentFetch(source)(
    `${apiUrl}${PATH}`,
    await authorize(source, init),
  );
  if (!res.ok) throw new Error(`personalization setting: ${res.status}`);
  const body: unknown = await res.json();
  const consent = (body as { consent?: unknown } | null)?.consent;
  if (!isState(consent)) throw new Error("personalization setting: bad reply");
  return consent;
}

/** Reads the signed-in user's setting. On failure the setting shows as unknown. */
export async function loadConsent(apiUrl: string): Promise<void> {
  try {
    set({ consent: await request(apiUrl, { method: "GET" }) });
  } catch (error) {
    console.error(error);
    set({ consent: null });
  }
}

/** Records a choice. Throws when it couldn't be saved, leaving the old state. */
export async function saveConsent(
  apiUrl: string,
  choice: ConsentChoice,
): Promise<ConsentState> {
  const consent = await request(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consent: choice }),
  });
  set({ consent });
  return consent;
}

/** The agent offered personalization after an answer in this thread. */
export function showOffer(threadId: string | null) {
  if (!threadId || allowedOnce.has(threadId)) return;
  set({ offerThreadId: threadId });
}

export function dismissOffer() {
  set({ offerThreadId: null });
}

export function allowOnce(threadId: string) {
  allowedOnce.add(threadId);
  dismissOffer();
}

/** Whether the next message in this thread goes out with Allow once. */
export function isAllowedOnce(threadId: string | null | undefined): boolean {
  return !!threadId && allowedOnce.has(threadId);
}

/** Signing out forgets the setting and every Allow once. */
export function resetPersonalization() {
  allowedOnce.clear();
  set({ consent: null, offerThreadId: null });
}

export function isPersonalizationOfferEvent(
  event: unknown,
): event is { type: "personalization_offer" } {
  return (
    !!event &&
    typeof event === "object" &&
    (event as { type?: unknown }).type === "personalization_offer"
  );
}
