import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWhoami } from "./use-whoami";

function mockWhoami(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  } as Response);
}

describe("useWhoami", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("reports authenticated + user when whoami says so", async () => {
    vi.stubGlobal(
      "fetch",
      mockWhoami({ authenticated: true, user: "apasquale1@access-ci.org" }),
    );
    const { result } = renderHook(() => useWhoami("https://x/api/v1"));
    await waitFor(() => expect(result.current.authenticated).toBe(true));
    expect(result.current.user).toBe("apasquale1@access-ci.org");
  });

  it("reports anonymous when whoami says so", async () => {
    vi.stubGlobal("fetch", mockWhoami({ authenticated: false, user: null }));
    const { result } = renderHook(() => useWhoami("https://x/api/v1"));
    await waitFor(() => expect(result.current.authenticated).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("fails open to anonymous on fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const { result } = renderHook(() => useWhoami("https://x/api/v1"));
    await waitFor(() => expect(result.current.authenticated).toBe(false));
  });

  it("fails open to anonymous on non-ok response", async () => {
    vi.stubGlobal("fetch", mockWhoami({}, false));
    const { result } = renderHook(() => useWhoami("https://x/api/v1"));
    await waitFor(() => expect(result.current.authenticated).toBe(false));
  });

  it("does not fetch when apiUrl is undefined", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useWhoami(undefined));
    await waitFor(() => expect(result.current.authenticated).toBe(false));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("re-checks whoami on window focus", async () => {
    const fetchSpy = mockWhoami({ authenticated: false, user: null });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useWhoami("https://x/api/v1"));
    await waitFor(() => expect(result.current.authenticated).toBe(false));
    const callsBefore = fetchSpy.mock.calls.length;
    // simulate login completing, then the user returning to the tab
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ authenticated: true, user: "u@access-ci.org" }),
    } as Response);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(result.current.authenticated).toBe(true));
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("removes the focus listener on unmount", async () => {
    const fetchSpy = mockWhoami({ authenticated: false, user: null });
    vi.stubGlobal("fetch", fetchSpy);
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useWhoami("https://x/api/v1"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("focus", expect.any(Function));
  });

  it("drops a stale out-of-order response (last-write-wins)", async () => {
    // Control resolution order independently of call order: capture each
    // call's resolver instead of letting the mock resolve immediately.
    const resolvers: Array<(body: unknown) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolvers.push((body: unknown) =>
              resolve({
                ok: true,
                json: () => Promise.resolve(body),
              } as Response),
            );
          }),
      ),
    );

    const { result } = renderHook(() => useWhoami("https://x/api/v1"));
    await waitFor(() => expect(resolvers.length).toBe(1)); // initial mount fetch

    // Establish a known authenticated baseline so the later race is
    // observable (flipping back to true would be a visible regression,
    // not a no-op against the initial anonymous default).
    act(() => {
      resolvers[0]({ authenticated: true, user: "baseline@access-ci.org" });
    });
    await waitFor(() => expect(result.current.authenticated).toBe(true));

    // Two rapid focus events (e.g. alt-tab away/back twice) launch two more
    // overlapping fetches: call A (older) and call B (newer).
    act(() => {
      window.dispatchEvent(new Event("focus")); // call A
    });
    await waitFor(() => expect(resolvers.length).toBe(2));
    act(() => {
      window.dispatchEvent(new Event("focus")); // call B
    });
    await waitFor(() => expect(resolvers.length).toBe(3));

    // Resolve the NEWER call (B) first with the real, current logged-out
    // state...
    act(() => {
      resolvers[2]({ authenticated: false, user: null });
    });
    await waitFor(() => expect(result.current.authenticated).toBe(false));

    // ...then resolve the OLDER call (A) with a stale logged-in state. If A
    // were applied last (the bug), the hook would flip back to
    // authenticated:true even though the session is actually gone.
    act(() => {
      resolvers[1]({ authenticated: true, user: "stale@access-ci.org" });
    });

    // Give any (incorrect) state update a chance to land, then assert the
    // stale response was dropped and the newer anonymous state still holds.
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.authenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });
});
