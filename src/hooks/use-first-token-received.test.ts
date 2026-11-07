import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import type { RunStatusEvent } from "@/lib/run-status";
import { useFirstTokenReceived } from "./use-first-token-received";

const human: Message = { id: "h", type: "human", content: "Hi" };
const ai = (id: string): Message => ({ id, type: "ai", content: "Text" });
const status = (message: string): RunStatusEvent => ({
  type: "status",
  message,
});

function setup() {
  return renderHook(
    ({ messages, runStatus }) => useFirstTokenReceived(messages, runStatus),
    {
      initialProps: {
        messages: [human] as Message[],
        runStatus: null as RunStatusEvent | null,
      },
    },
  );
}

describe("useFirstTokenReceived", () => {
  it("is set by a new AI message", () => {
    const { result, rerender } = setup();
    expect(result.current[0]).toBe(false);
    rerender({ messages: [human, ai("a")], runStatus: null });
    expect(result.current[0]).toBe(true);
  });

  it("clears when a tool starts after the model wrote text", () => {
    const { result, rerender } = setup();
    const messages = [human, ai("a")];
    rerender({ messages, runStatus: null });
    rerender({ messages, runStatus: status("Searching software...") });
    expect(result.current[0]).toBe(false);
  });

  it("clears again when the same line repeats after more text", () => {
    const { result, rerender } = setup();
    const line = "Searching software...";
    const runStatus = status(line);
    const first = [human, ai("a")];
    rerender({ messages: first, runStatus });
    const second = [...first, ai("b")];
    rerender({ messages: second, runStatus });
    expect(result.current[0]).toBe(true);
    rerender({ messages: second, runStatus: status(line) });
    expect(result.current[0]).toBe(false);
  });
});
