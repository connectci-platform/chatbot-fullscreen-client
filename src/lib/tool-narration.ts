import type { Message } from "@langchain/langgraph-sdk";

/**
 * Longest text that still reads as a line about what the agent is doing
 * ("Let me check the Delta documentation for that."), not as content.
 */
const NARRATION_LENGTH = 240;

/**
 * Longest working note shown as status lines once the model has answered
 * after it. Past this it is more likely an answer than a note.
 */
const NOTES_LENGTH = 600;

/** Tools that only look things up, by the agent's naming. */
const READ_TOOL = /^(?:get|search|list|describe|compare)_/;

/**
 * Markdown structure a working note doesn't have: a table row, a code
 * fence, a list item or a heading. Flattened into a status line, it would
 * lose what made it readable.
 */
const STRUCTURE =
  /^ {0,3}(?:\||```|~~~|[-*+][ \t]|\d{1,9}[.)][ \t]|#{1,6}[ \t])/m;

/**
 * Whether an AI message's text is the model narrating the tool call it
 * makes in the same message, such as "Let me first check the documentation".
 * That is shown as a status line, not as an answer.
 *
 * A short line always is. A few plain paragraphs are once the model has
 * written its answer after the lookup (`continued`): they are the model
 * thinking aloud on the way, often naming tool fields ("wait_times: null"),
 * and the answer that follows is the one to read. Until then they are kept
 * as an answer, since the model sometimes writes real content before it
 * calls a tool and may never get further. Text with links, structure
 * (a table, code, a list, a heading) or length stays an answer either way,
 * and so does text before a tool that isn't a lookup, such as create_event.
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
  if (line.length <= NARRATION_LENGTH && !line.includes("\n")) return true;
  return continued && line.length <= NOTES_LENGTH && !STRUCTURE.test(line);
}

function textOf(content: Message["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("");
}

/**
 * Whether the model wrote more text in this turn after `message`: a later
 * AI message with text, before the next question. A message that only
 * calls another tool doesn't count; the run may stop there, leaving this
 * message's text as all there is.
 */
export function continuedAfter(messages: Message[], message: Message) {
  const index = messages.findIndex(
    (m) =>
      m === message ||
      (m.id !== undefined && message.id !== undefined && m.id === message.id),
  );
  if (index < 0) return false;
  for (const m of messages.slice(index + 1)) {
    if (m.type === "human") return false;
    if (m.type === "ai" && textOf(m.content).trim()) return true;
  }
  return false;
}

/**
 * A tool field name as words: "avg_waitduration_hours" reads as "avg
 * waitduration hours". Only lowercase snake_case words standing alone, so
 * ALL_CAPS variables, flags ("--partition=gpu_shared"), paths and file
 * names keep theirs. Code spans are left as written.
 */
const FIELD_NAME =
  /(?<![\w/.\-=$~])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w/\-=]|\.\w)/g;

const CODE_SPAN = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;

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
    .map((paragraph) => {
      const joined = paragraph
        .split("\n")
        .map((line) =>
          line.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/, ""),
        )
        .join(" ");
      // Code spans come out whole, before anything else reads inside them.
      const spans: string[] = [];
      const prose = joined.replace(CODE_SPAN, (_, __, code: string) => {
        spans.push(code.trim());
        return `${spans.length - 1}`;
      });
      return (
        prose
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
          // Before emphasis, whose _ would otherwise join the words up.
          .replace(FIELD_NAME, (name) => name.replace(/_/g, " "))
          .replace(/(\*\*|\*)(.+?)\1/g, "$2")
          // Underscore emphasis only at word edges, not inside my_job.sh.
          .replace(/(?<!\w)(__|_)(?!\s)(.+?)\1(?!\w)/g, "$2")
          .replace(/(\d+)/g, (_, i: string) => spans[Number(i)])
          .replace(/\s+/g, " ")
          .trim()
      );
    })
    .filter(Boolean);
}
