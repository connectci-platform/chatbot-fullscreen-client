import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Message } from "@langchain/langgraph-sdk";

type Content = Exclude<Message["content"], string>;

/**
 * A question's text and non-text blocks. Confirm blocks are left out unless
 * `keepConfirm` is set: they are a click on a card, so only an exact Retry
 * of that click may resend them. Edit and restore put the blocks in the
 * message box, where whatever is typed next would go out with them.
 */
export function questionParts(
  message: Message,
  { keepConfirm = false }: { keepConfirm?: boolean } = {},
): {
  text: string;
  blocks: Content;
} {
  const { content } = message;
  if (typeof content === "string") return { text: content, blocks: [] };
  return {
    text: content.map((b) => (b.type === "text" ? b.text : "")).join(""),
    blocks: content.filter(
      (b) =>
        b.type !== "text" && (keepConfirm || (b.type as string) !== "confirm"),
    ),
  };
}

/**
 * Puts a question back in the message box when its Turnstile check fails, so
 * the person can send it again. Sending is the deliberate retry: nothing goes
 * out by itself. If a sign-in sends the question instead, the box is cleared
 * so it can't be sent twice.
 */
export function useRestoreQuestion<Block>({
  failed,
  input,
  getQuestion,
  setInput,
  setBlocks,
}: {
  failed: boolean;
  input: string;
  getQuestion: () => Message | null;
  setInput: Dispatch<SetStateAction<string>>;
  setBlocks: Dispatch<SetStateAction<Block[]>>;
}) {
  const restored = useRef<string | null>(null);

  useEffect(() => {
    if (failed) {
      const question = getQuestion();
      if (restored.current !== null || !question) return;
      const { text, blocks } = questionParts(question);
      restored.current = text;
      setInput((prev) => prev || text);
      setBlocks((prev) => (prev.length ? prev : (blocks as Block[])));
      return;
    }
    if (restored.current === null) return;
    if (input === restored.current) {
      setInput("");
      setBlocks([]);
    }
    restored.current = null;
    // Runs on the change of state, not on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);
}
