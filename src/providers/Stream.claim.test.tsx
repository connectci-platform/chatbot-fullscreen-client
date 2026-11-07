import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import type { AuthStatus } from "@/lib/agent-token";
import { StreamProvider } from "./Stream";

const state = vi.hoisted(() => ({
  auth: "unknown" as AuthStatus,
  isLoading: false,
  claimThread: vi.fn(),
  getThreads: vi.fn(),
  setThreads: vi.fn(),
}));

vi.mock("@langchain/langgraph-sdk/react", () => ({
  useStream: () => ({
    isLoading: state.isLoading,
    messages: [],
    error: undefined,
  }),
}));
vi.mock("./Thread", () => ({
  useThreads: () => ({
    getThreads: state.getThreads,
    setThreads: state.setThreads,
  }),
}));
vi.mock("./client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/use-agent-auth", () => ({
  useAuthStatus: () => state.auth,
}));
vi.mock("@/lib/thread-claim", () => ({ claimThread: state.claimThread }));

function setup(searchParams: string) {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://agent.test/api/v1");
  vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ID", "agent");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 200 })),
  );
  const Nuqs = withNuqsTestingAdapter({ searchParams });
  const tree = () => (
    <Nuqs>
      <StreamProvider>
        <div />
      </StreamProvider>
    </Nuqs>
  );
  const view = render(tree());
  return { rerender: () => act(() => view.rerender(tree())) };
}

describe("claiming the open conversation on sign-in", () => {
  beforeEach(() => {
    state.auth = "signed_out";
    state.isLoading = false;
    state.claimThread.mockReset().mockResolvedValue(true);
    state.getThreads.mockReset().mockResolvedValue([{ thread_id: "t1" }]);
    state.setThreads.mockReset();
  });

  it("claims the open thread, then refreshes the sidebar", async () => {
    const { rerender } = setup("?threadId=t1");
    expect(state.claimThread).not.toHaveBeenCalled();

    state.auth = "signed_in";
    rerender();

    await waitFor(() =>
      expect(state.setThreads).toHaveBeenCalledWith([{ thread_id: "t1" }]),
    );
    expect(state.claimThread).toHaveBeenCalledTimes(1);
    expect(state.claimThread).toHaveBeenCalledWith(
      "http://agent.test/api/v1",
      "t1",
    );
  });

  it("waits for a run in progress so its turn is linked too", async () => {
    state.isLoading = true;
    const { rerender } = setup("?threadId=t1");
    state.auth = "signed_in";
    rerender();
    expect(state.claimThread).not.toHaveBeenCalled();

    state.isLoading = false;
    rerender();

    await waitFor(() => expect(state.claimThread).toHaveBeenCalledTimes(1));
  });

  it("claims after a reload that lands signed in", async () => {
    state.auth = "unknown";
    const { rerender } = setup("?threadId=t1");
    state.auth = "signed_in";
    rerender();

    await waitFor(() => expect(state.claimThread).toHaveBeenCalledTimes(1));
  });

  it("does nothing when no conversation is open", () => {
    const { rerender } = setup("");
    state.auth = "signed_in";
    rerender();

    expect(state.claimThread).not.toHaveBeenCalled();
  });

  it("leaves the sidebar alone when the claim is refused", async () => {
    state.claimThread.mockResolvedValue(false);
    const { rerender } = setup("?threadId=t1");
    state.auth = "signed_in";
    rerender();

    await waitFor(() => expect(state.claimThread).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(state.getThreads).not.toHaveBeenCalled();
  });

  it("claims only once while signed in", async () => {
    const { rerender } = setup("?threadId=t1");
    state.auth = "signed_in";
    rerender();
    rerender();

    await waitFor(() => expect(state.claimThread).toHaveBeenCalledTimes(1));
  });
});
