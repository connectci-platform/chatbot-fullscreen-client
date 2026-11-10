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
 * Why an answer was cut off: the person stopped it ("user"), the turn ran out
 * of time, or the agent failed. An agent from before reasons were saved only
 * marked stops, so a stopped answer without one is a stop.
 */
export type StopReason = "user" | "timeout" | "error";

export function stopReason(message: Message | undefined): StopReason | null {
  if (!isStoppedAnswer(message)) return null;
  const reason = message?.response_metadata?.reason;
  return reason === "timeout" || reason === "error" ? reason : "user";
}

/**
 * Why a run that just failed on screen ended, when it was the agent's turn
 * timing out or failing, which the agent saves as a cut-off answer. Null for
 * a stop, a Turnstile check, a missing thread and the like.
 */
export function failedRunReason(error: unknown): "timeout" | "error" | null {
  const name = error instanceof Error ? error.name : "";
  if (name === "timeout") return "timeout";
  return name === "agent_error" ? "error" : null;
}

/**
 * The thread as the agent saved it after a failed run: the answer text that
 * had streamed is marked cut off, until the next read brings the saved copy.
 */
export function withFailedTurnMarked(
  messages: Message[],
  error: unknown,
): Message[] {
  const reason = failedRunReason(error);
  const at = messages.findLastIndex((m) => m.type === "human");
  if (!reason || at === -1) return messages;
  return messages.map((m, i) =>
    i > at && m.type === "ai" && !isStoppedAnswer(m)
      ? {
          ...m,
          tool_calls: [],
          response_metadata: { ...m.response_metadata, stopped: true, reason },
        }
      : m,
  );
}

/**
 * The note under a cut-off answer. `wrote` is for a latest turn that made a
 * change before it was cut off, which asking again could make twice.
 */
export function cutOffNote(reason: StopReason, wrote = false): string {
  const note =
    reason === "user"
      ? "You stopped this answer."
      : "This answer didn't finish.";
  return wrote
    ? `${note} A change may already have been made, so check before asking again.`
    : note;
}

/**
 * Whether the turn from `at` was cut off after making a change: the agent
 * keeps a cut-off turn's write calls and their results ahead of its stopped
 * text, and asking again doesn't remove them.
 */
function cutOffAfterWrite(messages: Message[], at: number): boolean {
  const tail = messages.slice(at + 1);
  return (
    tail.some((m) => m.type === "tool") &&
    isStoppedAnswer(tail.at(-1)) &&
    tail.every(
      (m) =>
        m.type === "tool" ||
        isStoppedAnswer(m) ||
        (m.type === "ai" && (m.tool_calls?.length ?? 0) > 0),
    )
  );
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
}): {
  question: Message;
  stoppedHere: boolean;
  reason: StopReason;
  /** It made a change before it was cut off, so it can't simply be asked again. */
  wrote: boolean;
} | null {
  if (isLoading || interrupted) return null;
  // Other failures have their own message, and a Turnstile check its panel.
  const failed = failedRunReason(error);
  if (error && !isStopError(error) && !failed) return null;
  const visible = shown(messages);
  const at = visible.findLastIndex((m) => m.type === "human");
  if (at === -1) return null;
  const question = visible[at];
  const wrote = cutOffAfterWrite(visible, at);
  const savedStopped =
    (unansweredFrom(visible) === at && at < visible.length - 1) || wrote;
  const stoppedHere = stopped || savedStopped || isStopError(error) || !!failed;
  // A stop seen here is the person's; a failure or a saved stop says why.
  const reason =
    failed ??
    ((savedStopped && !stopped && stopReason(visible.at(-1))) || "user");
  if (at === visible.length - 1 || savedStopped) {
    return { question, stoppedHere, reason, wrote };
  }
  return stopped ? { question, stoppedHere, reason, wrote } : null;
}
