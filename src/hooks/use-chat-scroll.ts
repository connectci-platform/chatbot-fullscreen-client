import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Space left above a new question once it's scrolled to the top. */
export const QUESTION_TOP_OFFSET_PX = 16;
/** How close to the end still counts as being at the bottom. */
const AT_BOTTOM_TOLERANCE_PX = 8;

/** Keys that scroll the conversation when focus isn't in a control. */
const SCROLL_KEYS = new Set([
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
  " ",
]);

/**
 * follow: keep the end of the conversation in view (a loaded thread).
 * anchor: keep the question just asked at the top while its answer arrives.
 * free: the person scrolled away, so leave the view where they put it.
 */
type Mode = "follow" | "anchor" | "free";

/**
 * The question being kept at the top. It's always the newest one, found by
 * position rather than id: the agent's copy of a question replaces the one
 * shown on sending, under a new id, when the answer comes back.
 */
type Anchor = {
  questionsBefore: number;
  /** Scrolled for: the question is in the list and the view moving to it. */
  placed: boolean;
  /** The view has reached it at least once. */
  arrived: boolean;
};

/** Smooth scrolling, unless the person asked for reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduce ? "auto" : "smooth";
}

function isControl(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      !!target.closest("input, textarea, select, button, a, [role=button]"))
  );
}

/**
 * Scrolling for the conversation. A loaded thread opens at its end. A new
 * question scrolls to the top of the view and stays there while the answer
 * arrives below it, so the person reads from the start rather than landing
 * at its end. A spacer under the newest turn gives the question room to
 * reach the top when what follows it is shorter than the view; it shrinks
 * as the answer fills in. Once the person scrolls themselves, the view is
 * theirs: back at the end it follows new text again, anywhere else it stays.
 *
 * Attach `scrollRef` to the scrolling element, `contentRef` to the message
 * list inside it, `spacerRef` to an empty element last in that list, and
 * `footerRef` to the composer below it. Questions carry `data-message-id`.
 */
