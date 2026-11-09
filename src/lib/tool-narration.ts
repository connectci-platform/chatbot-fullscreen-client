import type { Message } from "@langchain/langgraph-sdk";

/**
 * Longest text that still reads as a line about what the agent is doing
 * ("Let me check the Delta documentation for that."), not as content.
 */
const NARRATION_LENGTH = 240;

/** Tools that only look things up, by the agent's naming. */
const READ_TOOL = /^(?:get|search|list|describe|compare)_/;

/**
 * Whether an AI message's text is the model narrating the tool call it
 * makes in the same message, such as "Let me first check the documentation".
 * That is shown as a status line, not as an answer. Longer text, or text
 * with paragraphs, lists or links, is kept as an answer: the model sometimes
 * writes real content before it calls a tool. So is text before a tool that
 * isn't a lookup, such as create_event.
 */
export function isToolCallNarration(
  message: Message | undefined,
  text: string,
  interruptPending = false,
) {
  if (message?.type !== "ai" || !message.tool_calls?.length) return false;
  // Before a tool that changes something, or a pause for the person's
  // approval, the text may be what the person needs to read.
  if (interruptPending) return false;
  if (!message.tool_calls.every((call) => READ_TOOL.test(call.name))) {
    return false;
  }
  const line = text.trim();
  return (
    line.length > 0 &&
    line.length <= NARRATION_LENGTH &&
    !line.includes("\n") &&
    !/https?:\/\//.test(line)
  );
}

/** A narration line as plain text: inline markdown would show literally. */
export function plainText(text: string): string {
  return text
    .trim()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|\*|_|`)(.+?)\1/g, "$2");
}
