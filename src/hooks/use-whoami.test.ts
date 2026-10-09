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
});
