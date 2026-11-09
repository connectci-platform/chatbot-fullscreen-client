import type { Message } from "@langchain/langgraph-sdk";

/**
 * Longest text that still reads as a line about what the agent is doing
 * ("Let me check the Delta documentation for that."), not as content.
 */
const NARRATION_LENGTH = 240;

/**
 * Whether an AI message's text is the model narrating the tool call it
 * makes in the same message, such as "Let me first check the documentation".
 * That is shown as a status line, not as an answer. Longer text, or text
 * with paragraphs, lists or links, is kept as an answer: the model sometimes
 * writes real content before it calls a tool.
 */
export function isToolCallNarration(
  message: Message | undefined,
  text: string,
) {
  if (message?.type !== "ai" || !message.tool_calls?.length) return false;
  const line = text.trim();
  return (
    line.length > 0 &&
    line.length <= NARRATION_LENGTH &&
    !line.includes("\n") &&
    !/https?:\/\//.test(line)
  );
}
