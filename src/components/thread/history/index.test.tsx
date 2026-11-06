import { render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus } from "@/lib/agent-token";
import ThreadHistory from ".";

const auth: { status: AuthStatus } = { status: "unknown" };

vi.mock("@/hooks/use-agent-auth", () => ({
  useAuthStatus: () => auth.status,
}));

vi.mock("@/providers/Thread", () => ({
  useThreads: () => ({
    getThreads: () => Promise.resolve([]),
    threads: [],
    setThreads: vi.fn(),
    threadsLoading: false,
    setThreadsLoading: vi.fn(),
  }),
}));

function renderHistory(searchParams = "") {
  return render(
    <NuqsTestingAdapter searchParams={searchParams}>
      <ThreadHistory />
    </NuqsTestingAdapter>,
  );
}

describe("ThreadHistory", () => {
  beforeEach(() => {
    auth.status = "unknown";
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it("tells a signed-in person with no conversations there are none yet", () => {
    auth.status = "signed_in";
    renderHistory();
    expect(screen.getByText("No conversations yet.")).toBeTruthy();
    expect(
      screen.queryByText("Sign in to see and resume your conversations."),
    ).toBeNull();
  });

  it("asks a signed-out person to sign in", () => {
    auth.status = "signed_out";
    renderHistory();
    expect(
      screen.getByText("Sign in to see and resume your conversations."),
    ).toBeTruthy();
    expect(screen.queryByText("No conversations yet.")).toBeNull();
  });

  it("shows neither message while the sign-in state is unknown", () => {
    renderHistory();
    expect(screen.queryByText("No conversations yet.")).toBeNull();
    expect(
      screen.queryByText("Sign in to see and resume your conversations."),
    ).toBeNull();
  });

  it("names the toggle for what it will do", () => {
    const { unmount } = renderHistory();
    expect(
      screen.getByRole("button", { name: "Show conversations" }),
    ).toBeTruthy();
    unmount();
    renderHistory("?chatHistoryOpen=true");
    expect(
      screen.getByRole("button", { name: "Hide conversations" }),
    ).toBeTruthy();
  });
});
