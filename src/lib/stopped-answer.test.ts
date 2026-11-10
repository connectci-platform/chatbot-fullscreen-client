import { describe, expect, it } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import {
  afterStop,
  failedRunReason,
  withFailedTurnMarked,
  cutOffNote,
  stopReason,
  isStoppedAnswer,
  stoppedTurn,
  unansweredQuestion,
  withoutUnansweredTurn,
} from "./stopped-answer";

const earlier: Message = { id: "h-0", type: "human", content: "Hi" };
const earlierReply: Message = { id: "a-0", type: "ai", content: "Hello." };
const question: Message = { id: "h-1", type: "human", content: "Anvil?" };
// The agent saves the question as a message of its own, with a new id.
const savedQuestion: Message = {
  id: "srv-1",
  type: "human",
  content: "Anvil?",
};
const partial: Message = {
  id: "a-1",
  type: "ai",
  content: "Anvil is",
  tool_calls: [{ id: "c-1", name: "search", args: {} }],
};

describe("stoppedTurn", () => {
  it("keeps the question and the answer text, without its tool calls", () => {
    const turn = stoppedTurn([earlier, earlierReply, question, partial]);
    expect(turn.partial).toEqual([{ ...partial, tool_calls: [] }]);
    expect(turn.onScreen.map((m) => m.id)).toEqual([
      "h-0",
      "a-0",
      "h-1",
      "a-1",
    ]);
  });

  it("drops a tool call that wrote no text", () => {
    const call: Message = { ...partial, content: "" };
    expect(stoppedTurn([question, call]).partial).toEqual([]);
  });
});

describe("afterStop", () => {
  const turn = stoppedTurn([earlier, earlierReply, question, partial]);

  it("puts the streamed text back after the saved question", () => {
    expect(afterStop([earlier, earlierReply, savedQuestion], turn)).toEqual({
      messages: [earlier, earlierReply, savedQuestion, turn.partial[0]],
    });
  });

  it("keeps the screen when the question wasn't saved yet", () => {
    expect(afterStop([earlier, earlierReply], turn)).toEqual({
      messages: turn.onScreen,
    });
  });

  it("reports an answer the agent saved before the stop", () => {
    const reply: Message = { id: "a-1", type: "ai", content: "Anvil is big." };
    expect(afterStop([earlier, earlierReply, savedQuestion, reply], turn)).toBe(
      "delivered",
    );
  });
});

describe("unansweredQuestion", () => {
  const idle = {
    isLoading: false,
    error: undefined,
    interrupted: false,
    stopped: false,
  };

  it("finds a last question with no reply, as on a reload", () => {
    expect(unansweredQuestion({ ...idle, messages: [question] })).toEqual({
      question,
      stoppedHere: false,
      reason: "user",
      wrote: false,
    });
  });

  it("is nothing under a completed answer", () => {
    const reply: Message = { id: "a-1", type: "ai", content: "Big." };
    expect(unansweredQuestion({ ...idle, messages: [question, reply] })).toBe(
      null,
    );
  });

  it("covers the streamed text of a stopped turn", () => {
    expect(
      unansweredQuestion({
        ...idle,
        stopped: true,
        messages: [question, partial],
      }),
    ).toEqual({ question, stoppedHere: true, reason: "user", wrote: false });
  });

  it("ignores hidden tool responses after the question", () => {
    const hidden: Message = {
      id: "do-not-render-1",
      type: "tool",
      tool_call_id: "c-1",
      content: "",
    };
    expect(
      unansweredQuestion({ ...idle, messages: [question, hidden] })?.question,
    ).toBe(question);
  });

  it("is nothing while a run is going, interrupted, or failed another way", () => {
    const messages = [question];
    expect(unansweredQuestion({ ...idle, messages, isLoading: true })).toBe(
      null,
    );
    expect(unansweredQuestion({ ...idle, messages, interrupted: true })).toBe(
      null,
    );
    const offline = Object.assign(new Error(), { name: "TypeError" });
    expect(unansweredQuestion({ ...idle, messages, error: offline })).toBe(
      null,
    );
  });

  it("is a cut-off answer when the agent's turn timed out or failed", () => {
    const timeout = Object.assign(new Error(), { name: "timeout" });
    const failed = Object.assign(new Error(), { name: "agent_error" });
    const messages = [question];
    expect(unansweredQuestion({ ...idle, messages, error: timeout })).toEqual({
      question,
      stoppedHere: true,
      reason: "timeout",
      wrote: false,
    });
    expect(
      unansweredQuestion({ ...idle, messages, error: failed })?.reason,
    ).toBe("error");
  });

  it("counts an agent's cancelled error as a stop", () => {
    const cancelled = Object.assign(new Error(), { name: "cancelled" });
    expect(
      unansweredQuestion({ ...idle, messages: [question], error: cancelled }),
    ).toEqual({ question, stoppedHere: true, reason: "user", wrote: false });
  });
});

