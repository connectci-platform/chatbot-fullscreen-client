import { describe, it, expect, vi, beforeEach } from "vitest";

const info = vi.fn();
vi.mock("sonner", () => ({ toast: { info: (...a: unknown[]) => info(...a) } }));
const openSignIn = vi.fn();
vi.mock("./sign-in", () => ({ openSignIn: () => openSignIn() }));

import { isRequiresAuthEvent, showRequiresAuth } from "./requires-auth";

describe("requires_auth events", () => {
  beforeEach(() => {
    info.mockClear();
    openSignIn.mockClear();
  });

  it("recognizes only requires_auth custom events", () => {
    expect(
      isRequiresAuthEvent({ type: "requires_auth", reason: "write_action" }),
    ).toBe(true);
    expect(isRequiresAuthEvent({ type: "ui", id: "x" })).toBe(false);
    expect(isRequiresAuthEvent(null)).toBe(false);
    expect(isRequiresAuthEvent("requires_auth")).toBe(false);
  });

  it.each(["write_action", "private_data"] as const)(
    "offers sign-in for %s",
    (reason) => {
      showRequiresAuth({ type: "requires_auth", reason });
      expect(info).toHaveBeenCalledWith(
        "Sign in to continue",
        expect.anything(),
      );
      const { action } = info.mock.calls[0][1];
      action.onClick();
      expect(openSignIn).toHaveBeenCalledTimes(1);
    },
  );

  it("says changes aren't available for write_scope, without a sign-in", () => {
    showRequiresAuth({ type: "requires_auth", reason: "write_scope" });
    expect(info).toHaveBeenCalledWith(
      "Changes aren't available here.",
      expect.not.objectContaining({ action: expect.anything() }),
    );
  });
});
