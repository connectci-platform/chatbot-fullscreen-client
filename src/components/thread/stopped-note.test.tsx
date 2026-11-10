import { fireEvent, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import { StreamError } from "@langchain/langgraph-sdk/ui";
import { Thread } from "./index";

const question: Message = {
  id: "q-1",
  type: "human",
  content: [{ type: "text", text: "What is Anvil?" }],
};

const stream = vi.hoisted(() => ({
  messages: [] as unknown[],
  isLoading: false,
  error: undefined as unknown,
  stopped: false,
  submit: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => ({
    ...stream,
    values: { messages: stream.messages },
    interrupt: undefined,
    runStatus: null,
    turnstileFailed: false,
    challengedQuestion: () => null,
    resendWithToken: vi.fn(),
    failChallenge: vi.fn(),
  }),
}));
vi.mock("./history", () => ({ default: () => null }));
vi.mock("./artifact", () => ({
  useArtifact: () => [null, vi.fn()],
  useArtifactOpen: () => [false, vi.fn()],
  useArtifactContext: () => [{}, vi.fn()],
  ArtifactContent: () => null,
  ArtifactTitle: () => null,
}));
vi.mock("./registration-panel", () => ({ RegistrationPanel: () => null }));
vi.mock("./software-comparison-panel", () => ({
  SoftwareComparisonPanel: () => null,
}));
vi.mock("./xdmod-chart-panel", () => ({
  XdmodChartPanel: () => null,
  showChart: vi.fn(),
}));
vi.mock("./messages/answer-rating", () => ({ AnswerRating: () => null }));
vi.mock("@/hooks/use-agent-auth", () => ({
  useAuthStatus: () => "signed_out",
}));
vi.mock("@/hooks/useOfficeHours", () => ({ useOfficeHours: () => null }));
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => true }));

function renderThread() {
  return render(
    <NuqsTestingAdapter searchParams="?threadId=t-1">
      <Thread />
    </NuqsTestingAdapter>,
  );
}

const note = () => screen.queryByText("You stopped this answer.");

