import type { Message } from "@langchain/langgraph-sdk";

const MAX_SUGGESTIONS = 12;
const MAX_LENGTH = 200;

/** The agent's fixed "what can you help me with?" answer, not a model answer. */
export function isCapabilityOverview(message: Message | undefined): boolean {
  if (!message || message.type !== "ai") return false;
  const extra = (message as { additional_kwargs?: unknown }).additional_kwargs;
  return (
    typeof extra === "object" &&
    extra !== null &&
    (extra as Record<string, unknown>).capability_overview === true
  );
}

/**
 * The example questions the agent attaches to its "what can you help me
 * with?" answer, as additional_kwargs { capability_overview, suggestions }.
 * Anything else, or a malformed list, yields none.
 */
export function getCapabilitySuggestions(
  message: Message | undefined,
): string[] {
  if (!message || message.type !== "ai") return [];
  const extra = (message as { additional_kwargs?: unknown }).additional_kwargs;
  if (typeof extra !== "object" || extra === null) return [];
  const { capability_overview, suggestions } = extra as Record<string, unknown>;
  if (capability_overview !== true || !Array.isArray(suggestions)) return [];
  const seen = new Set<string>();
  for (const item of suggestions) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (!text || text.length > MAX_LENGTH || seen.has(text)) continue;
    seen.add(text);
    if (seen.size === MAX_SUGGESTIONS) break;
  }
  return [...seen];
}
