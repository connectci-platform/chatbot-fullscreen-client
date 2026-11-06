import { describe, it, expect } from "vitest";
import { runErrorMessage } from "./run-errors";

const err = (name: string, message = "") =>
  Object.assign(new Error(message), { name });

describe("runErrorMessage", () => {
  it("explains a timeout", () => {
    expect(runErrorMessage(err("timeout"))).toBe(
      "That took too long. Please try again.",
    );
  });

  it("uses the generic message for agent errors", () => {
    expect(runErrorMessage(err("agent_error"))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("does not expose the raw message", () => {
    expect(runErrorMessage(err("StreamError", "boom"))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("uses the generic message for non-Error values", () => {
    expect(runErrorMessage("boom")).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("shows nothing when the user cancelled", () => {
    expect(runErrorMessage(err("cancelled"))).toBeNull();
    expect(runErrorMessage(err("AbortError"))).toBeNull();
  });
});
