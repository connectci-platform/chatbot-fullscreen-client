import { describe, it, expect } from "vitest";
import {
  formatBytes,
  isAttachmentRef,
  isFileBlock,
  isTypedText,
  toResendBlocks,
} from "./upload-blocks";

const id = "a".repeat(32);

describe("isAttachmentRef", () => {
  it("accepts a reference with a 32-char hex id", () => {
    expect(isAttachmentRef({ type: "attachment", id, kind: "image" })).toBe(
      true,
    );
  });

  it("rejects other ids and other types", () => {
    expect(isAttachmentRef({ type: "attachment", id: "nope" })).toBe(false);
    expect(isAttachmentRef({ type: "attachment", id: id.toUpperCase() })).toBe(
      false,
    );
    expect(isAttachmentRef({ type: "image", id })).toBe(false);
    expect(isAttachmentRef(null)).toBe(false);
  });
});

describe("isFileBlock", () => {
  it("accepts pdf and text file blocks", () => {
    expect(
      isFileBlock({
        type: "file",
        mimeType: "application/pdf",
        data: "x",
        metadata: { filename: "a.pdf" },
      }),
    ).toBe(true);
    expect(
      isFileBlock({
        type: "file",
        mimeType: "text/plain",
        data: "x",
        metadata: { filename: "a.txt" },
      }),
    ).toBe(true);
  });

  it("rejects other mime types and other block types", () => {
    expect(
      isFileBlock({ type: "file", mimeType: "image/png", data: "x" }),
    ).toBe(false);
    expect(isFileBlock({ type: "image", mimeType: "text/plain" })).toBe(false);
  });
});

describe("toResendBlocks", () => {
  it("keeps typed text and reduces references to their id", () => {
    const content = [
      { type: "text", text: "what is this?" },
      { type: "attachment", id, kind: "image", name: "a.png", width: 3 },
      { type: "image", mimeType: "image/png", data: "zzz" },
    ];
    expect(toResendBlocks(content)).toEqual([
      { type: "text", text: "what is this?" },
      { type: "attachment", id },
    ]);
  });

  it("returns nothing for a plain string", () => {
    expect(toResendBlocks("hello")).toEqual([]);
  });

  it("leaves out the agent's not-shared notes", () => {
    const content = [
      { type: "text", text: "hi" },
      { type: "text", text: "[Not shared: a.docx isn't a supported file.]" },
    ];
    expect(toResendBlocks(content)).toEqual([{ type: "text", text: "hi" }]);
  });
});

describe("isTypedText", () => {
  it("is text the person typed, not a note the agent added", () => {
    expect(isTypedText({ type: "text", text: "hi" })).toBe(true);
    expect(isTypedText({ type: "text", text: "[Not shared: x]" })).toBe(false);
    expect(isTypedText({ type: "image", text: "hi" })).toBe(false);
  });
});

describe("formatBytes", () => {
  it("reads as bytes, KB or MB", () => {
    expect(formatBytes(12)).toBe("12 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1500)).toBe("1.5 KB");
    expect(formatBytes(1572864)).toBe("1.5 MB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
  });
});
