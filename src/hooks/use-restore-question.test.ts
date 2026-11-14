import { renderHook } from "@testing-library/react";
import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it, vi } from "vitest";
import { questionParts, useRestoreQuestion } from "./use-restore-question";

const image = { type: "image", source_type: "base64" };
const question = {
  id: "m1",
  type: "human",
  content: [{ type: "text", text: "hello" }, image],
} as unknown as Message;

function setup(initial: {
  failed: boolean;
  input?: string;
  question?: Message | null;
}) {
  const setInput = vi.fn();
  const setBlocks = vi.fn();
  const hook = renderHook(
    (props: { failed: boolean; input: string }) =>
      useRestoreQuestion({
        failed: props.failed,
        input: props.input,
        getQuestion: () =>
          initial.question === undefined ? question : initial.question,
        setInput,
        setBlocks,
      }),
    { initialProps: { failed: initial.failed, input: initial.input ?? "" } },
  );
  return { ...hook, setInput, setBlocks };
}

const applied = <T>(setter: ReturnType<typeof vi.fn>, previous: T) =>
  (setter.mock.calls[0][0] as (prev: T) => T)(previous);

describe("useRestoreQuestion", () => {
  it("does nothing until the check has failed", () => {
    const { setInput, setBlocks } = setup({ failed: false });
    expect(setInput).not.toHaveBeenCalled();
    expect(setBlocks).not.toHaveBeenCalled();
  });

  it("puts the question and its attachments back", () => {
    const { setInput, setBlocks } = setup({ failed: true });
    expect(applied(setInput, "")).toBe("hello");
    expect(applied(setBlocks, [])).toEqual([image]);
  });

  it("restores a plain string question", () => {
    const { setInput } = setup({
      failed: true,
      question: { id: "m", type: "human", content: "plain" } as Message,
    });
    expect(applied(setInput, "")).toBe("plain");
  });

  it("doesn't overwrite what the person typed meanwhile", () => {
    const { setInput, setBlocks } = setup({ failed: true });
    expect(applied(setInput, "typed")).toBe("typed");
    expect(applied(setBlocks, [image, image])).toEqual([image, image]);
  });

  it("restores once, not on every render", () => {
    const { rerender, setInput } = setup({ failed: true });
    rerender({ failed: true, input: "hello" });
    expect(setInput).toHaveBeenCalledOnce();
  });

  it("has nothing to restore without a question", () => {
    const { setInput } = setup({ failed: true, question: null });
    expect(setInput).not.toHaveBeenCalled();
  });

  it("clears the box when a sign-in sends the question after all", () => {
    const { rerender, setInput, setBlocks } = setup({ failed: true });
    rerender({ failed: true, input: "hello" });
    setInput.mockClear();
    setBlocks.mockClear();

    rerender({ failed: false, input: "hello" });

    expect(setInput).toHaveBeenCalledWith("");
    expect(setBlocks).toHaveBeenCalledWith([]);
  });

  it("keeps an edited question when the check clears", () => {
    const { rerender, setInput } = setup({ failed: true });
    setInput.mockClear();

    rerender({ failed: false, input: "edited" });

    expect(setInput).not.toHaveBeenCalled();
  });

  it("restores again on a later failure", () => {
    const { rerender, setInput } = setup({ failed: true });
    rerender({ failed: false, input: "" });
    setInput.mockClear();

    rerender({ failed: true, input: "" });

    expect(setInput).toHaveBeenCalledOnce();
  });
});

describe("confirm blocks", () => {
  const confirm = { type: "confirm", preview_ids: ["a".repeat(32)] };
  const confirmed = {
    id: "m2",
    type: "human",
    content: [{ type: "text", text: "Confirm" }, confirm, image],
  } as unknown as Message;

  it("questionParts leaves them out, as Edit uses it", () => {
    expect(questionParts(confirmed)).toEqual({
      text: "Confirm",
      blocks: [image],
    });
  });

  it("questionParts keeps them for Retry, which resends the same click", () => {
    expect(questionParts(confirmed, { keepConfirm: true }).blocks).toEqual([
      confirm,
      image,
    ]);
  });

  it("restore after a failed check doesn't carry them", () => {
    const { setBlocks } = setup({ failed: true, question: confirmed });
    expect(applied(setBlocks, [])).toEqual([image]);
  });
});
