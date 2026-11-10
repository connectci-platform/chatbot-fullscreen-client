/** The id of the thread's message box, so focus can be sent back to it. */
export const COMPOSER_ID = "thread-composer";

/** Puts keyboard focus in the message box, if it is on the page. */
export function focusComposer(): void {
  document.getElementById(COMPOSER_ID)?.focus();
}
