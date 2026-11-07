import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { StreamProvider, useStreamContext } from "./Stream";

type CustomEventHandler = (event: unknown, options: unknown) => void;

const sdk = vi.hoisted(() => ({
  isLoading: true,
  onCustomEvent: undefined as CustomEventHandler | undefined,
}));

vi.mock("@langchain/langgraph-sdk/react", () => ({
  useStream: (options: { onCustomEvent: CustomEventHandler }) => {
    sdk.onCustomEvent = options.onCustomEvent;
    return { isLoading: sdk.isLoading, messages: [], error: undefined };
  },
}));
vi.mock("./Thread", () => ({
  useThreads: () => ({ getThreads: vi.fn(), setThreads: vi.fn() }),
}));
vi.mock("./client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/use-agent-auth", () => ({
  useAuthStatus: () => "signed_out",
}));

function setup() {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://agent.test/api/v1");
  vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ID", "agent");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 200 })),
  );
  const Nuqs = withNuqsTestingAdapter({ searchParams: "" });
  return renderHook(() => useStreamContext(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Nuqs>
        <StreamProvider>{children}</StreamProvider>
      </Nuqs>
    ),
  });
}

const send = (event: unknown) =>
  act(() => sdk.onCustomEvent?.(event, { mutate: vi.fn() }));

describe("run status", () => {
  beforeEach(() => {
    sdk.isLoading = true;
  });

  it("exposes the latest status event", () => {
    const { result } = setup();
    send({ type: "status", message: "Searching software..." });
    expect(result.current.runStatus?.message).toBe("Searching software...");
  });

  it("gives a repeated status a new identity so effects see it", () => {
    const { result } = setup();
    send({ type: "status", message: "Searching software..." });
    const first = result.current.runStatus;
    send({ type: "status", message: "Searching software..." });
    expect(result.current.runStatus).not.toBe(first);
  });

  it("ignores a status with no usable message", () => {
    const { result } = setup();
    send({ type: "status", message: 42 });
    expect(result.current.runStatus).toBeNull();
  });

  it("clears when the run ends", () => {
    const { result, rerender } = setup();
    send({ type: "status", message: "Searching software..." });
    sdk.isLoading = false;
    rerender();
    expect(result.current.runStatus).toBeNull();
  });
});
