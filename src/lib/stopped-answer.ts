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
 * An answer the person stopped, as the agent saves it: the text that had
 * streamed, marked in its response_metadata. It may be empty, when the stop
 * came before any text.
 */
export function isStoppedAnswer(message: Message | undefined): boolean {
  return message?.type === "ai" && message.response_metadata?.stopped === true;
}

/**
 * Where the latest question starts, when nothing but a stopped answer, or
 * nothing at all, came after it. Else -1.
 */
function unansweredFrom(messages: Message[]): number {
  const at = messages.findLastIndex((m) => m.type === "human");
  if (at === -1) return -1;
  return messages.slice(at + 1).every(isStoppedAnswer) ? at : -1;
}

/**
 * The thread without its unanswered last turn, which Retry and Edit replace.
 * Unchanged when the last question was answered.
 */
export function withoutUnansweredTurn(messages: Message[]): Message[] {
  const at = unansweredFrom(messages);
  return at === -1 ? messages : messages.slice(0, at);
}

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
 * saves the question when the run starts, and the cut-off answer, marked
 * stopped, once the stop reaches it. A read that comes before that has only
 * the question, so the partial text goes back after it. A saved reply that
 * isn't marked stopped means the answer was delivered before the stop
 * reached the agent: that is shown as it is.
 */
export function afterStop(
  saved: Message[],
  turn: ReturnType<typeof stoppedTurn>,
): { messages: Message[] } | "delivered" {
  // The stop came before the agent saved the question, so keep the screen.
  if (humanCount(saved) < humanCount(turn.onScreen)) {
    return { messages: turn.onScreen };
  }
  const last = shown(saved).at(-1);
  if (last?.type === "human") {
    return { messages: [...saved, ...turn.partial] };
  }
  if (isStoppedAnswer(last)) return { messages: saved };
  return "delivered";
}

/**
 * The question to show a Stopped note under, or null. That is the last
 * question when nothing answered it and no run is going, which also covers a
 * reloaded thread. `stopped` is set when the person stopped this turn here,
 * so the note also shows under the answer text that had streamed. An answer
 * the agent saved as stopped reads the same way, here or after a reload.
 *
 * A thread reloaded while the agent is still answering also reads as
 * unanswered: the agent doesn't report a thread's active run (its history has
 * no `next`, and search always says idle), and this client doesn't rejoin
 * runs. Retry there is refused by the agent's per-thread run lock with a 409,
 * so it can't start a second run.
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
  const savedStopped =
    unansweredFrom(visible) === at && at < visible.length - 1;
  const stoppedHere = stopped || savedStopped || isStopError(error);
  if (at === visible.length - 1 || savedStopped) {
    return { question, stoppedHere };
  }
  return stopped ? { question, stoppedHere } : null;
}
