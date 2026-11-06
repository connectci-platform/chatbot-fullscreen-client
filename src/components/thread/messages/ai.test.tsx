import { render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { describe, expect, it, vi } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import { AssistantMessage } from "./ai";

const toolMessage: Message = {
  id: "tool-1",
  type: "tool",
  tool_call_id: "call-1",
  content: "secret tool output",
};

vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => ({
    messages: [toolMessage],
    values: {},
    interrupt: undefined,
    getMessagesMetadata: () => undefined,
    setBranch: vi.fn(),
  }),
}));

function renderMessage(message: Message, searchParams = "") {
  return render(
    <NuqsTestingAdapter searchParams={searchParams}>
      <AssistantMessage
        message={message}
        isLoading={false}
        handleRegenerate={vi.fn()}
      />
    </NuqsTestingAdapter>,
  );
}

describe("AssistantMessage", () => {
  it("keeps tool messages hidden with ?hideToolCalls=false", () => {
    renderMessage(toolMessage, "?hideToolCalls=false");
    expect(screen.queryByText("secret tool output")).toBeNull();
  });
});
