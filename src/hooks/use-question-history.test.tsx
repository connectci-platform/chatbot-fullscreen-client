import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { useQuestionHistory } from "./use-question-history";

type Move = (box: HTMLTextAreaElement, key: string) => void;

/**
 * What a browser does with Up and Down, for text whose lines are only its
 * "\n" lines: on the first (or last) line the caret goes to the start (or
 * end), otherwise to the same column on the line above (or below).
 */
const browserMove: Move = (box, key) => {
  const { value, selectionStart: at } = box;
  const lineStart = value.lastIndexOf("\n", at - 1) + 1;
  const column = at - lineStart;
  let to: number;
  if (key === "ArrowUp") {
    if (lineStart === 0) to = 0;
    else {
      const prevStart = value.lastIndexOf("\n", lineStart - 2) + 1;
      to = Math.min(prevStart + column, lineStart - 1);
    }
  } else {
    const lineEnd = value.indexOf("\n", at);
    if (lineEnd === -1) to = value.length;
    else {
      const nextEnd = value.indexOf("\n", lineEnd + 1);
      to = Math.min(
        lineEnd + 1 + column,
        nextEnd === -1 ? value.length : nextEnd,
      );
    }
  }
  box.setSelectionRange(to, to);
};

function Composer({
  questions,
  initial = "",
  resetKey = "t-1",
  move = browserMove,
}: {
  questions: string[];
  initial?: string;
  resetKey?: string;
  move?: Move;
}) {
  const [input, setInput] = useState(initial);
  const pressed = useRef<{ box: HTMLTextAreaElement; key: string } | null>(
    null,
  );
  const history = useQuestionHistory({
    questions,
    input,
    setInput,
    resetKey,
    // The browser's own move, then the hook's check, synchronously.
    afterNativeMove: (then) => {
      if (pressed.current) move(pressed.current.box, pressed.current.key);
      then();
    },
  });
  return (
    <>
      <textarea
        aria-label="Message"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          pressed.current = { box: e.currentTarget, key: e.key };
          history.onKeyDown(e);
        }}
      />
      <button onClick={() => setInput("Edited question")}>Edit</button>
    </>
  );
}

const box = () => screen.getByRole<HTMLTextAreaElement>("textbox");
const press = (key: "ArrowUp" | "ArrowDown", init = {}) =>
  fireEvent.keyDown(box(), { key, ...init });
const caretAt = (position: number) =>
  box().setSelectionRange(position, position);
const caret = () => box().selectionStart;

