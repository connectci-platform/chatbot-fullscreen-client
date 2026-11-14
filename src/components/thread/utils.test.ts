import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import { getContentString } from "./utils";

describe("getContentString", () => {
  it("returns a string as it is", () => {
    expect(getContentString("hello")).toBe("hello");
  });

  it("returns only the typed text, as Copy uses it", () => {
    const content = [
      { type: "text", text: "Why did my job fail?" },
      { type: "attachment", id: "a".repeat(32), name: "job.log", kind: "text" },
      {
        type: "text",
        text: "[Not shared: notes.docx isn't a supported file.]",
      },
      { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
    ] as unknown as Message["content"];
    expect(getContentString(content)).toBe("Why did my job fail?");
  });
});
