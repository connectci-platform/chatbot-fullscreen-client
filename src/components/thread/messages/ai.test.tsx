import { render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import { AssistantMessage } from "./ai";

const toolMessage: Message = {
  id: "tool-1",
  type: "tool",
  tool_call_id: "call-1",
  content: "secret tool output",
};

const aiMessage: Message = {
  id: "ai-1",
  type: "ai",
  content: "Hello from the assistant",
};

const stream: {
  messages: Message[];
  interrupt: unknown;
} = { messages: [], interrupt: undefined };

vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => ({
    messages: stream.messages,
    values: {},
    interrupt: stream.interrupt,
  }),
}));

vi.mock("../artifact", () => ({ useArtifact: () => [null, vi.fn()] }));

function renderMessage(message: Message, searchParams = "") {
  return render(
    <NuqsTestingAdapter searchParams={searchParams}>
      <AssistantMessage
        message={message}
        isLoading={false}
      />
    </NuqsTestingAdapter>,
  );
}

describe("AssistantMessage", () => {
  beforeEach(() => {
    stream.messages = [toolMessage];
    stream.interrupt = undefined;
  });

  it("keeps tool messages hidden with ?hideToolCalls=false", () => {
    renderMessage(toolMessage, "?hideToolCalls=false");
    expect(screen.queryByText("secret tool output")).toBeNull();
  });

  it("offers Copy but not Regenerate", () => {
    stream.messages = [aiMessage];
    renderMessage(aiMessage);
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy content" })).toBeTruthy();
  });

  it("still renders an interrupt for the last AI message", () => {
    stream.messages = [aiMessage];
    stream.interrupt = { value: { reason: "needs approval" } };
    renderMessage(aiMessage);
    expect(screen.getByText(/needs approval/)).toBeTruthy();
  });
});
