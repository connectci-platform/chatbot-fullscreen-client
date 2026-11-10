import { useEffect, useState, type RefObject } from "react";

/**
 * Whether any part of any of the elements is on screen: inside the window
 * and not scrolled out of a box around it. An element that isn't displayed
 * (display: none) never is. Until the browser has said, and where there's
 * no IntersectionObserver, it counts as on screen.
 *
 * The refs are read once, on mount, so they must be on elements that stay.
 */
export function useAnyInView(
  refs: ReadonlyArray<RefObject<Element | null>>,
): boolean {
  const [inView, setInView] = useState(true);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const showing = new Map<Element, boolean>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        showing.set(entry.target, entry.isIntersecting);
      }
      setInView(Array.from(showing.values()).some(Boolean));
    });
    for (const ref of refs) {
      if (ref.current) observer.observe(ref.current);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read on mount
  }, []);

  return inView;
}
