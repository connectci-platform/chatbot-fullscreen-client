import { useLayoutEffect } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUESTION_TOP_OFFSET_PX, useChatScroll } from "./use-chat-scroll";

// jsdom has no layout, so the scroller's geometry is faked: each question
// sits at a fixed offset in the list, the list is `listHeight` tall plus the
// spacer under it, and scrolling just moves scrollTop.
const geometry = {
  scrollTop: 0,
  listHeight: 0,
  clientHeight: 500,
  offsets: {} as Record<string, number>,
};
let spacer: HTMLDivElement | null = null;
const spacerPx = () => parseInt(spacer?.style.height || "0", 10);
const scrollHeight = () => geometry.listHeight + spacerPx();
const maxScroll = () => scrollHeight() - geometry.clientHeight;
const scrollTo = vi.fn((options: ScrollToOptions) => {
  geometry.scrollTop = Math.min(options.top ?? 0, maxScroll());
});
const resizeCallbacks: (() => void)[] = [];
const resize = () => act(() => resizeCallbacks.forEach((cb) => cb()));
/** Where a question's top is, from the top of the view. */
const topInView = (id: string) => geometry.offsets[id] - geometry.scrollTop;

function fake(scroller: HTMLDivElement) {
  Object.defineProperties(scroller, {
    scrollTop: {
      configurable: true,
      get: () => geometry.scrollTop,
      set: (v: number) =>
        (geometry.scrollTop = Math.max(0, Math.min(v, maxScroll()))),
    },
    scrollHeight: { configurable: true, get: scrollHeight },
    clientHeight: { configurable: true, get: () => geometry.clientHeight },
  });
  scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
  scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
}

function placeQuestion(el: HTMLDivElement | null, id: string) {
  if (!el) return;
  el.getBoundingClientRect = () => ({ top: topInView(id) }) as DOMRect;
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
            ref={(el) => placeQuestion(el, id)}
          />
        ))}
        <div
          data-testid="spacer"
          ref={chat.spacerRef}
        />
      </div>
      <div ref={chat.footerRef} />
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

type Rendered = ReturnType<typeof render>;

/** A loaded thread with a long first answer, opened at its end. */
function renderLoadedThread() {
  geometry.listHeight = 2000;
  geometry.offsets = { q1: 40 };
  const rendered = render(
    <Harness
      threadId="t-1"
      ids={["q1"]}
    />,
  );
  spacer = rendered.getByTestId("spacer") as HTMLDivElement;
  return rendered;
}

/** Sends a follow-up, shown near the bottom of the list as it is sent. */
function sendFollowUp({ rerender }: Rendered) {
  act(() => scroll.scrollToQuestion());
  geometry.offsets.q2 = 1900;
  rerender(
    <Harness
      threadId="t-1"
      ids={["q1", "q2"]}
    />,
  );
}

/**
 * The whole answer comes back in one update, with the agent's copy of the
 * question under a new id in place of the one shown on sending.
 */
function answerArrives({ rerender }: Rendered, listHeight: number) {
  geometry.listHeight = listHeight;
  geometry.offsets["q2-agent"] = 1900;
  rerender(
    <Harness
      threadId="t-1"
      ids={["q1", "q2-agent"]}
    />,
  );
  resize();
}

