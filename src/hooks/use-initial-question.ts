import { useEffect, useRef } from "react";
import { useQueryState } from "nuqs";

// Matches the maxlength on the support homepage's "How can we help?" input.
export const MAX_INITIAL_QUESTION_LENGTH = 500;

/**
 * Submits a question passed as `?q=` (the support homepage's search box and
 * prompt chips link here that way) as the user's first message, then strips
 * `q` so a refresh resumes the new thread instead of asking again.
 *
 * `q` is dropped unsent when the URL already points at a conversation
 * (`threadId`) or is mid-handoff (`h`): a stray question must never be
 * appended to an existing thread.
 */
export function useInitialQuestion(onQuestion: (question: string) => void) {
  const [question, setQuestion] = useQueryState("q");
  const [threadId] = useQueryState("threadId");
  const [handoffToken] = useQueryState("h");
  // Guards against a double submit if the effect re-runs before `q` clears.
  const handled = useRef(false);

  useEffect(() => {
    if (question === null || handled.current) return;
    handled.current = true;

    const text = question.trim().slice(0, MAX_INITIAL_QUESTION_LENGTH);
    if (text && !threadId && !handoffToken) {
      onQuestion(text);
    }
    setQuestion(null);
  }, [question, threadId, handoffToken, onQuestion, setQuestion]);
}
