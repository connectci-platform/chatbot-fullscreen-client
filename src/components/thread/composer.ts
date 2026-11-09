/** The id of the thread's message box, so focus can be sent back to it. */
export const COMPOSER_ID = "thread-composer";

/**
 * Puts keyboard focus in the message box, if it is on the page. The box sits
 * in the conversation's scroller, pinned to its bottom, so it's always in
 * view; letting focus scroll it into view would instead cancel a smooth
 * scroll in progress (Scroll to bottom, or a new question moving to the top).
 */
export function focusComposer(): void {
  document.getElementById(COMPOSER_ID)?.focus({ preventScroll: true });
}
