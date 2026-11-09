import type { Message } from "@langchain/langgraph-sdk";

const MAX_QUESTIONS = 3;
const MAX_LENGTH = 200;

/**
 * The follow-up questions the agent attaches to an answer, as
 * additional_kwargs.suggested_questions. They can arrive a few seconds after
 * the answer's text, and older threads, refusals and errors have none.
 * Anything that isn't a non-empty string is dropped, repeats are dropped,
 * and at most three are kept.
 */
export function getSuggestedQuestions(message: Message | undefined): string[] {
  if (!message || message.type !== "ai") return [];
  const extra = (message as { additional_kwargs?: unknown }).additional_kwargs;
  if (typeof extra !== "object" || extra === null) return [];
  const list = (extra as Record<string, unknown>).suggested_questions;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (!text || text.length > MAX_LENGTH || seen.has(text)) continue;
    seen.add(text);
    if (seen.size === MAX_QUESTIONS) break;
  }
  return [...seen];
}
