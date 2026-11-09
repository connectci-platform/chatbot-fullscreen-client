import { describe, expect, it } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import { getCapabilitySuggestions } from "./capability-suggestions";

function ai(additional_kwargs: unknown): Message {
  return {
    id: "m1",
    type: "ai",
    content: "I can help you find and use ACCESS resources and services.",
    additional_kwargs,
  } as unknown as Message;
}

describe("getCapabilitySuggestions", () => {
  it("returns the capability answer's suggestions in order", () => {
    expect(
      getCapabilitySuggestions(
        ai({
          capability_overview: true,
          suggestions: [
            "Which ACCESS resources have GPUs?",
            "Where can I run GROMACS?",
          ],
        }),
      ),
    ).toEqual([
      "Which ACCESS resources have GPUs?",
      "Where can I run GROMACS?",
    ]);
  });

  it("ignores suggestions on any other answer", () => {
    expect(getCapabilitySuggestions(ai({ suggestions: ["Hi?"] }))).toEqual([]);
    expect(getCapabilitySuggestions(ai(undefined))).toEqual([]);
    expect(
      getCapabilitySuggestions({
        id: "h",
        type: "human",
        content: "x",
        additional_kwargs: { capability_overview: true, suggestions: ["x"] },
      } as unknown as Message),
    ).toEqual([]);
    expect(getCapabilitySuggestions(undefined)).toEqual([]);
  });

  it("drops blank, duplicate, overlong and non-text entries and caps the list", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Question ${i}?`);
    const out = getCapabilitySuggestions(
      ai({
        capability_overview: true,
        suggestions: [" ", "A?", "A?", 7, "x".repeat(201), " B? ", ...many],
      }),
    );
    expect(out.slice(0, 2)).toEqual(["A?", "B?"]);
    expect(out).toHaveLength(12);
  });

  it("returns nothing when suggestions isn't a list", () => {
    expect(
      getCapabilitySuggestions(
        ai({ capability_overview: true, suggestions: "A?" }),
      ),
    ).toEqual([]);
  });
});
