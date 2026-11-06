import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import { HumanMessage } from "./human";

const humanMessage: Message = {
  id: "human-1",
  type: "human",
  content: "What is ACCESS?",
};

describe("HumanMessage", () => {
  it("offers Copy but not Edit", () => {
    render(
      <HumanMessage
        message={humanMessage}
        isLoading={false}
      />,
    );
    expect(screen.getByText("What is ACCESS?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy content" })).toBeTruthy();
  });
});
