import { describe, expect, it } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import {
  afterStop,
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
    ).toEqual({ question, stoppedHere: true });
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

  it("is nothing while a run is going, interrupted, or failed", () => {
    const messages = [question];
    expect(unansweredQuestion({ ...idle, messages, isLoading: true })).toBe(
      null,
    );
    expect(unansweredQuestion({ ...idle, messages, interrupted: true })).toBe(
      null,
    );
    const timeout = Object.assign(new Error(), { name: "timeout" });
    expect(unansweredQuestion({ ...idle, messages, error: timeout })).toBe(
      null,
    );
  });

  it("counts an agent's cancelled error as a stop", () => {
    const cancelled = Object.assign(new Error(), { name: "cancelled" });
    expect(
      unansweredQuestion({ ...idle, messages: [question], error: cancelled }),
    ).toEqual({ question, stoppedHere: true });
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
    expect(at).toEqual({ question, stoppedHere: true });
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
