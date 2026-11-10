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
  const notes = `The documentation shows wait_times: null. ${"More notes. ".repeat(20)}`;
  const paragraphs = "Delta has two partitions.\n\nLet me check which.";
  const after = (text: string, name?: string) =>
    isToolCallNarration(calling(text, name), text, false, true);

  it("takes a few plain paragraphs as working notes", () => {
    expect(after(notes)).toBe(true);
    expect(after(paragraphs)).toBe(true);
  });

  it("never flattens a table, code, a list or a heading", () => {
    for (const text of [
      "Delta and Anvil compared:\n\n| | Delta | Anvil |\n|-|-|-|\n| GPUs | A100 | A100 |",
      "Submit it with:\n\n```bash\nsbatch job.sh\n```",
      "Delta has:\n\n- CPU nodes\n- GPU nodes",
      "Steps:\n\n1. Log in\n2. Submit",
      "## Delta\n\nDelta is an NCSA system.",
    ])
      expect(after(text)).toBe(false);
  });

  it("never flattens long text", () => {
    const answer = `Delta has CPU and GPU partitions. ${"Detail. ".repeat(80)}\n\nLet me check which.`;
    expect(after(answer)).toBe(false);
  });

  it("still keeps text with links, before writes, or before approval", () => {
    const linked = "See https://docs.ncsa.illinois.edu while I check.";
    expect(after(linked)).toBe(false);
    expect(after(notes, "create_event")).toBe(false);
    expect(isToolCallNarration(calling(notes), notes, true, true)).toBe(false);
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
    const blocks: Message = {
      id: "a3",
      type: "ai",
      content: [{ type: "text", text: "Answer." }],
    };
    expect(continuedAfter([q, call, tool, blocks], call)).toBe(true);
  });

  it("is false while the lookup runs, or when the next turn started", () => {
    expect(continuedAfter([q, call, tool], call)).toBe(false);
    const next: Message = { id: "h2", type: "human", content: "Q2" };
    expect(continuedAfter([q, call, tool, next, answer], call)).toBe(false);
  });

  it("is false when the next message only calls another tool, as when the run stops there", () => {
    const second: Message = {
      id: "a4",
      type: "ai",
      content: "",
      tool_calls: [{ id: "c2", name: "get_chart_data", args: {} }],
    };
    expect(continuedAfter([q, call, tool, second], call)).toBe(false);
  });

  it("finds the message itself, not an earlier one that has no id", () => {
    const earlier: Message = { type: "ai", content: "Earlier." };
    const noId: Message = { ...call, id: undefined };
    expect(continuedAfter([earlier, q, noId, tool], noId)).toBe(false);
    expect(continuedAfter([earlier, q, noId, tool, answer], noId)).toBe(true);
  });
});

describe("narrationParagraphs", () => {
  it("keeps paragraphs and reads tool field names as words", () => {
    expect(
      narrationParagraphs(
        "The docs show wait_times as null.\n\nLet me pull **avg_waitduration_hours** from XDMoD.",
      ),
    ).toEqual([
      "The docs show wait times as null.",
      "Let me pull avg waitduration hours from XDMoD.",
    ]);
  });

  it("leaves code spans, flags, variables, paths and file names as written", () => {
    expect(
      narrationParagraphs(
        "The result has `wait_times: null`. Try --partition=gpu_shared with $SLURM_JOB_ID, my_job.sh, ~/my_dir and /expanse/my_proj.",
      ),
    ).toEqual([
      "The result has wait_times: null. Try --partition=gpu_shared with $SLURM_JOB_ID, my_job.sh, ~/my_dir and /expanse/my_proj.",
    ]);
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
