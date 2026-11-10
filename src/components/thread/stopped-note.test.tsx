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

  it("Edit question leaves the caret after the text, scrolled into the box", async () => {
    stream.stopped = true;
    renderThread();
    const box = screen.getByRole("textbox", {
      name: "Message",
    }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "x\n".repeat(40) } });
    box.setSelectionRange(0, 0);
    // jsdom has no layout: give the box a height to scroll through.
    Object.defineProperty(box, "scrollHeight", {
      configurable: true,
      value: 900,
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit question" }));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(box.selectionStart).toBe(box.value.length);
    expect(box.selectionEnd).toBe(box.value.length);
    expect(box.scrollTop).toBe(900);
    // A long question scrolls inside the box instead of growing the footer
    // past the view.
    expect(box).toHaveClass("max-h-[30dvh]", "overflow-y-auto");
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
    stream.error = Object.assign(new Error("x"), { name: "timeout" });
    renderThread();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
