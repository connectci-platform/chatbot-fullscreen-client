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

/** Runs `then` once the browser has moved the caret for the key. */
export type AfterNativeMove = (then: () => void) => void;

const afterNativeMoveDefault: AfterNativeMove = (then) => {
  setTimeout(then, 0);
};

/**
 * Up and Down in the message box recall this conversation's earlier
 * questions, like a shell's history. The browser moves the caret first, so
 * lines that wrap are walked like any other; only once the caret can't go
 * further does the key recall. Up at the very start of the box puts the
 * previous question in it, and again goes further back. Down at the very
 * end walks forward and, past the newest, brings back what was being typed.
 *
 * In a draft the caret has to be at the start (or end) already when the key
 * is pressed, so the press that only moves it there never replaces the
 * draft. A recalled question is walked straight through: reaching its start
 * or end is enough, and so is a press that leaves the caret where it was
 * (Windows doesn't move it off the first or last line).
 *
 * Anything else that changes the box (typing, Edit question) ends the look
 * back, leaving the text as the person's own; so does another conversation.
 *
 * Only the text is recalled. The ACCESS composer has uploads switched off,
 * so a question's attachments aren't brought back.
 */
export function useQuestionHistory({
  questions,
  input,
  setInput,
  resetKey,
  afterNativeMove = afterNativeMoveDefault,
}: {
  /** This conversation's questions, oldest first. */
  questions: string[];
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  /** Changes when the conversation does. */
  resetKey: unknown;
  /** For tests, which have no browser to move the caret. */
  afterNativeMove?: AfterNativeMove;
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

  /** Watches Up and Down; recalls once the browser has moved the caret. */
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const key = e.key;
    if (key !== "ArrowUp" && key !== "ArrowDown") return;
    // An input method uses the arrows to pick a candidate.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    const box = e.currentTarget;
    if (box.selectionStart !== box.selectionEnd) return;
    const before = box.selectionStart;

    afterNativeMove(() => {
      if (box.selectionStart !== box.selectionEnd) return;
      const caret = box.selectionStart;
      const current = browsing.current;
      const atEdge =
        key === "ArrowUp" ? caret === 0 : caret === box.value.length;
      // The caret couldn't go further. Chromium on Windows leaves it where
      // it was on the first (or last) line instead of moving it to the edge.
      const stuck = caret === before;
      // A draft needs both: the caret already at its edge when the key was
      // pressed. A recalled question needs either, so it's walked straight
      // through.
      const reached = current ? atEdge || stuck : atEdge && stuck;

      if (key === "ArrowUp") {
        if (!reached) return;
        let index = (current ? current.index : stops.length) - 1;
        // Already in the box (Edit question put it there): go past it.
        while (index >= 0 && stops[index] === box.value) index--;
        if (index < 0) return;
        browsing.current = {
          index,
          draft: current ? current.draft : box.value,
        };
        show(stops[index]);
        return;
      }

      if (!current || !reached) return;
      const index = current.index + 1;
      if (index >= stops.length) {
        browsing.current = null;
        recalled.current = null;
        setInput(current.draft);
      } else {
        browsing.current = { ...current, index };
        show(stops[index]);
      }
    });
  };

  return { onKeyDown };
}
