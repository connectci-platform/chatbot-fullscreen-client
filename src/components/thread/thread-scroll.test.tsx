import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    spacerRef: { current: null },
    footerRef: { current: null },
  }),
}));
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => true }));

function renderThread(searchParams = "?threadId=t-1") {
  return render(
    <NuqsTestingAdapter searchParams={searchParams}>
      <Thread />
    </NuqsTestingAdapter>,
  );
}

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
    expect(chatScroll.scrollToQuestion).toHaveBeenCalledOnce();
    expect(
      chatScroll.scrollToQuestion.mock.invocationCallOrder[0],
    ).toBeLessThan(stream.submit.mock.invocationCallOrder[0]);
    expect(chatScroll.scrollToBottom).not.toHaveBeenCalled();
  });

  it("scrolls a retried question to the top too", () => {
    stream.messages = [question];
    stream.stopped = true;
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(chatScroll.scrollToQuestion).toHaveBeenCalledOnce();
    expect(
      chatScroll.scrollToQuestion.mock.invocationCallOrder[0],
    ).toBeLessThan(stream.submit.mock.invocationCallOrder[0]);
  });

  it("floats a small round Scroll to bottom just above the message box, at its right edge", () => {
    renderThread();
    const button = screen.getByRole("button", { name: "Scroll to bottom" });
    // Out of the flow, so it takes no band of its own; 44px and round.
    expect(button).toHaveClass(
      "absolute",
      "bottom-full",
      "right-0",
      "size-11",
      "rounded-full",
    );
    expect(button).toHaveTextContent(/^$/);
    expect(
      button.compareDocumentPosition(
        screen.getByRole("textbox", { name: "Message" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(chatScroll.scrollToBottom).toHaveBeenCalledOnce();
    // The button goes away at the end, so focus moves to the message box.
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
  });

  it.each(["{Enter}", " "])("works from the keyboard with %s", async (key) => {
    renderThread();
    const button = screen.getByRole("button", { name: "Scroll to bottom" });
    button.focus();
    await userEvent.keyboard(key);
    expect(chatScroll.scrollToBottom).toHaveBeenCalledOnce();
  });

  it("moves focus to the message box without cancelling the smooth scroll", () => {
    // The message box is inside the scroller, so a focus() that scrolls it
    // into view stops the smooth scroll to the bottom where it started.
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: "Scroll to bottom" }));

    const box = screen.getByRole("textbox", { name: "Message" });
    const boxFocus = focus.mock.calls.filter(
      (_, i) => focus.mock.contexts[i] === box,
    );
    expect(boxFocus).not.toHaveLength(0);
    for (const args of boxFocus) {
      expect(args[0]).toEqual({ preventScroll: true });
    }
    focus.mockRestore();
  });

  it("shows no Scroll to bottom at the end of the conversation", () => {
    chatScroll.isAtBottom = true;
    renderThread();
    expect(
      screen.queryByRole("button", { name: "Scroll to bottom" }),
    ).toBeNull();
  });

  it("starts the message box one line tall, with Send inside it as an icon", () => {
    renderThread();
    const box = screen.getByRole("textbox", { name: "Message" });
    expect(box).toHaveAttribute("rows", "1");
    expect(box).toHaveClass("field-sizing-content", "max-h-[30dvh]");
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toHaveClass("size-11");
    expect(send).toHaveTextContent(/^$/);
    // On the box's own row, not a row of its own under it.
    expect(send.parentElement).toBe(box.parentElement);
  });

  it("puts Cancel where Send was while the answer comes", () => {
    stream.isLoading = true;
    renderThread();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const box = screen.getByRole("textbox", { name: "Message" });
    expect(cancel).toHaveClass("size-11");
    expect(cancel.parentElement).toBe(box.parentElement);
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("pads the message list at least as tall as the fade above the band", () => {
    renderThread();
    const list = screen.getByText("What is Anvil?").closest(".max-w-3xl");
    expect(list).toHaveClass("pb-6");
  });
});

describe("Thread layout", () => {
  beforeEach(() => {
    stream.messages = [
      question,
      { id: "a-1", type: "ai", content: "Anvil is a supercomputer." },
    ];
    stream.isLoading = false;
    stream.error = undefined;
    stream.stopped = false;
  });

  it.each([
    ["a conversation", "?threadId=t-1"],
    ["the empty screen", ""],
  ])(
    "on a narrow screen, puts %s's top bar at the top of the scrolling content, with no background",
    (_, searchParams) => {
      if (!searchParams) stream.messages = [];
      renderThread(searchParams);
      const bar = screen.getByTestId("thread-top-bar");
      const scroller = screen
        .getByRole("textbox", { name: "Message" })
        .closest(".overflow-y-scroll")!;
      // Scrolls away with the messages instead of holding a row of its own.
      expect(scroller.firstElementChild).toBe(bar);
      expect(bar).toHaveClass("xl:hidden");
      expect(bar.className).not.toMatch(/\bbg-/);
      expect(bar.className).not.toMatch(/\b(sticky|absolute|fixed)\b/);
      expect(
        within(bar).getByRole("button", { name: "Show conversations" }),
      ).toBeInTheDocument();
      expect(
        within(bar).queryAllByRole("button", { name: "New chat" }),
      ).toHaveLength(searchParams ? 1 : 0);
    },
  );

  it("pins the message box under a conversation, but not on the empty screen", () => {
    const { unmount } = renderThread();
    const footer = () =>
      screen
        .getByRole("textbox", { name: "Message" })
        .closest(".bg-white.flex-col");
    expect(footer()).toHaveClass("sticky");
    unmount();
    stream.messages = [];
    renderThread("");
    expect(footer()).not.toHaveClass("sticky");
  });

  it("puts a labeled New chat in a conversation's top bar, which starts a new one in the message box", async () => {
    const onUrlUpdate = vi.fn();
    render(
      <NuqsTestingAdapter
        searchParams="?threadId=t-1"
        onUrlUpdate={onUrlUpdate}
      >
        <Thread />
      </NuqsTestingAdapter>,
    );
    const bar = screen.getByTestId("thread-top-bar");
    const newChat = within(bar).getByRole("button", { name: "New chat" });
    expect(newChat).toHaveTextContent("New chat");
    fireEvent.click(newChat);
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(
      onUrlUpdate.mock.calls.at(-1)![0].searchParams.get("threadId"),
    ).toBeNull();
  });

  it("leaves New chat out of the empty screen's top bar", () => {
    stream.messages = [];
    renderThread("");
    expect(
      within(screen.getByTestId("thread-top-bar")).queryByRole("button", {
        name: "New chat",
      }),
    ).toBeNull();
  });

  it("labels the wide screens' toggle and leaves the narrow screens' an icon", () => {
    renderThread();
    const narrow = within(screen.getByTestId("thread-top-bar")).getByRole(
      "button",
      { name: "Show conversations" },
    );
    expect(narrow).toHaveTextContent(/^$/);
    const toggles = screen.getAllByRole("button", {
      name: "Show conversations",
    });
    const wide = toggles.find((t) => t !== narrow)!;
    expect(wide).toHaveTextContent("Conversations");
    expect(wide.closest(".xl\\:flex")).not.toBeNull();
  });
});
