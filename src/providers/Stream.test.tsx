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
  messages: [] as unknown[],
  onStop: undefined as StopHandler | undefined,
  onThreadId: undefined as ((id: string) => void) | undefined,
  // What the app's onStop gave the SDK's mutate, in order.
  stopUpdates: [] as StopUpdate[],
}));

type StopUpdate = (prev: { messages?: unknown[] }) => { messages?: unknown[] };
type StopHandler = (args: { mutate: (update: StopUpdate) => void }) => void;

vi.mock("@langchain/langgraph-sdk/react", () => ({
  useStream: (options: {
    onCustomEvent: CustomEventHandler;
    onStop: StopHandler;
    onThreadId: (id: string) => void;
  }) => {
    sdk.onCustomEvent = options.onCustomEvent;
    sdk.onStop = options.onStop;
    sdk.onThreadId = options.onThreadId;
    return {
      isLoading: sdk.isLoading,
      messages: sdk.messages,
      error: sdk.error,
      submit: sdk.submit,
      stop: async () => {
        sdk.onStop?.({ mutate: (update) => sdk.stopUpdates.push(update) });
      },
    };
  },
}));
vi.mock("./Thread", () => ({
  useThreads: () => ({ getThreads: vi.fn(), setThreads: vi.fn() }),
}));
vi.mock("./client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/time-zone", () => ({
  viewerTimeZone: () => "America/Chicago",
}));
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
  const optimisticValues = (prev: { messages?: unknown[] }) => ({
    ...prev,
    messages: [...(prev.messages ?? []), ...values.messages],
  });

  beforeEach(() => {
    sdk.isLoading = false;
    sdk.error = undefined;
    sdk.authStatus = "signed_out";
    sdk.submit.mockClear();
  });

  type Hook = ReturnType<typeof setup>;

  const ask = ({ result }: Hook, sent: unknown = values) =>
    act(() => {
      void result.current.submit(
        sent as never,
        {
          streamMode: ["values"],
          optimisticValues,
        } as never,
      );
    });

  /** The agent's answer to whatever was just sent: another challenge. */
  const challenged = ({ rerender }: Hook, siteKey = "site-key") => {
    sdk.isLoading = true;
    sdk.error = undefined;
    rerender();
    sdk.isLoading = false;
    sdk.error = new TurnstileChallenge(siteKey);
    rerender();
    sdk.submit.mockClear();
  };

  const askAndChallenge = (hook: Hook) => {
    ask(hook);
    challenged(hook);
  };

  it("passes a submit through to the SDK", () => {
    const hook = setup();
    ask(hook);
    expect(sdk.submit).toHaveBeenCalledWith(
      values,
      expect.objectContaining({ optimisticValues }),
    );
  });

  it("sends the reader's time zone with the question", () => {
    const hook = setup();
    ask(hook);

    expect(sdk.submit.mock.calls[0][1].context).toEqual({
      time_zone: "America/Chicago",
    });
  });

  it("sends the same question again with the token in context", () => {
    const hook = setup();
    askAndChallenge(hook);

    act(() => hook.result.current.resendWithToken("tok"));

    expect(sdk.submit).toHaveBeenCalledOnce();
    const [sent, options] = sdk.submit.mock.calls[0];
    expect(sent).toBe(values);
    expect(options.streamMode).toEqual(["values"]);
    expect(options.context).toEqual({
      time_zone: "America/Chicago",
      turnstile_token: "tok",
    });
  });

  it("keeps the question on screen once, not twice", () => {
    const hook = setup();
    askAndChallenge(hook);

    act(() => hook.result.current.resendWithToken("tok"));

    expect(sdk.submit.mock.calls[0][1].optimisticValues).toBeUndefined();
  });

  it("does nothing when no question was sent", () => {
    const { result } = setup();
    act(() => result.current.resendWithToken("tok"));
    expect(sdk.submit).not.toHaveBeenCalled();
  });

  it("does nothing without a challenge to answer", () => {
    const hook = setup();
    ask(hook);
    sdk.submit.mockClear();
    act(() => hook.result.current.resendWithToken("tok"));
    expect(sdk.submit).not.toHaveBeenCalled();
  });

  it("answers one challenge once, however many ways it passes", () => {
    const hook = setup();
    askAndChallenge(hook);

    act(() => hook.result.current.resendWithToken("tok"));
    act(() => hook.result.current.resendWithToken("tok-2"));
    sdk.authStatus = "signed_in";
    hook.rerender();

    expect(sdk.submit).toHaveBeenCalledOnce();
  });

  it("resends without a token after the person signs in", () => {
    const hook = setup();
    askAndChallenge(hook);

    sdk.authStatus = "signed_in";
    hook.rerender();

    expect(sdk.submit).toHaveBeenCalledOnce();
    const [sent, options] = sdk.submit.mock.calls[0];
    expect(sent).toBe(values);
    expect(options.context?.turnstile_token).toBeUndefined();
  });

  describe("a failed check", () => {
    it("isn't failed on the first challenge", () => {
      const hook = setup();
      askAndChallenge(hook);
      expect(hook.result.current.turnstileFailed).toBe(false);
    });

    it("fails, and sends nothing, when a challenge follows a token", () => {
      const hook = setup();
      askAndChallenge(hook);
      act(() => hook.result.current.resendWithToken("tok"));

      challenged(hook);

      expect(hook.result.current.turnstileFailed).toBe(true);
      expect(sdk.submit).not.toHaveBeenCalled();
    });

    it("refuses a further token for that question", () => {
      const hook = setup();
      askAndChallenge(hook);
      act(() => hook.result.current.resendWithToken("tok"));
      challenged(hook);

      act(() => hook.result.current.resendWithToken("tok-2"));

      expect(sdk.submit).not.toHaveBeenCalled();
    });

    it("fails when the widget reports it couldn't run", () => {
      const hook = setup();
      askAndChallenge(hook);
      act(() => hook.result.current.failChallenge());
      expect(hook.result.current.turnstileFailed).toBe(true);
    });

    it("fails when the agent sent no site key", () => {
      const hook = setup();
      ask(hook);
      challenged(hook, "");
      expect(hook.result.current.turnstileFailed).toBe(true);
    });

    it("hands back the question it couldn't send", () => {
      const hook = setup();
      askAndChallenge(hook);
      expect(hook.result.current.challengedQuestion()).toBe(values.messages[0]);
    });

    it("stays failed until the next run has started", () => {
      const hook = setup();
      askAndChallenge(hook);
      act(() => hook.result.current.failChallenge());

      ask(hook);

      // The old challenge is still set here. Clearing now would mount a widget.
      expect(hook.result.current.turnstileFailed).toBe(true);
    });

    it("gets a fresh check when the person sends again", () => {
      const hook = setup();
      askAndChallenge(hook);
      act(() => hook.result.current.resendWithToken("tok"));
      challenged(hook);

      ask(hook);
      challenged(hook);

      expect(hook.result.current.turnstileFailed).toBe(false);
    });

    it("replaces the failed question's bubble when it's sent again", () => {
      const hook = setup();
      askAndChallenge(hook);
      act(() => hook.result.current.failChallenge());
      const next = { messages: [{ id: "m2", type: "human", content: "hi" }] };

      act(() => {
        void hook.result.current.submit(
          next as never,
          {
            optimisticValues: (prev: { messages?: unknown[] }) => ({
              ...prev,
              messages: [...(prev.messages ?? []), ...next.messages],
            }),
          } as never,
        );
      });

      const options = sdk.submit.mock.calls[0][1];
      const shown = options.optimisticValues({
        messages: [{ id: "m0" }, values.messages[0]],
      });
      expect(shown.messages.map((m: { id: string }) => m.id)).toEqual([
        "m0",
        "m2",
      ]);
    });

    it("leaves a plain submit's optimistic values alone", () => {
      const hook = setup();
      ask(hook);
      expect(sdk.submit.mock.calls[0][1].optimisticValues).toBe(
        optimisticValues,
      );
    });
  });
});

