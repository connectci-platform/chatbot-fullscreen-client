import { describe, expect, it } from "vitest";
import { isUploadDroppedEvent, uploadDroppedMessage } from "./upload-dropped";

describe("upload_dropped", () => {
  const event = {
    type: "upload_dropped" as const,
    files: ["notes.docx isn't a supported file.", "scan.pdf couldn't be read."],
  };

  it("recognizes the agent's event", () => {
    expect(isUploadDroppedEvent(event)).toBe(true);
    expect(isUploadDroppedEvent({ type: "upload_dropped" })).toBe(false);
    expect(isUploadDroppedEvent({ type: "upload_dropped", files: [3] })).toBe(
      false,
    );
    expect(isUploadDroppedEvent({ type: "status", message: "x" })).toBe(false);
    expect(isUploadDroppedEvent(null)).toBe(false);
  });

  it("lists the sentences the agent sent", () => {
    expect(uploadDroppedMessage(event)).toBe(
      "notes.docx isn't a supported file. scan.pdf couldn't be read.",
    );
  });
});
