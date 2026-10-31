import { describe, it, expect, vi, afterEach } from "vitest";
import type { AgentTokenSource, AuthStatus } from "./agent-token";
import { openSignIn } from "./sign-in";

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

describe("openSignIn", () => {
  it("opens support's login in a popup and re-mints when it closes", () => {
    vi.useFakeTimers();
    const popup = { closed: false };
    const open = vi
      .spyOn(window, "open")
      .mockReturnValue(popup as unknown as Window);
    const { source } = fakeSource("signed_out");

    openSignIn(source);
    expect(open).toHaveBeenCalledWith(
      "https://support.access-ci.org/user/login",
      "_blank",
      "popup,width=480,height=720",
    );
    vi.advanceTimersByTime(2000);
    expect(source.refresh).not.toHaveBeenCalled();

    popup.closed = true;
    vi.advanceTimersByTime(500);
    expect(source.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(source.refresh).toHaveBeenCalledTimes(1);
  });

  it("skips the re-mint when focus already signed the user in", () => {
    vi.useFakeTimers();
    const popup = { closed: false };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const { source, setStatus } = fakeSource("signed_out");

    openSignIn(source);
    setStatus("signed_in");
    popup.closed = true;
    vi.advanceTimersByTime(500);
    expect(source.refresh).not.toHaveBeenCalled();
  });

  it("falls back to a new tab when the popup is blocked", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    openSignIn(fakeSource("signed_out").source);
    expect(open).toHaveBeenLastCalledWith(
      "https://support.access-ci.org/user/login",
      "_blank",
    );
  });

  it("tells the user when the mint after sign-in fails", async () => {
    vi.useFakeTimers();
    const popup = { closed: false };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const { source } = fakeSource("signed_out");
    source.refresh.mockRejectedValue(new Error("Couldn't check your sign-in."));
    toastError.mockClear();

    openSignIn(source);
    popup.closed = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(toastError).toHaveBeenCalledWith(
      "Couldn't check your sign-in.",
      expect.anything(),
    );
  });
});
