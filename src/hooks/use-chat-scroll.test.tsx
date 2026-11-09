import { useLayoutEffect } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUESTION_TOP_OFFSET_PX, useChatScroll } from "./use-chat-scroll";

// jsdom has no layout, so the scroller's geometry is faked: each message
// sits at a fixed offset, and scrolling just moves scrollTop.
const geometry = {
  scrollTop: 0,
  scrollHeight: 0,
  clientHeight: 500,
  offsets: {} as Record<string, number>,
};
const scrollTo = vi.fn((options: ScrollToOptions) => {
  geometry.scrollTop = options.top ?? geometry.scrollTop;
});
const resizeCallbacks: (() => void)[] = [];
const resize = () => act(() => resizeCallbacks.forEach((cb) => cb()));

function fake(scroller: HTMLDivElement) {
  const max = () => geometry.scrollHeight - geometry.clientHeight;
  Object.defineProperties(scroller, {
    scrollTop: {
      configurable: true,
      get: () => geometry.scrollTop,
      set: (v: number) =>
        (geometry.scrollTop = Math.max(0, Math.min(v, max()))),
    },
    scrollHeight: { configurable: true, get: () => geometry.scrollHeight },
    clientHeight: { configurable: true, get: () => geometry.clientHeight },
  });
  scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
  scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
}

function placeMessage(el: HTMLDivElement | null, id: string) {
  if (!el) return;
  el.getBoundingClientRect = () =>
    ({ top: geometry.offsets[id] - geometry.scrollTop }) as DOMRect;
}

let scroll: ReturnType<typeof useChatScroll>;

function Harness(props: { threadId: string | null; ids: string[] }) {
  const chat = useChatScroll({
    threadId: props.threadId,
    contentVersion: props.ids,
  });
  // Hands the latest hook result to the test after each render.
  useLayoutEffect(() => {
    scroll = chat;
  });
  return (
    <div
      data-testid="scroller"
      ref={chat.scrollRef}
    >
      {/* Child refs attach before the hook's effects run. */}
      <span
        ref={(el) => {
          if (el) fake(el.parentElement as HTMLDivElement);
        }}
      />
      <div ref={chat.contentRef}>
        {props.ids.map((id) => (
          <div
            key={id}
            data-message-id={id}
            ref={(el) => placeMessage(el, id)}
          />
        ))}
      </div>
    </div>
  );
}

function reducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("reduce"),
      addEventListener() {},
      removeEventListener() {},
    })),
  );
}

/** A loaded thread: one question and a long answer, opened at the end. */
function renderLoadedThread() {
  geometry.scrollHeight = 2000;
  geometry.offsets = { q1: 40, a1: 120 };
  return render(
    <Harness
      threadId="t-1"
      ids={["q1", "a1"]}
    />,
  );
}

/** Sends a follow-up and renders it 1200px down the list. */
function sendFollowUp(rerender: ReturnType<typeof render>["rerender"]) {
  act(() => scroll.scrollToQuestion("q2"));
  geometry.scrollHeight = 2400;
  geometry.offsets.q2 = 1200;
  rerender(
    <Harness
      threadId="t-1"
      ids={["q1", "a1", "q2"]}
    />,
  );
}

describe("useChatScroll", () => {
  beforeEach(() => {
    geometry.scrollTop = 0;
    scrollTo.mockClear();
    resizeCallbacks.length = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          resizeCallbacks.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    reducedMotion(false);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens a loaded thread at its end", () => {
    renderLoadedThread();
    expect(geometry.scrollTop).toBe(1500);
    expect(scroll.isAtBottom).toBe(true);
  });

  it("scrolls a new question to the top of the view, not to the bottom", () => {
    const { rerender } = renderLoadedThread();
    sendFollowUp(rerender);

    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith({
      top: 1200 - QUESTION_TOP_OFFSET_PX,
      behavior: "smooth",
    });
    expect(geometry.scrollTop).toBe(1184);
  });

  it("holds the question in place while the answer streams in", () => {
    const { rerender } = renderLoadedThread();
    sendFollowUp(rerender);
    scrollTo.mockClear();

    for (const height of [2600, 3000, 3600]) {
      geometry.scrollHeight = height;
      resize();
    }
    rerender(
      <Harness
        threadId="t-1"
        ids={["q1", "a1", "q2", "a2"]}
      />,
    );

    expect(scrollTo).not.toHaveBeenCalled();
    expect(geometry.scrollTop).toBe(1184);
    expect(scroll.isAtBottom).toBe(false);
  });

  it("moves down only as far as the question once the answer makes room", () => {
    const { rerender } = renderLoadedThread();
    act(() => scroll.scrollToQuestion("q2"));
    // A short page: the question can't reach the top yet.
    geometry.scrollHeight = 1800;
    geometry.offsets.q2 = 1600;
    rerender(
      <Harness
        threadId="t-1"
        ids={["q1", "a1", "q2"]}
      />,
    );
    expect(geometry.scrollTop).toBe(1300);

    geometry.scrollHeight = 5000;
    resize();
    expect(geometry.scrollTop).toBe(1600 - QUESTION_TOP_OFFSET_PX);
  });

  it("uses an instant scroll when the person prefers reduced motion", () => {
    reducedMotion(true);
    const { rerender } = renderLoadedThread();
    sendFollowUp(rerender);
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto" }),
    );

    act(() => scroll.scrollToBottom());
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 2400,
      behavior: "auto",
    });
  });

  it("leaves the view alone after the person scrolls up", () => {
    const { getByTestId } = renderLoadedThread();
    const scroller = getByTestId("scroller");
    fireEvent.wheel(scroller, { deltaY: -100 });
    geometry.scrollTop = 900;
    fireEvent.scroll(scroller);

    geometry.scrollHeight = 2600;
    resize();
    expect(geometry.scrollTop).toBe(900);
    expect(scroll.isAtBottom).toBe(false);
  });

  it("Scroll to bottom follows new text again", () => {
    const { rerender } = renderLoadedThread();
    sendFollowUp(rerender);
    act(() => scroll.scrollToBottom());
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 2400,
      behavior: "smooth",
    });

    geometry.scrollHeight = 3000;
    resize();
    expect(geometry.scrollTop).toBe(2500);
  });

  it("opens another thread at its end", () => {
    const { rerender } = renderLoadedThread();
    sendFollowUp(rerender);
    geometry.scrollHeight = 4000;
    rerender(
      <Harness
        threadId="t-2"
        ids={["x1", "x2"]}
      />,
    );
    expect(geometry.scrollTop).toBe(3500);
  });

  it("keeps the first question in place when it creates the thread", () => {
    geometry.scrollHeight = 500;
    geometry.offsets = {};
    const { rerender } = render(
      <Harness
        threadId={null}
        ids={[]}
      />,
    );
    act(() => scroll.scrollToQuestion("q1"));
    geometry.scrollHeight = 900;
    geometry.offsets.q1 = 300;
    rerender(
      <Harness
        threadId={null}
        ids={["q1"]}
      />,
    );
    expect(geometry.scrollTop).toBe(300 - QUESTION_TOP_OFFSET_PX);

    geometry.scrollHeight = 1400;
    rerender(
      <Harness
        threadId="t-new"
        ids={["q1", "a1"]}
      />,
    );
    expect(geometry.scrollTop).toBe(300 - QUESTION_TOP_OFFSET_PX);
  });
});