describe("useQuestionHistory", () => {
  it("Up in an empty box brings back the previous question, then older ones", () => {
    render(<Composer questions={["First?", "Second?", "Third?"]} />);
    press("ArrowUp");
    expect(box()).toHaveValue("Third?");
    press("ArrowUp");
    expect(box()).toHaveValue("Second?");
    press("ArrowUp");
    expect(box()).toHaveValue("First?");
    // Nothing older: stays on the first question.
    press("ArrowUp");
    expect(box()).toHaveValue("First?");
  });

  it("Down walks forward and finally restores the draft", () => {
    render(
      <Composer
        questions={["First?", "Second?"]}
        initial="half a thought"
      />,
    );
    caretAt(0);
    press("ArrowUp");
    press("ArrowUp");
    expect(box()).toHaveValue("First?");
    press("ArrowDown");
    expect(box()).toHaveValue("Second?");
    press("ArrowDown");
    expect(box()).toHaveValue("half a thought");
  });

  it("leaves Down alone when not looking back through questions", () => {
    render(<Composer questions={["First?"]} />);
    press("ArrowDown");
    expect(box()).toHaveValue("");
  });

  it("puts the caret at the end of a recalled question", () => {
    render(<Composer questions={["What is Anvil?"]} />);
    press("ArrowUp");
    expect(caret()).toBe("What is Anvil?".length);
  });

  it("first moves a draft's caret to its start, and only recalls on the next Up", () => {
    render(
      <Composer
        questions={["Earlier?"]}
        initial="a draft"
      />,
    );
    caretAt("a draft".length);
    press("ArrowUp");
    expect(box()).toHaveValue("a draft");
    expect(caret()).toBe(0);
    press("ArrowUp");
    expect(box()).toHaveValue("Earlier?");
  });

  it("walks up a draft that wraps onto several lines without replacing it", () => {
    // One long line, wrapped by the box's width: each Up moves the caret up
    // a visual line, though there's no "\n" before it.
    const draft = "word ".repeat(44).trim();
    const wrapped: Move = (el, key) => {
      if (key !== "ArrowUp") return browserMove(el, key);
      const to = Math.max(0, el.selectionStart - 80);
      el.setSelectionRange(to, to);
    };
    render(
      <Composer
        questions={["Earlier?"]}
        initial={draft}
        move={wrapped}
      />,
    );
    caretAt(draft.length - 3);
    press("ArrowUp");
    press("ArrowUp");
    expect(box()).toHaveValue(draft);
    press("ArrowUp");
    expect(caret()).toBe(0);
    expect(box()).toHaveValue(draft);
    press("ArrowUp");
    expect(box()).toHaveValue("Earlier?");
    press("ArrowDown");
    expect(box()).toHaveValue(draft);
  });

  it("moves the caret as usual inside a multi-line draft", () => {
    const draft = "line one\nline two\nline three";
    render(
      <Composer
        questions={["Earlier?"]}
        initial={draft}
      />,
    );
    caretAt("line one\nline".length);
    press("ArrowUp");
    expect(box()).toHaveValue(draft);
    expect(caret()).toBe(4);
    press("ArrowDown");
    press("ArrowDown");
    expect(box()).toHaveValue(draft);
  });

  it("walks through a recalled multi-line question line by line before moving on", () => {
    render(<Composer questions={["Older?", "top\nbottom"]} />);
    press("ArrowUp");
    expect(box()).toHaveValue("top\nbottom");
    // The caret is at the end, so Up first moves it to the line above.
    press("ArrowUp");
    expect(box()).toHaveValue("top\nbottom");
    press("ArrowUp");
    expect(box()).toHaveValue("Older?");
  });

  it("leaves a selection alone", () => {
    render(
      <Composer
        questions={["Earlier?"]}
        initial="some text"
      />,
    );
    box().setSelectionRange(0, 4);
    press("ArrowUp");
    expect(box()).toHaveValue("some text");
  });

  it("ignores arrows while an input method is composing", () => {
    render(<Composer questions={["Earlier?"]} />);
    press("ArrowUp", { isComposing: true });
    press("ArrowUp", { keyCode: 229 });
    expect(box()).toHaveValue("");
  });

  it("ignores arrows with a modifier, which select or jump", () => {
    render(<Composer questions={["Earlier?"]} />);
    for (const mod of ["shiftKey", "altKey", "ctrlKey", "metaKey"]) {
      press("ArrowUp", { [mod]: true });
    }
    expect(box()).toHaveValue("");
  });

  it("does nothing when this conversation has no questions yet", () => {
    render(<Composer questions={[]} />);
    press("ArrowUp");
    expect(box()).toHaveValue("");
  });

  it("stops looking back once the recalled question is edited", async () => {
    render(<Composer questions={["First?", "Second?"]} />);
    press("ArrowUp");
    const user = userEvent.setup();
    await user.type(box(), " more");
    expect(box()).toHaveValue("Second? more");
    // Down no longer walks forward: the edit is the person's text now.
    press("ArrowDown");
    expect(box()).toHaveValue("Second? more");
    // Up starts over from the newest question, keeping the edit as the draft.
    caretAt(0);
    press("ArrowUp");
    expect(box()).toHaveValue("Second?");
    press("ArrowDown");
    expect(box()).toHaveValue("Second? more");
  });

  it("stops looking back when something else fills the box, like Edit question", () => {
    render(<Composer questions={["First?", "Second?"]} />);
    press("ArrowUp");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(box()).toHaveValue("Edited question");
    press("ArrowDown");
    expect(box()).toHaveValue("Edited question");
  });

  it("starts over in another conversation", () => {
    const { rerender } = render(
      <Composer
        questions={["Old thread?"]}
        resetKey="t-1"
      />,
    );
    press("ArrowUp");
    expect(box()).toHaveValue("Old thread?");
    rerender(
      <Composer
        questions={["New thread?"]}
        resetKey="t-2"
      />,
    );
    // The old thread's question is the person's text now, kept as a draft.
    press("ArrowDown");
    expect(box()).toHaveValue("Old thread?");
    caretAt(0);
    press("ArrowUp");
    expect(box()).toHaveValue("New thread?");
  });

  it("skips a question asked twice in a row", () => {
    render(<Composer questions={["A?", "B?", "B?"]} />);
    press("ArrowUp");
    expect(box()).toHaveValue("B?");
    press("ArrowUp");
    expect(box()).toHaveValue("A?");
  });

  it("goes past a question that's already in the box, as after Edit question", () => {
    render(
      <Composer
        questions={["First?", "Stopped?"]}
        initial="Stopped?"
      />,
    );
    caretAt(0);
    press("ArrowUp");
    expect(box()).toHaveValue("First?");
    press("ArrowDown");
    expect(box()).toHaveValue("Stopped?");
  });
});
