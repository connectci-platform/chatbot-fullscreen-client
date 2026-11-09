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
 * That is shown as a status line, not as an answer.
 *
 * A short line always is. Longer text, or text with paragraphs, is when the
 * model went on to answer after the lookup (`continued`): it is the model
 * thinking aloud on the way, often naming tool fields ("wait_times: null"),
 * and the answer that follows is the one to read. Until then it is kept as
 * an answer, since the model sometimes writes real content before it calls
 * a tool and may never get further. Text with links stays an answer either
 * way, so the links stay usable, and so does text before a tool that isn't
 * a lookup, such as create_event.
 */
export function isToolCallNarration(
  message: Message | undefined,
  text: string,
  interruptPending = false,
  continued = false,
) {
  if (message?.type !== "ai" || !message.tool_calls?.length) return false;
  // Before a tool that changes something, or a pause for the person's
  // approval, the text may be what the person needs to read.
  if (interruptPending) return false;
  if (!message.tool_calls.every((call) => READ_TOOL.test(call.name))) {
    return false;
  }
  const line = text.trim();
  if (!line || /https?:\/\//.test(line)) return false;
  if (continued) return true;
  return line.length <= NARRATION_LENGTH && !line.includes("\n");
}

/**
 * Whether the model wrote anything more in this turn after `message`: a
 * later AI message before the next question.
 */
export function continuedAfter(messages: Message[], message: Message) {
  const index = messages.findIndex((m) => m === message || m.id === message.id);
  if (index < 0) return false;
  for (const m of messages.slice(index + 1)) {
    if (m.type === "human") return false;
    if (m.type === "ai") return true;
  }
  return false;
}

/**
 * A tool field name as words: "avg_waitduration_hours" reads as "avg
 * waitduration hours". Only names with an underscore between lowercase
 * words, so paths and commands keep theirs.
 */
const FIELD_NAME = /(?<![\w/.-])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w/-]|\.\w)/g;

/** Narration as one line of plain text. */
export function plainText(text: string): string {
  return narrationParagraphs(text).join(" ");
}

/**
 * Narration as plain text, one entry per paragraph: inline markdown would
 * show literally in a status line.
 */
export function narrationParagraphs(text: string): string[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) =>
          line.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/, ""),
        )
        .join(" ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        // Before emphasis, whose _ would otherwise join the words up.
        .replace(FIELD_NAME, (name) => name.replace(/_/g, " "))
        .replace(/(\*\*|__|\*|_|`)(.+?)\1/g, "$2")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}