describe("useChatScroll", () => {
  beforeEach(() => {
    geometry.scrollTop = 0;
    spacer = null;
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

  it("opens a loaded thread at its end, with no spacer", () => {
    renderLoadedThread();
    expect(geometry.scrollTop).toBe(1500);
    expect(spacerPx()).toBe(0);
    expect(scroll.isAtBottom).toBe(true);
  });

  it("scrolls a new question to the top of the view, making room below it", () => {
    const rendered = renderLoadedThread();
    sendFollowUp(rendered);

    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith({
      top: 1900 - QUESTION_TOP_OFFSET_PX,
      behavior: "smooth",
    });
    expect(topInView("q2")).toBe(QUESTION_TOP_OFFSET_PX);
    // The list ends 100px below the question; the spacer makes up the rest.
    expect(spacerPx()).toBe(1884 - 1500);
  });

  it("holds the question at the top when the answer arrives in one piece", () => {
    const rendered = renderLoadedThread();
    sendFollowUp(rendered);
    scrollTo.mockClear();

    answerArrives(rendered, 4000);

    expect(scrollTo).not.toHaveBeenCalled();
    expect(topInView("q2-agent")).toBe(QUESTION_TOP_OFFSET_PX);
    expect(spacerPx()).toBe(0);
    expect(scroll.isAtBottom).toBe(false);
  });

  it("leaves space under a short answer, so the question stays at the top", () => {
    const rendered = renderLoadedThread();
    sendFollowUp(rendered);
    answerArrives(rendered, 2200);

    expect(topInView("q2-agent")).toBe(QUESTION_TOP_OFFSET_PX);
    expect(spacerPx()).toBe(1884 - 1700);
    expect(scroll.isAtBottom).toBe(true);
  });

  it("corrects a question that moved after reaching the top instantly", () => {
    const rendered = renderLoadedThread();
    sendFollowUp(rendered);
    resize(); // Settles at the top: the smooth scroll has arrived.
    scrollTo.mockClear();

    // The agent's copy of the question renders 8px lower than ours did.
    geometry.listHeight = 4000;
    geometry.offsets["q2-agent"] = 1908;
    rendered.rerender(
      <Harness
        threadId="t-1"
        ids={["q1", "q2-agent"]}
      />,
    );
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 1908 - QUESTION_TOP_OFFSET_PX,
      behavior: "auto",
    });
    expect(topInView("q2-agent")).toBe(QUESTION_TOP_OFFSET_PX);
  });

  it("keeps the first move smooth while it is still under way", () => {
    const rendered = renderLoadedThread();
    // A smooth scroll that hasn't moved yet when the next update lands.
    scrollTo.mockImplementationOnce(() => {});
    sendFollowUp(rendered);
    geometry.listHeight = 2300;
    resize();
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 1900 - QUESTION_TOP_OFFSET_PX,
      behavior: "smooth",
    });
  });

  it("uses an instant scroll when the person prefers reduced motion", () => {
    reducedMotion(true);
    const rendered = renderLoadedThread();
    sendFollowUp(rendered);
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto" }),
    );

    answerArrives(rendered, 4000);
    act(() => scroll.scrollToBottom());
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 4000, behavior: "auto" });
  });

  it("leaves the view alone after the person scrolls up", () => {
    const { getByTestId } = renderLoadedThread();
    const scroller = getByTestId("scroller");
    fireEvent.wheel(scroller, { deltaY: -100 });
    geometry.scrollTop = 900;
    fireEvent.scroll(scroller);

    geometry.listHeight = 2600;
    resize();
    expect(geometry.scrollTop).toBe(900);
    expect(scroll.isAtBottom).toBe(false);
  });

  it("Scroll to bottom follows new content again", () => {
    const rendered = renderLoadedThread();
    sendFollowUp(rendered);
    answerArrives(rendered, 4000);
    act(() => scroll.scrollToBottom());
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 4000,
      behavior: "smooth",
    });

    geometry.listHeight = 4300;
    resize();
    expect(geometry.scrollTop).toBe(3800);
  });

  it("opens another thread at its end and drops the spacer", () => {
    const rendered = renderLoadedThread();
    sendFollowUp(rendered);
    expect(spacerPx()).toBeGreaterThan(0);

    geometry.listHeight = 3000;
    rendered.rerender(
      <Harness
        threadId="t-2"
        ids={["x1"]}
      />,
    );
    expect(spacerPx()).toBe(0);
    expect(geometry.scrollTop).toBe(2500);
  });

  it("keeps the first question in place when it creates the thread", () => {
    geometry.listHeight = 400;
    geometry.offsets = {};
    const rendered = render(
      <Harness
        threadId={null}
        ids={[]}
      />,
    );
    spacer = rendered.getByTestId("spacer") as HTMLDivElement;
    act(() => scroll.scrollToQuestion());
    geometry.listHeight = 900;
    geometry.offsets.q1 = 300;
    rendered.rerender(
      <Harness
        threadId={null}
        ids={["q1"]}
      />,
    );
    expect(topInView("q1")).toBe(QUESTION_TOP_OFFSET_PX);

    geometry.listHeight = 1400;
    rendered.rerender(
      <Harness
        threadId="t-new"
        ids={["q1"]}
      />,
    );
    resize();
    expect(topInView("q1")).toBe(QUESTION_TOP_OFFSET_PX);
  });

  it("opens the empty screen at its top, where its top bar is", () => {
    geometry.listHeight = 900;
    geometry.offsets = {};
    const rendered = render(
      <Harness
        threadId={null}
        ids={[]}
      />,
    );
    spacer = rendered.getByTestId("spacer") as HTMLDivElement;
    resize();
    expect(geometry.scrollTop).toBe(0);
  });

  it("leaves the empty screen where the person scrolled it", () => {
    geometry.listHeight = 900;
    geometry.offsets = {};
    const rendered = render(
      <Harness
        threadId={null}
        ids={[]}
      />,
    );
    spacer = rendered.getByTestId("spacer") as HTMLDivElement;
    geometry.scrollTop = 400;
    fireEvent.wheel(rendered.getByTestId("scroller"));
    fireEvent.scroll(rendered.getByTestId("scroller"));
    resize();
    expect(geometry.scrollTop).toBe(400);
  });

  it("starts a new conversation at the top of the empty screen", () => {
    const rendered = renderLoadedThread();
    expect(geometry.scrollTop).toBe(1500);
    geometry.listHeight = 900;
    geometry.offsets = {};
    rendered.rerender(
      <Harness
        threadId={null}
        ids={[]}
      />,
    );
    resize();
    expect(geometry.scrollTop).toBe(0);
  });
});
