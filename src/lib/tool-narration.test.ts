import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import { isToolCallNarration } from "./tool-narration";

const calling = (text: string): Message => ({
  id: "a1",
  type: "ai",
  content: text,
  tool_calls: [{ id: "c1", name: "search_access_documents", args: {} }],
});

describe("isToolCallNarration", () => {
  it("is a line of text in a message that calls a tool", () => {
    const text = "Let me first check the documentation for Delta's partitions.";
    expect(isToolCallNarration(calling(text), text)).toBe(true);
  });

  it("is not a written answer", () => {
    const text = "Let me know if you need anything else.";
    const message: Message = { id: "a2", type: "ai", content: text };
    expect(isToolCallNarration(message, text)).toBe(false);
  });

  it("is not real content written before a tool call", () => {
    const long = `Delta has CPU and GPU partitions. ${"More detail. ".repeat(20)}`;
    expect(isToolCallNarration(calling(long), long)).toBe(false);
    const paragraphs = "Delta has two partitions.\n\nLet me check which.";
    expect(isToolCallNarration(calling(paragraphs), paragraphs)).toBe(false);
    const linked = "See https://docs.ncsa.illinois.edu while I check.";
    expect(isToolCallNarration(calling(linked), linked)).toBe(false);
  });

  it("is nothing for a tool call with no text", () => {
    expect(isToolCallNarration(calling(""), "")).toBe(false);
  });
});
