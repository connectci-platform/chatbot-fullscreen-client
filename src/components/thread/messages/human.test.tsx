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
  it("has no Copy or Edit button", () => {
    render(<HumanMessage message={humanMessage} />);
    expect(screen.getByText("What is ACCESS?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy content" })).toBeNull();
  });
});
