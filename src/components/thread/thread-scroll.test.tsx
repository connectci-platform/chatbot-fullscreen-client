import {
  act,
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
const artifact = vi.hoisted(() => ({ open: false }));
vi.mock("./artifact", () => ({
  useArtifact: () => [null, vi.fn()],
  useArtifactOpen: () => [artifact.open, vi.fn()],
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
const media = vi.hoisted(() => ({ large: true }));
vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => media.large,
}));

/** Stands in for the browser's IntersectionObserver, which jsdom lacks. */
const observers = new Set<{
  callback: IntersectionObserverCallback;
  targets: Set<Element>;
}>();
class FakeIntersectionObserver {
  private entry: {
    callback: IntersectionObserverCallback;
    targets: Set<Element>;
  };
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback, targets: new Set() };
    observers.add(this.entry);
  }
  observe(target: Element) {
    this.entry.targets.add(target);
  }
  unobserve(target: Element) {
    this.entry.targets.delete(target);
  }
  disconnect() {
    observers.delete(this.entry);
  }
  takeRecords() {
    return [];
  }
}
/** Some tests unstub globals, so each one that needs these stubs them. */
function stubObservers() {
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  // For the tooltips, which size themselves with it.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

/** Reports whether `target` is on screen to whatever observes it. */
function intersect(target: Element, isIntersecting: boolean) {
  act(() => {
    for (const { callback, targets } of observers) {
      if (!targets.has(target)) continue;
      callback(
        [{ target, isIntersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    }
  });
}

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

  it("grows the message box with the question where CSS can't (Firefox), and shrinks it after send", () => {
    vi.stubGlobal("CSS", { supports: () => false });
    const height = vi
      .spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get")
      .mockImplementation(function (this: HTMLTextAreaElement) {
        return this.value.split("\n").length * 24 + 20;
      });
    try {
      renderThread();
      const box = screen.getByRole("textbox", { name: "Message" });
      expect(box.style.height).toBe("44px");
      fireEvent.change(box, { target: { value: "One\nTwo\nThree" } });
      expect(box.style.height).toBe("92px");
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      expect(box).toHaveValue("");
      expect(box.style.height).toBe("44px");
    } finally {
      height.mockRestore();
      vi.unstubAllGlobals();
    }
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
      expect(scroller.firstElementChild).toContainElement(bar);
      expect(bar).toHaveClass("@min-[71rem]/pane:hidden");
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
    expect(screen.getByTestId("thread-top-bar-float")).toContainElement(wide);
  });
});

describe("Top bar placement", () => {
  beforeEach(() => {
    stream.messages = [
      question,
      { id: "a-1", type: "ai", content: "Anvil is a supercomputer." },
    ];
    stream.isLoading = false;
    stream.error = undefined;
    stream.stopped = false;
    artifact.open = false;
    media.large = true;
    stubObservers();
  });

  const pane = () =>
    screen
      .getByRole("textbox", { name: "Message" })
      .closest(".\\@container\\/pane")!;

  it.each([
    ["nothing else open", "?threadId=t-1", false],
    [
      "the Conversations sidebar open",
      "?threadId=t-1&chatHistoryOpen=true",
      false,
    ],
    ["the chart panel open", "?threadId=t-1", true],
    ["both open", "?threadId=t-1&chatHistoryOpen=true", true],
  ])(
    "floats the top bar by the conversation pane's own width, with %s",
    (_, searchParams, chartOpen) => {
      artifact.open = chartOpen;
      renderThread(searchParams);
      // The pane is the container: the sidebar and the chart panel narrow
      // it, so a wide screen with either open can still be too narrow.
      expect(pane()).toBeInTheDocument();
      const float = screen.getByTestId("thread-top-bar-float");
      const inline = screen.getByTestId("thread-top-bar");
      expect(pane()).toContainElement(float);
      expect(float).toHaveClass("hidden", "@min-[71rem]/pane:flex");
      expect(inline).toHaveClass("@min-[71rem]/pane:hidden");
      // Nothing about the top bar follows the screen's width any more.
      for (const bar of [float, inline]) {
        expect(bar.className).not.toMatch(/(^|\s)xl:/);
      }
    },
  );

  it("keeps the top bar's row in the scroller either way, so switching doesn't move the messages", () => {
    renderThread();
    const row = screen.getByTestId("thread-top-bar").parentElement!;
    expect(row).toHaveClass("h-15");
    expect(row.className).not.toMatch(/@/);
    const messages = screen.getByText("Anvil is a supercomputer.");
    const list = messages.closest(".max-w-3xl")!;
    // No top padding that differs between the two placements.
    expect(list.className).not.toMatch(/(xl|@[^ ]*):pt-/);
  });

  it("lets clicks through the floating bar except on its buttons", () => {
    renderThread();
    const float = screen.getByTestId("thread-top-bar-float");
    expect(float).toHaveClass("pointer-events-none");
    for (const button of within(float).getAllByRole("button")) {
      expect(button.closest(".pointer-events-auto")).not.toBeNull();
    }
  });
});

describe("Conversation buttons under the message box", () => {
  beforeEach(() => {
    stream.messages = [
      question,
      { id: "a-1", type: "ai", content: "Anvil is a supercomputer." },
    ];
    stream.isLoading = false;
    stream.error = undefined;
    stream.stopped = false;
    artifact.open = false;
    media.large = true;
    stubObservers();
  });

  const disclaimerLine = () =>
    screen
      .getByRole("link", { name: "Privacy Notice" })
      .closest(".\\@container\\/disclaimer") as HTMLElement;
  const shortcuts = () => screen.queryByTestId("conversation-shortcuts");

  /** The top bar scrolled away: neither copy of it is on screen. */
  function scrollTopBarAway() {
    intersect(screen.getByTestId("thread-top-bar"), false);
    intersect(screen.getByTestId("thread-top-bar-float"), false);
  }

  it("aren't there while the top bar is on screen", () => {
    renderThread();
    expect(shortcuts()).toBeNull();
    intersect(screen.getByTestId("thread-top-bar"), true);
    expect(shortcuts()).toBeNull();
  });

  it("appear at the left of the disclaimer once the top bar is out of view, and go when it's back", () => {
    renderThread();
    scrollTopBarAway();
    const group = shortcuts()!;
    expect(disclaimerLine()).toContainElement(group);
    expect(
      group.compareDocumentPosition(
        screen.getByRole("link", { name: "Privacy Notice" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(group).getByRole("button", { name: "Show conversations" }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("button", { name: "New chat" }),
    ).toBeInTheDocument();

    // Scrolled back up, or the pane widened so the bar floats.
    intersect(screen.getByTestId("thread-top-bar-float"), true);
    expect(shortcuts()).toBeNull();
  });

  it("are small icons with a tooltip, a visible focus ring and a 24px target that doesn't make the line taller", () => {
    renderThread();
    scrollTopBarAway();
    for (const button of within(shortcuts()!).getAllByRole("button")) {
      expect(button).toHaveTextContent(/^$/);
      // 24px, pulled into the line's 16px with negative margins.
      expect(button).toHaveClass("size-6", "-my-1", "focus-visible:ring-ring");
      expect(button).toHaveAttribute("data-slot", "tooltip-trigger");
    }
  });

  it("names its tooltips as the buttons are named", async () => {
    renderThread();
    scrollTopBarAway();
    const newChat = within(shortcuts()!).getByRole("button", {
      name: "New chat",
    });
    await userEvent.hover(newChat);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("New chat");
  });

  it("starts a new chat with focus in the message box, as the top bar's does", async () => {
    const onUrlUpdate = vi.fn();
    render(
      <NuqsTestingAdapter
        searchParams="?threadId=t-1"
        onUrlUpdate={onUrlUpdate}
      >
        <Thread />
      </NuqsTestingAdapter>,
    );
    scrollTopBarAway();
    fireEvent.click(
      within(shortcuts()!).getByRole("button", { name: "New chat" }),
    );
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(
      onUrlUpdate.mock.calls.at(-1)![0].searchParams.get("threadId"),
    ).toBeNull();
  });

  it("opens the sidebar on a wide screen, and steps aside for the sidebar's own buttons", async () => {
    render(
      <NuqsTestingAdapter
        searchParams="?threadId=t-1"
        hasMemory
      >
        <Thread />
      </NuqsTestingAdapter>,
    );
    scrollTopBarAway();
    const toggle = within(shortcuts()!).getByRole("button", {
      name: "Show conversations",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "conversations-sidebar");
    expect(toggle).toHaveAttribute("data-conversations-toggle");
    fireEvent.click(toggle);
    // The open sidebar has Hide and New chat, like the top bar's buttons.
    await waitFor(() => expect(shortcuts()).toBeNull());
  });

  it("opens the list as a dialog on a phone, and says it's open", async () => {
    media.large = false;
    renderThread();
    scrollTopBarAway();
    const toggle = within(shortcuts()!).getByRole("button", {
      name: "Show conversations",
    });
    expect(toggle).toHaveAttribute("aria-haspopup", "dialog");
    expect(toggle).not.toHaveAttribute("aria-controls");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(
        within(shortcuts()!).getByRole("button", {
          name: "Hide conversations",
        }),
      ).toHaveAttribute("aria-expanded", "true"),
    );
  });

  it("leaves New chat out on the empty screen, as its top bar does", () => {
    stream.messages = [];
    renderThread("");
    scrollTopBarAway();
    const group = shortcuts()!;
    expect(
      within(group).getByRole("button", { name: "Show conversations" }),
    ).toBeInTheDocument();
    expect(
      within(group).queryByRole("button", { name: "New chat" }),
    ).toBeNull();
  });

  it("hands focus to the top bar's button when they go away under it", () => {
    renderThread();
    // jsdom lays nothing out; the narrow bar is the one showing here.
    const topNewChat = within(screen.getByTestId("thread-top-bar")).getByRole(
      "button",
      { name: "New chat" },
    );
    vi.spyOn(topNewChat, "getClientRects").mockReturnValue([
      new DOMRect(0, 0, 116, 44),
    ] as unknown as DOMRectList);
    scrollTopBarAway();
    within(shortcuts()!).getByRole("button", { name: "New chat" }).focus();
    intersect(screen.getByTestId("thread-top-bar"), true);
    expect(shortcuts()).toBeNull();
    expect(topNewChat).toHaveFocus();
  });
});

describe("Message box recall", () => {
  beforeEach(() => {
    stream.messages = [
      question,
      { id: "a-1", type: "ai", content: "Anvil is a supercomputer." },
      {
        id: "q-2",
        type: "human",
        content: [{ type: "text", text: "And Delta?" }],
      },
      { id: "a-2", type: "ai", content: "Delta is at NCSA." },
    ];
    stream.isLoading = false;
    stream.error = undefined;
    stream.stopped = false;
    stream.submit.mockClear();
  });

  it("Up and Down walk through this conversation's questions, and Enter sends one again", async () => {
    renderThread();
    const box = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message",
    });
    // The hook acts once the browser has moved the caret, a task later.
    // jsdom doesn't move it, so this does, as for one-line text: Up to the
    // start, Down to the end.
    const press = async (key: string) => {
      fireEvent.keyDown(box, { key });
      const to = key === "ArrowUp" ? 0 : box.value.length;
      box.setSelectionRange(to, to);
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    };
    fireEvent.change(box, { target: { value: "draft" } });
    box.setSelectionRange(0, 0);

    await press("ArrowUp");
    expect(box).toHaveValue("And Delta?");
    await press("ArrowUp");
    expect(box).toHaveValue("What is Anvil?");
    await press("ArrowDown");
    await press("ArrowDown");
    expect(box).toHaveValue("draft");

    box.setSelectionRange(0, 0);
    await press("ArrowUp");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(stream.submit).toHaveBeenCalledOnce();
    const sent = stream.submit.mock.calls[0][0].messages.at(-1);
    expect(sent.content).toEqual([{ type: "text", text: "And Delta?" }]);
  });
});
