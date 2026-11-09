import { fireEvent, render, screen, within } from "@testing-library/react";
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
const chatScroll = vi.hoisted(() => ({
  isAtBottom: false,
  scrollToQuestion: vi.fn(),
  scrollToBottom: vi.fn(),
}));
vi.mock("@/hooks/use-chat-scroll", () => ({
  useChatScroll: () => ({
    ...chatScroll,
    scrollRef: { current: null },
    contentRef: { current: null },
  }),
}));
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => true }));

function renderThread() {
  return render(
    <NuqsTestingAdapter searchParams="?threadId=t-1">
      <Thread />
    </NuqsTestingAdapter>,
  );
}

/** The id of the question the last submit sent. */
const sentId = () => stream.submit.mock.calls.at(-1)![0].messages.at(-1).id;

describe("Thread scrolling", () => {
  beforeEach(() => {
    stream.messages = [
      question,
      { id: "a-1", type: "ai", content: "Anvil is a supercomputer." },
    ];
    stream.isLoading = false;
    stream.error = undefined;
    stream.stopped = false;
    stream.submit.mockClear();
    chatScroll.isAtBottom = false;
    chatScroll.scrollToQuestion.mockClear();
    chatScroll.scrollToBottom.mockClear();
  });

  it("scrolls a typed follow-up to the top, not to the bottom", () => {
    renderThread();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "And Delta?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(stream.submit).toHaveBeenCalledOnce();
    expect(chatScroll.scrollToQuestion).toHaveBeenCalledExactlyOnceWith(
      sentId(),
    );
    expect(chatScroll.scrollToBottom).not.toHaveBeenCalled();
  });

  it("scrolls a retried question to the top too", () => {
    stream.messages = [question];
    stream.stopped = true;
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(chatScroll.scrollToQuestion).toHaveBeenCalledExactlyOnceWith(
      sentId(),
    );
  });

  it("puts Scroll to bottom in its own band above the message box", () => {
    renderThread();
    const slot = screen.getByTestId("scroll-to-bottom-slot");
    const button = within(slot).getByRole("button", {
      name: "Scroll to bottom",
    });
    // Not floating over the messages: a band in the footer's flow, taller
    // (h-12, 48px) than the button (h-9, 36px), directly above the box.
    expect(slot).not.toHaveClass("absolute");
    expect(slot).toHaveClass("h-12");
    expect(button).toHaveClass("h-9");
    expect(
      slot.compareDocumentPosition(
        screen.getByRole("textbox", { name: "Message" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(chatScroll.scrollToBottom).toHaveBeenCalledOnce();
  });

  it("keeps the band's space when the button is hidden at the end", () => {
    chatScroll.isAtBottom = true;
    renderThread();
    expect(screen.getByTestId("scroll-to-bottom-slot")).toHaveClass("h-12");
    expect(
      screen.queryByRole("button", { name: "Scroll to bottom" }),
    ).toBeNull();
  });

  it("pads the message list at least as tall as the fade above the band", () => {
    renderThread();
    const list = screen.getByText("What is Anvil?").closest(".max-w-3xl");
    expect(list).toHaveClass("pb-6");
  });
});