describe("a stopped answer the agent saved", () => {
  const saved: Message = {
    id: "a-1",
    type: "ai",
    content: "Anvil is",
    response_metadata: { stopped: true },
  };

  it("is marked in its response_metadata", () => {
    expect(isStoppedAnswer(saved)).toBe(true);
    expect(isStoppedAnswer(earlierReply)).toBe(false);
    expect(isStoppedAnswer(question)).toBe(false);
    expect(isStoppedAnswer(undefined)).toBe(false);
  });

  it("is shown as saved after a stop, and still reads as stopped", () => {
    const turn = stoppedTurn([earlier, earlierReply, question, partial]);
    const thread = [earlier, earlierReply, savedQuestion, saved];
    expect(afterStop(thread, turn)).toEqual({ messages: thread });
  });

  it("leaves its question unanswered, stopped", () => {
    const at = unansweredQuestion({
      messages: [earlier, earlierReply, question, saved],
      isLoading: false,
      error: undefined,
      interrupted: false,
      stopped: false,
    });
    expect(at).toEqual({
      question,
      stoppedHere: true,
      reason: "user",
      wrote: false,
    });
  });

  it("is what Retry and Edit replace, with its question", () => {
    expect(
      withoutUnansweredTurn([earlier, earlierReply, question, saved]),
    ).toEqual([earlier, earlierReply]);
    expect(withoutUnansweredTurn([earlier, earlierReply, question])).toEqual([
      earlier,
      earlierReply,
    ]);
    expect(withoutUnansweredTurn([earlier, earlierReply])).toEqual([
      earlier,
      earlierReply,
    ]);
    expect(withoutUnansweredTurn([])).toEqual([]);
  });
});

describe("why an answer was cut off", () => {
  const cut = (reason?: string): Message => ({
    id: "a-1",
    type: "ai",
    content: "Anvil is",
    response_metadata: { stopped: true, ...(reason && { reason }) },
  });

  it("reads the reason, as a stop when an older agent gave none", () => {
    expect(stopReason(cut("timeout"))).toBe("timeout");
    expect(stopReason(cut("error"))).toBe("error");
    expect(stopReason(cut("user"))).toBe("user");
    expect(stopReason(cut())).toBe("user");
    expect(stopReason(cut("something else"))).toBe("user");
    expect(stopReason(earlierReply)).toBeNull();
  });

  it("says a timeout or a failure didn't finish", () => {
    expect(cutOffNote("user")).toBe("You stopped this answer.");
    expect(cutOffNote("timeout")).toBe("This answer didn't finish.");
    expect(cutOffNote("error")).toBe("This answer didn't finish.");
  });

  it("gives the saved reason for the latest question", () => {
    const args = {
      isLoading: false,
      error: undefined,
      interrupted: false,
    };
    expect(
      unansweredQuestion({
        ...args,
        messages: [question, cut("error")],
        stopped: false,
      })?.reason,
    ).toBe("error");
    // A stop the person made here is theirs, whatever was saved.
    expect(
      unansweredQuestion({
        ...args,
        messages: [question, cut("timeout")],
        stopped: true,
      })?.reason,
    ).toBe("user");
  });
});

describe("a run that failed on screen", () => {
  const timeout = Object.assign(new Error(), { name: "timeout" });

  it("is a timeout or an error only for the agent's own failures", () => {
    expect(failedRunReason(timeout)).toBe("timeout");
    expect(
      failedRunReason(Object.assign(new Error(), { name: "agent_error" })),
    ).toBe("error");
    expect(
      failedRunReason(Object.assign(new Error(), { name: "cancelled" })),
    ).toBeNull();
    expect(failedRunReason(undefined)).toBeNull();
  });

  it("marks the answer text that had streamed as cut off, as the agent saved it", () => {
    const thread = [earlier, earlierReply, question, partial];
    const marked = withFailedTurnMarked(thread, timeout);
    expect(marked.slice(0, 3)).toEqual(thread.slice(0, 3));
    expect(marked[3].response_metadata).toEqual({
      stopped: true,
      reason: "timeout",
    });
    expect((marked[3] as { tool_calls?: unknown[] }).tool_calls).toEqual([]);
    expect(withFailedTurnMarked(thread, undefined)).toBe(thread);
    expect(withFailedTurnMarked([], timeout)).toEqual([]);
  });
});

describe("a cut-off turn that made a change", () => {
  const call: Message = {
    id: "m-1",
    type: "ai",
    content: "Posting it.",
    tool_calls: [{ id: "c-1", name: "create_announcement", args: {} }],
  };
  const result: Message = {
    id: "t-1",
    type: "tool",
    content: "created",
    tool_call_id: "c-1",
  };
  const cut = (reason?: string): Message => ({
    id: "a-1",
    type: "ai",
    content: "Done, it",
    response_metadata: { stopped: true, ...(reason && { reason }) },
  });
  const idle = {
    isLoading: false,
    error: undefined,
    interrupted: false,
    stopped: false,
  };

  it("is the latest unanswered turn, marked as having written", () => {
    expect(
      unansweredQuestion({
        ...idle,
        messages: [question, call, result, cut()],
      }),
    ).toEqual({ question, stoppedHere: true, reason: "user", wrote: true });
    expect(
      unansweredQuestion({
        ...idle,
        messages: [question, call, result, cut("error")],
      })?.reason,
    ).toBe("error");
  });

  it("isn't one when the write's turn finished", () => {
    const answer: Message = { id: "a-2", type: "ai", content: "Posted." };
    expect(
      unansweredQuestion({
        ...idle,
        messages: [question, call, result, answer],
      }),
    ).toBeNull();
  });

  it("isn't removed when it's asked again", () => {
    const thread = [question, call, result, cut()];
    expect(withoutUnansweredTurn(thread)).toBe(thread);
  });

  it("says a change may already have been made", () => {
    expect(cutOffNote("user", true)).toBe(
      "You stopped this answer. A change may already have been made, so check before asking again.",
    );
    expect(cutOffNote("timeout", true)).toBe(
      "This answer didn't finish. A change may already have been made, so check before asking again.",
    );
  });
});