describe("stopping a run", () => {
  const question = { id: "h-1", type: "human", content: "Anvil?" };
  const saved = { id: "srv-1", type: "human", content: "Anvil?" };
  const partial = { id: "a-1", type: "ai", content: "Anvil is" };

  beforeEach(() => {
    sdk.isLoading = true;
    sdk.error = undefined;
    sdk.messages = [question, partial];
    sdk.stopUpdates = [];
  });

  // The SDK applies each update on the screen at the stop, then again on the
  // thread as the agent saved it.
  const stopWith = async (
    result: ReturnType<typeof setup>["result"],
    head: unknown[],
  ) => {
    await act(() => result.current.stop());
    const [update] = sdk.stopUpdates;
    let next: { messages?: unknown[] } = {};
    act(() => {
      expect(update({ messages: sdk.messages })).toEqual({});
      next = update({ messages: head });
    });
    return next;
  };

  it("marks the turn stopped and keeps the streamed text", async () => {
    const { result } = setup();
    const next = await stopWith(result, [saved]);
    expect(result.current.stopped).toBe(true);
    expect(next.messages).toEqual([saved, { ...partial, tool_calls: [] }]);
  });

  it("isn't stopped when the agent had saved the answer", async () => {
    const { result } = setup();
    const reply = { id: "a-1", type: "ai", content: "Anvil is big." };
    const next = await stopWith(result, [saved, reply]);
    expect(next).toEqual({});
    expect(result.current.stopped).toBe(false);
  });

  it("clears when the next run starts", async () => {
    const { result, rerender } = setup();
    await stopWith(result, [saved]);
    sdk.isLoading = false;
    rerender();
    expect(result.current.stopped).toBe(true);
    sdk.isLoading = true;
    rerender();
    expect(result.current.stopped).toBe(false);
  });

  it("isn't stopped by a Cancel that lands after the run finished", async () => {
    sdk.isLoading = false;
    const { result } = setup();
    await act(() => result.current.stop());
    expect(result.current.stopped).toBe(false);
    expect(sdk.stopUpdates).toEqual([]);
  });

  it("uses the stop handler once", async () => {
    const { result } = setup();
    await stopWith(result, [saved]);
    sdk.onStop?.({ mutate: (update) => sdk.stopUpdates.push(update) });
    expect(sdk.stopUpdates).toHaveLength(1);
  });

  it("clears when another conversation opens", async () => {
    const { result } = setup();
    await stopWith(result, [saved]);
    expect(result.current.stopped).toBe(true);
    act(() => sdk.onThreadId?.("t-2"));
    expect(result.current.stopped).toBe(false);
  });
});
