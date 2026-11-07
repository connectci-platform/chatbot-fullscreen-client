import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { TurnstileChallenge } from "@/lib/run-errors";
import { StreamProvider, useStreamContext } from "./Stream";

type CustomEventHandler = (event: unknown, options: unknown) => void;

const sdk = vi.hoisted(() => ({
  isLoading: true,
  onCustomEvent: undefined as CustomEventHandler | undefined,
  error: undefined as unknown,
  submit: vi.fn(),
  authStatus: "signed_out",
}));

vi.mock("@langchain/langgraph-sdk/react", () => ({
  useStream: (options: { onCustomEvent: CustomEventHandler }) => {
    sdk.onCustomEvent = options.onCustomEvent;
    return {
      isLoading: sdk.isLoading,
      messages: [],
      error: sdk.error,
      submit: sdk.submit,
    };
  },
}));
vi.mock("./Thread", () => ({
  useThreads: () => ({ getThreads: vi.fn(), setThreads: vi.fn() }),
}));
vi.mock("./client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/use-agent-auth", () => ({
  useAuthStatus: () => sdk.authStatus,
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

describe("resending a challenged question", () => {
  const values = { messages: [{ id: "m1", type: "human", content: "hi" }] };
  const optimisticValues = (prev: object) => ({ ...prev, messages: [] });

  beforeEach(() => {
    sdk.isLoading = false;
    sdk.error = undefined;
    sdk.authStatus = "signed_out";
    sdk.submit.mockClear();
  });

  const ask = (result: { current: ReturnType<typeof useStreamContext> }) =>
    act(() => {
      void result.current.submit(
        values as never,
        {
          streamMode: ["values"],
          optimisticValues,
        } as never,
      );
    });

  it("passes a submit through to the SDK", () => {
    const { result } = setup();
    ask(result);
    expect(sdk.submit).toHaveBeenCalledWith(
      values,
      expect.objectContaining({ optimisticValues }),
    );
  });

  it("sends the same question again with the token in context", () => {
    const { result } = setup();
    ask(result);
    sdk.submit.mockClear();

    act(() => result.current.resendWithToken("tok"));

    expect(sdk.submit).toHaveBeenCalledOnce();
    const [sent, options] = sdk.submit.mock.calls[0];
    expect(sent).toBe(values);
    expect(options.streamMode).toEqual(["values"]);
    expect(options.context).toEqual({ turnstile_token: "tok" });
  });

  it("keeps the question on screen once, not twice", () => {
    const { result } = setup();
    ask(result);
    sdk.submit.mockClear();

    act(() => result.current.resendWithToken("tok"));

    expect(sdk.submit.mock.calls[0][1].optimisticValues).toBeUndefined();
  });

  it("does nothing when no question was sent", () => {
    const { result } = setup();
    act(() => result.current.resendWithToken("tok"));
    expect(sdk.submit).not.toHaveBeenCalled();
  });

  it("resends without a token after the person signs in", () => {
    const { result, rerender } = setup();
    ask(result);
    sdk.submit.mockClear();
    sdk.error = new TurnstileChallenge("site-key");
    rerender();

    sdk.authStatus = "signed_in";
    rerender();

    expect(sdk.submit).toHaveBeenCalledOnce();
    const [sent, options] = sdk.submit.mock.calls[0];
    expect(sent).toBe(values);
    expect(options.context?.turnstile_token).toBeUndefined();
  });
});
