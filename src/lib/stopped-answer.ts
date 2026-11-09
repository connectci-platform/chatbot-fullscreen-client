import type { Message } from "@langchain/langgraph-sdk";
import { DO_NOT_RENDER_ID_PREFIX } from "./ensure-tool-responses";
import { isStopError } from "./run-errors";

const shown = (messages: Message[]) =>
  messages.filter((m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX));

const hasText = (message: Message) =>
  typeof message.content === "string"
    ? message.content.trim().length > 0
    : message.content.some((b) => b.type === "text" && b.text.trim());

const humanCount = (messages: Message[]) =>
  messages.filter((m) => m.type === "human").length;

/**
 * What a stop keeps of the turn on screen: the conversation up to the
 * question, plus any answer text that had streamed. Tool calls are dropped
 * from that text, since their results will never come.
 */
export function stoppedTurn(messages: Message[]): {
  onScreen: Message[];
  partial: Message[];
} {
  const at = messages.findLastIndex((m) => m.type === "human");
  if (at === -1) return { onScreen: messages, partial: [] };
  const partial = messages
    .slice(at + 1)
    .filter((m) => m.type === "ai" && hasText(m))
    .map((m) => ({ ...m, tool_calls: [] }));
  return { onScreen: [...messages.slice(0, at + 1), ...partial], partial };
}

/**
 * After a stop the SDK swaps in the thread as the agent saved it. The agent
 * saves the question when the run starts but never a cut-off answer, so the
 * partial text goes back after it. A saved reply means the answer was
 * delivered before the stop reached the agent: that is shown as it is.
 */
export function afterStop(
  saved: Message[],
  turn: ReturnType<typeof stoppedTurn>,
): { messages: Message[] } | "delivered" {
  // The stop came before the agent saved the question, so keep the screen.
  if (humanCount(saved) < humanCount(turn.onScreen)) {
    return { messages: turn.onScreen };
  }
  if (shown(saved).at(-1)?.type === "human") {
    return { messages: [...saved, ...turn.partial] };
  }
  return "delivered";
}

/**
 * The question to show a Stopped note under, or null. That is the last
 * question when nothing answered it and no run is going, which also covers a
 * reloaded thread. `stopped` is set when the person stopped this turn here,
 * so the note also shows under the answer text that had streamed.
 */
export function unansweredQuestion({
  messages,
  isLoading,
  error,
  interrupted,
  stopped,
}: {
  messages: Message[];
  isLoading: boolean;
  error: unknown;
  interrupted: boolean;
  stopped: boolean;
}): { question: Message; stoppedHere: boolean } | null {
  if (isLoading || interrupted) return null;
  // Other failures have their own message, and a Turnstile check its panel.
  if (error && !isStopError(error)) return null;
  const visible = shown(messages);
  const at = visible.findLastIndex((m) => m.type === "human");
  if (at === -1) return null;
  const question = visible[at];
  const stoppedHere = stopped || isStopError(error);
  if (at === visible.length - 1) return { question, stoppedHere };
  return stopped ? { question, stoppedHere } : null;
}