export function useChatScroll({
  threadId,
  contentVersion,
}: {
  threadId: string | null;
  /** Changes whenever the messages do, so new content gets placed. */
  contentVersion: unknown;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const mode = useRef<Mode>("follow");
  const anchor = useRef<Anchor | null>(null);
  const anchorBehavior = useRef<ScrollBehavior>("auto");
  // Scroll events only change the mode when the person caused them, which
  // these track: a wheel, touch, scrolling key, or a scrollbar drag.
  const userScrollUntil = useRef(0);
  const draggingScrollbar = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const measure = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return true;
    const atBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <=
      AT_BOTTOM_TOLERANCE_PX;
    setIsAtBottom(atBottom);
    return atBottom;
  }, []);

  const questions = useCallback(
    () =>
      Array.from(
        contentRef.current?.querySelectorAll<HTMLElement>(
          "[data-message-id]",
        ) ?? [],
      ),
    [],
  );

  // Whether the empty screen has been put at its top since it appeared.
  const showingEmpty = useRef(false);

  // Set directly on the element: it changes with layout, not with state.
  const spacerPx = useRef(0);
  const setSpacer = useCallback((height: number) => {
    spacerPx.current = Math.max(0, Math.ceil(height));
    const spacer = spacerRef.current;
    if (spacer) spacer.style.height = `${spacerPx.current}px`;
  }, []);

  /** Puts the view where the current mode wants it. */
  const settle = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const all = questions();
    const current = anchor.current;
    const question =
      current && (current.placed || all.length > current.questionsBefore)
        ? all.at(-1)
        : undefined;

    if (current?.placed && !question) {
      // The conversation went away (another thread loaded): open at its end.
      mode.current = "follow";
      anchor.current = null;
      setSpacer(0);
    }

    if (question) {
      const target =
        scroller.scrollTop +
        question.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        QUESTION_TOP_OFFSET_PX;
      // Room the question needs below it to scroll to the top: zero once
      // the answer fills the view. Only an anchored question can grow it.
      const withoutSpacer =
        scroller.scrollHeight - spacerPx.current - scroller.clientHeight;
      const needed = Math.max(0, target - withoutSpacer);
      setSpacer(
        mode.current === "anchor" ? needed : Math.min(spacerPx.current, needed),
      );

      if (mode.current === "anchor") {
        const top = Math.max(0, target);
        // Once the question is at the top, the answer arriving below it
        // leaves the target unchanged, so it doesn't scroll.
        if (Math.abs(top - scroller.scrollTop) > 1) {
          // Only the move up to the top is animated. Once the question has
          // got there, a correction (the agent's copy of the question
          // replacing ours, the chart panel narrowing the view) is instant,
          // so the question doesn't sit visibly off its place meanwhile.
          scroller.scrollTo({
            top,
            behavior: current!.arrived ? "auto" : anchorBehavior.current,
          });
        } else {
          current!.arrived = true;
        }
        current!.placed = true;
      }
    }

    if (mode.current === "follow") {
      if (all.length) {
        scroller.scrollTop = scroller.scrollHeight;
        showingEmpty.current = false;
      } else if (!showingEmpty.current) {
        // The empty screen opens at its top, where its top bar and logo
        // are, once; after that it stays where the person scrolls it.
        scroller.scrollTop = 0;
        showingEmpty.current = true;
      }
    }
    measure();
  }, [measure, questions, setSpacer]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const onScroll = () => {
      const byPerson =
        draggingScrollbar.current || Date.now() < userScrollUntil.current;
      const atBottom = measure();
      if (byPerson && mode.current !== (atBottom ? "follow" : "free")) {
        mode.current = atBottom ? "follow" : "free";
      }
    };
    const onWheel = () => {
      userScrollUntil.current = Date.now() + 300;
    };
    const onTouchMove = () => {
      // Long enough to cover the momentum scroll after the finger lifts.
      userScrollUntil.current = Date.now() + 1000;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(e.key) || isControl(e.target)) return;
      userScrollUntil.current = Date.now() + 600;
    };
    const onPointerDown = (e: PointerEvent) => {
      // Only the scrollbar itself, not a click on a message or a button.
      if (e.target === scroller) draggingScrollbar.current = true;
    };
    const onPointerUp = () => {
      if (!draggingScrollbar.current) return;
      draggingScrollbar.current = false;
      userScrollUntil.current = Date.now() + 300;
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("wheel", onWheel, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: true });
    scroller.addEventListener("keydown", onKeyDown);
    scroller.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);

    // The view, the messages, and the composer (which grows with a long
    // question or the Turnstile check) all move where the end is.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => settle());
      for (const el of [scroller, contentRef.current, footerRef.current]) {
        if (el) observer.observe(el);
      }
    }

    return () => {
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("keydown", onKeyDown);
      scroller.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      observer?.disconnect();
    };
  }, [measure, settle]);

  useLayoutEffect(() => {
    settle();
  }, [contentVersion, settle]);

  // Opening another thread (or a new conversation) starts at its end, with
  // no spacer. The first question of a new conversation creates its thread
  // id; that's the same conversation, so its anchor stays.
  const previousThreadId = useRef(threadId);
  useEffect(() => {
    const previous = previousThreadId.current;
    previousThreadId.current = threadId;
    if (previous === threadId) return;
    if (previous === null && mode.current === "anchor") return;
    mode.current = "follow";
    anchor.current = null;
    setSpacer(0);
    settle();
  }, [threadId, settle, setSpacer]);

  /** Call as a question is sent, before it renders. */
  const scrollToQuestion = useCallback(() => {
    mode.current = "anchor";
    anchor.current = {
      questionsBefore: questions().length,
      placed: false,
      arrived: false,
    };
    anchorBehavior.current = scrollBehavior();
    userScrollUntil.current = 0;
  }, [questions]);

  const scrollToBottom = useCallback(() => {
    const scroller = scrollRef.current;
    mode.current = "follow";
    scroller?.scrollTo({
      top: scroller.scrollHeight,
      behavior: scrollBehavior(),
    });
  }, []);

  return {
    scrollRef,
    contentRef,
    spacerRef,
    footerRef,
    isAtBottom,
    scrollToQuestion,
    scrollToBottom,
  };
}
