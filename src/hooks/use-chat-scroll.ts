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
 * anchor: keep the question just asked at the top while its answer streams.
 * free: the person scrolled away, so leave the view where they put it.
 */
type Mode = "follow" | "anchor" | "free";

type Anchor = { id: string; el: HTMLElement | null; placed: boolean };

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
 * arrives below it, so the person reads from the start rather than being
 * pulled along with each new line. Once they scroll themselves, the view is
 * theirs: back at the end it follows new text again, anywhere else it stays.
 *
 * Attach `scrollRef` to the scrolling element and `contentRef` to the
 * message list inside it. Question elements carry `data-message-id`.
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

  const findAnchor = useCallback(() => {
    const current = anchor.current;
    if (!current) return null;
    if (current.el?.isConnected) return current.el;
    const match = Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>("[data-message-id]") ??
        [],
    ).find((el) => el.dataset.messageId === current.id);
    current.el = match ?? null;
    return current.el;
  }, []);

  /** Puts the view where the current mode wants it. */
  const settle = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    if (mode.current === "anchor") {
      const el = findAnchor();
      if (el) {
        const max = scroller.scrollHeight - scroller.clientHeight;
        const top =
          scroller.scrollTop +
          el.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top -
          QUESTION_TOP_OFFSET_PX;
        const target = Math.max(0, Math.min(top, max));
        // Once the question is at the top, more answer text below it
        // leaves the target unchanged, so streaming doesn't scroll.
        if (Math.abs(target - scroller.scrollTop) > 1) {
          scroller.scrollTo({ top: target, behavior: anchorBehavior.current });
        }
        anchor.current!.placed = true;
      } else if (anchor.current?.placed) {
        // The question went away (another thread loaded): open at the end.
        mode.current = "follow";
        anchor.current = null;
      }
    }

    if (mode.current === "follow") {
      scroller.scrollTop = scroller.scrollHeight;
    }
    measure();
  }, [findAnchor, measure]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const onScroll = () => {
      const byPerson =
        draggingScrollbar.current || Date.now() < userScrollUntil.current;
      const atBottom = measure();
      if (byPerson) {
        mode.current = atBottom ? "follow" : "free";
        anchor.current = null;
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

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => settle());
      observer.observe(scroller);
      if (contentRef.current) observer.observe(contentRef.current);
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

  // Opening another thread (or a new conversation) starts at its end. The
  // first question of a new conversation creates its thread id; that's the
  // same conversation, so its anchor stays.
  const previousThreadId = useRef(threadId);
  useEffect(() => {
    const previous = previousThreadId.current;
    previousThreadId.current = threadId;
    if (previous === threadId) return;
    if (previous === null && mode.current === "anchor") return;
    mode.current = "follow";
    anchor.current = null;
    settle();
  }, [threadId, settle]);

  /** Call as a question is sent, with the id its message will render with. */
  const scrollToQuestion = useCallback(
    (messageId: string) => {
      mode.current = "anchor";
      anchor.current = { id: messageId, el: null, placed: false };
      anchorBehavior.current = scrollBehavior();
      userScrollUntil.current = 0;
      settle();
    },
    [settle],
  );

  const scrollToBottom = useCallback(() => {
    const scroller = scrollRef.current;
    mode.current = "follow";
    anchor.current = null;
    scroller?.scrollTo({
      top: scroller.scrollHeight,
      behavior: scrollBehavior(),
    });
  }, []);

  return {
    scrollRef,
    contentRef,
    isAtBottom,
    scrollToQuestion,
    scrollToBottom,
  };
}
