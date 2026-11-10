/** Finding and focusing the copy of a conversation control that shows. */

/**
 * Marks the toggles, where focus goes back when the sidebar closes: the top
 * bar's (floating, or the first row of the conversation) and the compact one
 * under the message box. One of them is on screen at a time.
 */
export const CONVERSATIONS_TOGGLE_ATTR = "data-conversations-toggle";
/** Marks the two top bars, the floating one and the one in the scroller. */
export const TOP_BAR_ATTR = "data-top-bar";
/** Marks the New chat buttons outside the sidebar. */
export const NEW_CHAT_ATTR = "data-new-chat";

/**
 * Whether any of `el` is inside the window and every scrolling box around
 * it, so a toggle scrolled away above the conversation doesn't count.
 */
function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  let top = 0;
  let left = 0;
  let bottom = window.innerHeight;
  let right = window.innerWidth;
  for (let box = el.parentElement; box; box = box.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(box);
    if (overflowX === "visible" && overflowY === "visible") continue;
    const b = box.getBoundingClientRect();
    top = Math.max(top, b.top);
    left = Math.max(left, b.left);
    bottom = Math.min(bottom, b.bottom);
    right = Math.min(right, b.right);
  }
  return r.bottom > top && r.top < bottom && r.right > left && r.left < right;
}

/**
 * Focuses the copy of a control that's showing: on screen if one is, else
 * the first one laid out. preventScroll, because the top bar may be the
 * first row of the conversation's scroller, and scrolling it into view would
 * jump the chat back to the top.
 */
export function focusShown(selector: string, except?: Element | null) {
  const all = Array.from(
    document.querySelectorAll<HTMLElement>(selector),
  ).filter((el) => !except?.contains(el));
  const laidOut = all.filter((el) => el.getClientRects().length > 0);
  const target =
    laidOut.find(onScreen) ?? laidOut[0] ?? (all.length === 1 ? all[0] : null);
  target?.focus({ preventScroll: true });
}

/** The Conversations toggle that's showing, for focus when the list closes. */
export function focusConversationsToggle(except?: Element | null) {
  focusShown(`[${CONVERSATIONS_TOGGLE_ATTR}]`, except);
}
