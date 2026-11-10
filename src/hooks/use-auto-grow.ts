import { useLayoutEffect, useRef } from "react";

function supportsFieldSizing(): boolean {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("field-sizing", "content")
  );
}

/**
 * Grows a textarea with its text where the browser can't do it in CSS
 * (`field-sizing: content`, which Firefox lacks). It runs whenever the value
 * changes, typed or set from code (a recalled question, the box cleared after
 * send, another thread's draft). The element's own max-height still caps it,
 * and past that it scrolls inside itself. Where CSS can, it does nothing.
 */
export function useAutoGrow<T extends HTMLTextAreaElement>(value: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || supportsFieldSizing()) return;
    // Measured at "auto" so the box can shrink as well as grow.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}
