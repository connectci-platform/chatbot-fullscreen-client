import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import { getSuggestedQuestions } from "./suggested-questions";

const answer = (suggested: unknown): Message =>
  ({
    id: "ai-1",
    type: "ai",
    content: "An answer.",
    additional_kwargs: { suggested_questions: suggested },
  }) as Message;

describe("getSuggestedQuestions", () => {
  it("reads the agent's questions", () => {
    expect(
      getSuggestedQuestions(
        answer(["How do I get an allocation?", "What is Delta?"]),
      ),
    ).toEqual(["How do I get an allocation?", "What is Delta?"]);
  });

  it("gives none when they are missing", () => {
    expect(
      getSuggestedQuestions({ id: "a", type: "ai", content: "x" } as Message),
    ).toEqual([]);
    expect(getSuggestedQuestions(undefined)).toEqual([]);
  });

  it("gives none when the list is malformed", () => {
    expect(getSuggestedQuestions(answer("What is Delta?"))).toEqual([]);
    expect(getSuggestedQuestions(answer({ 0: "What is Delta?" }))).toEqual([]);
    expect(getSuggestedQuestions(answer(null))).toEqual([]);
  });

  it("drops entries that aren't strings", () => {
    expect(
      getSuggestedQuestions(answer([1, null, { q: "x" }, "What is Delta?"])),
    ).toEqual(["What is Delta?"]);
  });

  it("keeps at most three", () => {
    expect(
      getSuggestedQuestions(answer(["A?", "B?", "C?", "D?", "E?"])),
    ).toEqual(["A?", "B?", "C?"]);
  });

  it("drops repeats", () => {
    expect(getSuggestedQuestions(answer(["A?", " A? ", "B?", "A?"]))).toEqual([
      "A?",
      "B?",
    ]);
  });

  it("drops empty strings", () => {
    expect(getSuggestedQuestions(answer(["", "   ", "A?"]))).toEqual(["A?"]);
  });

  it("ignores them on a human message", () => {
    expect(
      getSuggestedQuestions({
        id: "h",
        type: "human",
        content: "x",
        additional_kwargs: { suggested_questions: ["A?"] },
      } as Message),
    ).toEqual([]);
  });
});
