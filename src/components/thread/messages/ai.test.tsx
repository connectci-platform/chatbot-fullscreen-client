import { render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import { AssistantMessage, AssistantMessageLoading } from "./ai";

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

  it("has no Copy button when the message has no text", () => {
    const toolCallMessage: Message = { id: "ai-2", type: "ai", content: "" };
    stream.messages = [toolCallMessage];
    renderMessage(toolCallMessage);
    expect(screen.queryByRole("button", { name: "Copy content" })).toBeNull();
  });

  it("still renders an interrupt for the last AI message", () => {
    stream.messages = [aiMessage];
    stream.interrupt = { value: { reason: "needs approval" } };
    renderMessage(aiMessage);
    expect(screen.getByText(/needs approval/)).toBeTruthy();
  });

  it("lists the documentation sources an answer links", () => {
    const url = "https://www.psc.edu/resources/bridges-2/user-guide/";
    const search: Message = {
      id: "tool-2",
      type: "tool",
      tool_call_id: "call-2",
      name: "search_access_documents",
      content: `Retrieved 1 documentation excerpt(s).\n\n[1] source: ${url}\nUse Globus.`,
    };
    const answer: Message = {
      id: "ai-3",
      type: "ai",
      content: `See the [user guide](${url}).`,
    };
    stream.messages = [search, answer];
    renderMessage(answer);
    expect(screen.getByRole("button", { name: /user guide/ })).toBeTruthy();
  });

  it("shows the agent's status while it works", () => {
    render(<AssistantMessageLoading status="Searching software..." />);
    expect(screen.getByRole("status").textContent).toContain(
      "Searching software...",
    );
  });

  it("announces a default when there is no status yet", () => {
    render(<AssistantMessageLoading />);
    expect(screen.getByRole("status").textContent).toContain(
      "Writing an answer…",
    );
  });
});
