import { describe, expect, it } from "vitest";
import { isRunStatusEvent } from "./run-status";

describe("isRunStatusEvent", () => {
  it("accepts a status event", () => {
    expect(
      isRunStatusEvent({ type: "status", message: "Searching software..." }),
    ).toBe(true);
  });

  it("rejects other custom events", () => {
    expect(isRunStatusEvent({ type: "requires_auth", reason: "x" })).toBe(
      false,
    );
    expect(isRunStatusEvent({ type: "status" })).toBe(false);
    expect(isRunStatusEvent({ type: "status", message: 42 })).toBe(false);
    expect(isRunStatusEvent(null)).toBe(false);
  });
});
