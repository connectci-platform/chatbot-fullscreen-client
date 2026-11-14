import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Message } from "@langchain/langgraph-sdk";
import {
  isAttachmentRef,
  isTypedText,
  toResendBlocks,
} from "@/lib/upload-blocks";

type Content = Exclude<Message["content"], string>;

/**
 * A question's typed text and non-text blocks. A stored upload comes back as
 * a bare `{type: "attachment", id}` reference, so a resend never carries the
 * file again; a file still in the question as sent (one the agent hasn't
 * stored, such as after a failed Turnstile check) comes back as it is. The
 * agent's "[Not shared: ...]" notes are left out.
 *
 * Confirm blocks are left out unless `keepConfirm` is set: they are a click
 * on a card, so only an exact Retry of that click may resend them. Edit and
 * restore put the blocks in the message box, where whatever is typed next
 * would go out with them.
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
    text: content
      .filter(isTypedText)
      .map((b) => b.text)
      .join(""),
    blocks: content.flatMap((b): Content => {
      if (b.type === "text") return [];
      if (isAttachmentRef(b)) return toResendBlocks([b]) as Content;
      if (!keepConfirm && (b.type as string) === "confirm") return [];
      return [b];
    }),
  };
}

/**
 * Puts a question back in the message box when its Turnstile check fails, so
 * the person can send it again. Sending is the deliberate retry: nothing goes
 * out by itself. If a sign-in sends the question instead, the box is cleared
 * so it can't be sent twice. A sign-in only sends it while the box still holds
 * exactly what was put back (`registerResendGuard` tells the sender): once the
 * person has changed the text or the files, what they see is what they meant to
 * send, so nothing is resent behind their back.
 */
export function useRestoreQuestion<Block>({
  failed,
  input,
  blocks,
  getQuestion,
  setInput,
  setBlocks,
  registerResendGuard,
}: {
  failed: boolean;
  input: string;
  blocks: Block[];
  getQuestion: () => Message | null;
  setInput: Dispatch<SetStateAction<string>>;
  setBlocks: Dispatch<SetStateAction<Block[]>>;
  registerResendGuard?: (guard: (() => boolean) | null) => void;
}) {
  const restored = useRef<{ text: string; blocks: Block[] } | null>(null);
  // The guard is called between renders, so it reads the latest box.
  const box = useRef({ input, blocks });
  box.current = { input, blocks };

  const unchanged = () => {
    const was = restored.current;
    if (!was) return false;
    const now = box.current;
    return (
      now.input === was.text &&
      now.blocks.length === was.blocks.length &&
      now.blocks.every((b, i) => b === was.blocks[i])
    );
  };

  useEffect(() => {
    if (failed) {
      const question = getQuestion();
      if (restored.current !== null || !question) return;
      const { text, blocks: questionBlocks } = questionParts(question);
      restored.current = { text, blocks: questionBlocks as Block[] };
      registerResendGuard?.(unchanged);
      setInput((prev) => prev || text);
      setBlocks((prev) => (prev.length ? prev : (questionBlocks as Block[])));
      return;
    }
    if (restored.current === null) return;
    if (unchanged()) {
      setInput("");
      setBlocks([]);
    }
    restored.current = null;
    registerResendGuard?.(null);
    // Runs on the change of state, not on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);
}
