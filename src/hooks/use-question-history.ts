import {
  useEffect,
  useRef,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";

/** Where a look back through earlier questions has got to. */
type Browsing = {
  /** Index into the questions of the one in the box. */
  index: number;
  /** What was in the box before the first Up, for Down to bring back. */
  draft: string;
};

function caretOnFirstLine(box: HTMLTextAreaElement) {
  return !box.value.slice(0, box.selectionStart).includes("\n");
}

function caretOnLastLine(box: HTMLTextAreaElement) {
  return !box.value.slice(box.selectionEnd).includes("\n");
}

/**
 * Up and Down in the message box recall this conversation's earlier
 * questions, like a shell's history. Up with the caret on the box's first
 * line puts the previous question in it, and again goes further back. Down
 * with the caret on the last line walks forward and, past the newest,
 * brings back what was being typed. With the caret anywhere else the arrows
 * move it as usual, so a multi-line question can still be edited.
 *
 * Anything else that changes the box (typing, Edit question) ends the look
 * back, leaving the text as the person's own; so does another conversation.
 */
export function useQuestionHistory({
  questions,
  input,
  setInput,
  resetKey,
}: {
  /** This conversation's questions, oldest first. */
  questions: string[];
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  /** Changes when the conversation does. */
  resetKey: unknown;
}) {
  const browsing = useRef<Browsing | null>(null);
  // The text this hook last put in the box, to tell it from other changes.
  const recalled = useRef<string | null>(null);

  useEffect(() => {
    if (input !== recalled.current) {
      browsing.current = null;
      recalled.current = null;
    }
  }, [input]);

  useEffect(() => {
    browsing.current = null;
    recalled.current = null;
  }, [resetKey]);

  // A question asked twice in a row is one stop, as in a shell.
  const stops = questions.filter(
    (q, i) => q.trim() && (i === 0 || q !== questions[i - 1]),
  );

  const show = (text: string) => {
    recalled.current = text;
    setInput(text);
  };

  /** Handles Up or Down when it's a recall; true if it was. */
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return false;
    // An input method uses the arrows to pick a candidate.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return false;
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return false;
    const box = e.currentTarget;
    if (box.selectionStart !== box.selectionEnd) return false;

    const current = browsing.current;
    if (e.key === "ArrowUp") {
      if (!caretOnFirstLine(box)) return false;
      let index = (current ? current.index : stops.length) - 1;
      // Already in the box (Edit question put it there): go past it.
      while (index >= 0 && stops[index] === input) index--;
      if (index < 0) return false;
      e.preventDefault();
      browsing.current = { index, draft: current ? current.draft : input };
      show(stops[index]);
      return true;
    }

    if (!current || !caretOnLastLine(box)) return false;
    e.preventDefault();
    const index = current.index + 1;
    if (index >= stops.length) {
      browsing.current = null;
      recalled.current = null;
      setInput(current.draft);
    } else {
      browsing.current = { ...current, index };
      show(stops[index]);
    }
    return true;
  };

  return { onKeyDown };
}