describe("the Stopped note", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    stream.messages = [question];
    stream.isLoading = false;
    stream.error = undefined;
    stream.stopped = false;
    stream.submit.mockClear();
    stream.stop.mockClear();
  });

  it("shows under a question stopped mid-answer, with both buttons", () => {
    stream.isLoading = true;
    const { rerender } = renderThread();
    expect(note()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(stream.stop).toHaveBeenCalledOnce();

    stream.isLoading = false;
    stream.stopped = true;
    rerender(
      <NuqsTestingAdapter searchParams="?threadId=t-1">
        <Thread />
      </NuqsTestingAdapter>,
    );
    expect(note()).toBeTruthy();
    expect(note()?.closest("[aria-live='polite']")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit question" })).toBeTruthy();
  });

  it("shows when the agent reports the run cancelled", () => {
    stream.error = new StreamError({ error: "cancelled", message: "" });
    renderThread();
    expect(note()).toBeTruthy();
  });

  it("keeps the answer text that had streamed above the note", () => {
    stream.stopped = true;
    stream.messages = [
      question,
      { id: "a-1", type: "ai", content: "Anvil is a supercomputer at" },
    ];
    renderThread();
    const partial = screen.getByText("Anvil is a supercomputer at");
    expect(
      partial.compareDocumentPosition(note()!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Retry sends the same question again", () => {
    stream.stopped = true;
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(stream.submit).toHaveBeenCalledOnce();
    const [values] = stream.submit.mock.calls[0];
    expect(values.messages.at(-1).content).toEqual([
      { type: "text", text: "What is Anvil?" },
    ]);
  });

  it("Edit question puts it in the message box and focuses it, unsent", () => {
    stream.stopped = true;
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: "Edit question" }));

    const box = screen.getByRole("textbox", { name: "Message" });
    expect(box).toHaveValue("What is Anvil?");
    expect(box).toHaveFocus();
    expect(stream.submit).not.toHaveBeenCalled();
  });

  it("Retry sends once on a double click", () => {
    stream.stopped = true;
    renderThread();
    const retry = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(stream.submit).toHaveBeenCalledOnce();
  });

  it("Edit question keeps a draft and adds the question after it", () => {
    stream.stopped = true;
    renderThread();
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "Also, Delta?" } });
    fireEvent.click(screen.getByRole("button", { name: "Edit question" }));

    expect(box).toHaveValue("Also, Delta?\nWhat is Anvil?");
    expect(box).toHaveFocus();
  });

  it("doesn't show under a completed answer", () => {
    stream.messages = [
      question,
      { id: "a-1", type: "ai", content: "Anvil is a supercomputer." },
    ];
    renderThread();
    expect(note()).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("doesn't show while the answer is coming", () => {
    stream.isLoading = true;
    renderThread();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows on a reloaded thread whose last question has no answer", () => {
    // No stop seen by this page: the thread came back from history.
    renderThread();
    expect(
      screen.getByText("This question didn't get an answer."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("leaves other failures to their own message", () => {
    stream.error = Object.assign(new Error("x"), { name: "TypeError" });
    renderThread();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("says a turn that just timed out didn't finish, and hides its sources line", () => {
    stream.error = Object.assign(new Error("x"), { name: "timeout" });
    stream.messages = [
      question,
      { id: "a-1", type: "ai", content: "Anvil is a supercomputer at" },
    ];
    renderThread();
    expect(screen.getByText("Anvil is a supercomputer at")).toBeTruthy();
    expect(screen.getByText("This answer didn't finish.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByText(/No documentation was retrieved/)).toBeNull();

    // Retry replaces the cut-off turn.
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    const [, options] = stream.submit.mock.calls[0];
    expect(options.context).toEqual({ replace_stopped_turn: true });
    expect(
      options.optimisticValues({ messages: stream.messages }).messages,
    ).toHaveLength(1);
  });

  const savedStop: Message = {
    id: "a-1",
    type: "ai",
    content: "Anvil is a",
    response_metadata: { stopped: true },
  };
  const later: Message = { id: "q-2", type: "human", content: "Delta?" };
  const laterAnswer: Message = { id: "a-2", type: "ai", content: "Delta is." };

  it("shows under an answer the agent saved as stopped, as after a reload", () => {
    stream.messages = [question, savedStop];
    renderThread();
    expect(screen.getByText("Anvil is a")).toBeTruthy();
    expect(note()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByText(/No documentation was retrieved/)).toBeNull();
  });

  it("keeps an earlier stopped turn's text and note after the next answer", () => {
    stream.messages = [question, savedStop, later, laterAnswer];
    renderThread();
    expect(screen.getByText("Anvil is a")).toBeTruthy();
    const kept = note()!;
    expect(
      screen.getByText("Anvil is a").compareDocumentPosition(kept) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      kept.compareDocumentPosition(screen.getByText("Delta?")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Only the latest unanswered turn can be asked again.
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows no empty answer for a stop before any text", () => {
    stream.messages = [question, { ...savedStop, content: "" }];
    const { container } = renderThread();
    expect(note()).toBeTruthy();
    expect(container.querySelectorAll("div.group.mr-auto")).toHaveLength(0);
  });

  it("Retry replaces the stopped turn instead of adding one", () => {
    stream.messages = [question, savedStop];
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    const [values, options] = stream.submit.mock.calls[0];
    expect(values.messages).toHaveLength(1);
    expect(options.context).toEqual({ replace_stopped_turn: true });
    const shown = options.optimisticValues({ messages: [question, savedStop] });
    expect(shown.messages).toHaveLength(1);
    expect(shown.messages[0].id).not.toBe("q-1");
  });

  it("sending an edited question replaces the stopped turn", () => {
    stream.messages = [question, savedStop];
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: "Edit question" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const [, options] = stream.submit.mock.calls[0];
    expect(options.context).toEqual({ replace_stopped_turn: true });
    expect(
      options.optimisticValues({ messages: [question, savedStop] }).messages,
    ).toHaveLength(1);
  });

  it("a new question keeps the stopped turn", () => {
    stream.messages = [question, savedStop];
    renderThread();
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "Delta?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const [, options] = stream.submit.mock.calls[0];
    expect(options.context).toBeUndefined();
    expect(
      options.optimisticValues({ messages: [question, savedStop] }).messages,
    ).toHaveLength(3);
  });

  it("moves focus from Cancel to Retry when the answer stops", () => {
    stream.isLoading = true;
    const { rerender } = renderThread();
    const cancel = screen.getByRole("button", { name: /cancel/i });
    cancel.focus();
    fireEvent.click(cancel);

    stream.isLoading = false;
    stream.stopped = true;
    rerender(
      <NuqsTestingAdapter searchParams="?threadId=t-1">
        <Thread />
      </NuqsTestingAdapter>,
    );
    expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus();
  });

  it("moves focus to the message box when a stop leaves no note", () => {
    stream.isLoading = true;
    const { rerender } = renderThread();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    // The answer was delivered before the stop reached the agent.
    stream.isLoading = false;
    stream.messages = [question, laterAnswer];
    rerender(
      <NuqsTestingAdapter searchParams="?threadId=t-1">
        <Thread />
      </NuqsTestingAdapter>,
    );
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
  });

  it("says a turn that timed out or failed didn't finish, with Retry", () => {
    for (const reason of ["timeout", "error"]) {
      stream.messages = [
        question,
        { ...savedStop, response_metadata: { stopped: true, reason } },
      ];
      const { unmount } = renderThread();
      expect(screen.getByText("This answer didn't finish.")).toBeTruthy();
      expect(note()).toBeNull();
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Edit question" }),
      ).toBeTruthy();
      expect(screen.queryByText(/No documentation was retrieved/)).toBeNull();
      unmount();
    }
  });

  it("keeps an earlier unfinished turn's note after the next answer", () => {
    stream.messages = [
      question,
      { ...savedStop, response_metadata: { stopped: true, reason: "error" } },
      later,
      laterAnswer,
    ];
    renderThread();
    expect(screen.getByText("This answer didn't finish.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
