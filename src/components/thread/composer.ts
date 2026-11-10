/** The id of the thread's message box, so focus can be sent back to it. */
export const COMPOSER_ID = "thread-composer";

/**
 * Puts keyboard focus in the message box, if it is on the page. The box sits
 * in the conversation's scroller, pinned to its bottom, so it's always in
 * view; letting focus scroll it into view would instead cancel a smooth
 * scroll in progress (Scroll to bottom, or a new question moving to the top).
 *
 * `atEnd` puts the caret after the text and scrolls the box to it, for text
 * just put there (Edit): the box has a maximum height and scrolls inside
 * itself, and preventScroll leaves that scroll where it was. It runs on the
 * next frame, once the new text has rendered.
 */
export function focusComposer({ atEnd = false } = {}): void {
  const box = document.getElementById(COMPOSER_ID);
  box?.focus({ preventScroll: true });
  if (!atEnd || !(box instanceof HTMLTextAreaElement)) return;
  requestAnimationFrame(() => {
    const end = box.value.length;
    box.setSelectionRange(end, end);
    box.scrollTop = box.scrollHeight;
  });
}
