import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { AgentTokenSource, AuthStatus } from "@/lib/agent-token";
import { useAgentAuth } from "./use-agent-auth";

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a) },
}));

function fakeSource(initial: AuthStatus) {
  let status = initial;
  const listeners = new Set<() => void>();
  const source = {
    getToken: vi.fn().mockResolvedValue(null),
    refresh: vi.fn().mockResolvedValue(null),
    getStatus: () => status,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  } satisfies AgentTokenSource;
  const setStatus = (next: AuthStatus) => {
    status = next;
    listeners.forEach((l) => l());
  };
  return { source, setStatus };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useAgentAuth", () => {
  it("mints on mount and follows the source's status", async () => {
    const { source, setStatus } = fakeSource("unknown");
    const { result } = renderHook(() => useAgentAuth(source));
    expect(source.getToken).toHaveBeenCalledTimes(1);
    expect(result.current).toBe("unknown");
    act(() => setStatus("signed_in"));
    await waitFor(() => expect(result.current).toBe("signed_in"));
  });

  it("re-mints on focus only while signed out", () => {
    const { source, setStatus } = fakeSource("signed_out");
    renderHook(() => useAgentAuth(source));
    window.dispatchEvent(new Event("focus"));
    expect(source.refresh).toHaveBeenCalledTimes(1);

    act(() => setStatus("signed_in"));
    window.dispatchEvent(new Event("focus"));
    expect(source.refresh).toHaveBeenCalledTimes(1);
  });

  it("tells the user once when the page-load mint fails", async () => {
    const { source } = fakeSource("unknown");
    source.getToken.mockRejectedValue(
      new Error("Couldn't check your sign-in."),
    );
    toastError.mockClear();
    renderHook(() => useAgentAuth(source));
    expect(source.getToken).toHaveBeenCalledWith({ strict: true });
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't check your sign-in.",
        expect.anything(),
      ),
    );
  });
});
