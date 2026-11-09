import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import {
  continuedAfter,
  isToolCallNarration,
  narrationParagraphs,
  plainText,
} from "./tool-narration";

const calling = (text: string, name = "search_access_documents"): Message => ({
  id: "a1",
  type: "ai",
  content: text,
  tool_calls: [{ id: "c1", name, args: {} }],
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

  it("is not the text before a tool that changes something", () => {
    const text = "I'll register you for the Globus workshop on Friday.";
    expect(isToolCallNarration(calling(text, "register_for_event"), text)).toBe(
      false,
    );
    expect(isToolCallNarration(calling(text, "create_event"), text)).toBe(
      false,
    );
  });

  it("is not the text before a pause for approval", () => {
    const text = "Let me look that up.";
    expect(isToolCallNarration(calling(text), text, true)).toBe(false);
    expect(isToolCallNarration(calling(text, "get_resource"), text)).toBe(true);
  });
});

describe("isToolCallNarration once the model has gone on", () => {
  const long = `The documentation shows wait_times: null. ${"More notes. ".repeat(20)}`;
  const paragraphs = "Delta has two partitions.\n\nLet me check which.";

  it("takes long or multi-paragraph text as working notes", () => {
    expect(isToolCallNarration(calling(long), long, false, true)).toBe(true);
    expect(
      isToolCallNarration(calling(paragraphs), paragraphs, false, true),
    ).toBe(true);
  });

  it("still keeps text with links, before writes, or before approval", () => {
    const linked = "See https://docs.ncsa.illinois.edu while I check.";
    expect(isToolCallNarration(calling(linked), linked, false, true)).toBe(
      false,
    );
    expect(
      isToolCallNarration(calling(long, "create_event"), long, false, true),
    ).toBe(false);
    expect(isToolCallNarration(calling(long), long, true, true)).toBe(false);
  });
});

describe("continuedAfter", () => {
  const q: Message = { id: "h1", type: "human", content: "Q" };
  const call = calling("Let me check.");
  const tool: Message = {
    id: "t1",
    type: "tool",
    tool_call_id: "c1",
    content: "{}",
  };
  const answer: Message = { id: "a2", type: "ai", content: "Answer." };

  it("is true when the model wrote again in the same turn", () => {
    expect(continuedAfter([q, call, tool, answer], call)).toBe(true);
  });

  it("is false while the lookup runs, or when the next turn started", () => {
    expect(continuedAfter([q, call, tool], call)).toBe(false);
    const next: Message = { id: "h2", type: "human", content: "Q2" };
    expect(continuedAfter([q, call, tool, next, answer], call)).toBe(false);
  });
});

describe("narrationParagraphs", () => {
  it("keeps paragraphs and reads tool field names as words", () => {
    expect(
      narrationParagraphs(
        "The docs show `wait_times: null`.\n\nLet me pull **avg_waitduration_hours** from XDMoD.",
      ),
    ).toEqual([
      "The docs show wait times: null.",
      "Let me pull avg waitduration hours from XDMoD.",
    ]);
  });

  it("leaves paths and commands alone", () => {
    expect(
      narrationParagraphs("Check /expanse/lustre/projects and my_job.sh."),
    ).toEqual(["Check /expanse/lustre/projects and my_job.sh."]);
  });

  it("drops list markers and heading marks", () => {
    expect(
      narrationParagraphs("## Plan\n- look up Delta\n- then Anvil"),
    ).toEqual(["Plan look up Delta then Anvil"]);
  });
});

describe("plainText", () => {
  it("drops inline markdown", () => {
    expect(
      plainText(" Let me check **Delta**'s `squeue` [docs](https://x.org). "),
    ).toBe("Let me check Delta's squeue docs.");
  });
});
