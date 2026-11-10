import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useQuestionHistory } from "./use-question-history";

function Composer({
  questions,
  initial = "",
  resetKey = "t-1",
}: {
  questions: string[];
  initial?: string;
  resetKey?: string;
}) {
  const [input, setInput] = useState(initial);
  const history = useQuestionHistory({ questions, input, setInput, resetKey });
  return (
    <>
      <textarea
        aria-label="Message"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          history.onKeyDown(e);
        }}
      />
      <button onClick={() => setInput("Edited question")}>Edit</button>
    </>
  );
}

const box = () => screen.getByRole<HTMLTextAreaElement>("textbox");

function caretAt(position: number) {
  box().setSelectionRange(position, position);
}

describe("useQuestionHistory", () => {
  it("Up in an empty box brings back the previous question, then older ones", async () => {
    render(<Composer questions={["First?", "Second?", "Third?"]} />);
    const user = userEvent.setup();
    await user.click(box());
    await user.keyboard("{ArrowUp}");
    expect(box()).toHaveValue("Third?");
    await user.keyboard("{ArrowUp}");
    expect(box()).toHaveValue("Second?");
    await user.keyboard("{ArrowUp}");
    expect(box()).toHaveValue("First?");
    // Nothing older: stays on the first question.
    await user.keyboard("{ArrowUp}");
    expect(box()).toHaveValue("First?");
  });

  it("Down walks forward and finally restores the draft", async () => {
    render(
      <Composer
        questions={["First?", "Second?"]}
        initial="half a thought"
      />,
    );
    const user = userEvent.setup();
    await user.click(box());
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(box()).toHaveValue("First?");
    await user.keyboard("{ArrowDown}");
    expect(box()).toHaveValue("Second?");
    await user.keyboard("{ArrowDown}");
    expect(box()).toHaveValue("half a thought");
  });

  it("leaves Down alone when not looking back through questions", () => {
    render(<Composer questions={["First?"]} />);
    const event = fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(event).toBe(true);
    expect(box()).toHaveValue("");
  });

  it("puts the caret at the end of a recalled question", async () => {
    render(<Composer questions={["What is Anvil?"]} />);
    const user = userEvent.setup();
    await user.click(box());
    await user.keyboard("{ArrowUp}");
    expect(box().selectionStart).toBe("What is Anvil?".length);
  });

  it("moves the caret as usual inside a multi-line question", () => {
    render(
      <Composer
        questions={["Earlier?"]}
        initial={"line one\nline two\nline three"}
      />,
    );
    // Caret on the middle line: neither Up nor Down is taken.
    caretAt("line one\nline".length);
    expect(fireEvent.keyDown(box(), { key: "ArrowUp" })).toBe(true);
    expect(fireEvent.keyDown(box(), { key: "ArrowDown" })).toBe(true);
    expect(box()).toHaveValue("line one\nline two\nline three");
  });

  it("recalls from the first line of a draft, and Down from its last line", () => {
    const draft = "line one\nline two";
    render(
      <Composer
        questions={["Earlier?"]}
        initial={draft}
      />,
    );
    caretAt(3);
    expect(fireEvent.keyDown(box(), { key: "ArrowUp" })).toBe(false);
    expect(box()).toHaveValue("Earlier?");
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(box()).toHaveValue(draft);
  });

  it("walks through a recalled multi-line question line by line before moving on", () => {
    render(<Composer questions={["Older?", "top\nbottom"]} />);
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    expect(box()).toHaveValue("top\nbottom");
    // The caret is at the end, on the last line, so Up moves within it.
    expect(fireEvent.keyDown(box(), { key: "ArrowUp" })).toBe(true);
    expect(box()).toHaveValue("top\nbottom");
    caretAt(1);
    fireEvent.keyDown(box(), { key: "ArrowUp" });
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
    expect(fireEvent.keyDown(box(), { key: "ArrowUp" })).toBe(true);
    expect(box()).toHaveValue("some text");
  });

  it("ignores arrows while an input method is composing", () => {
    render(<Composer questions={["Earlier?"]} />);
    expect(
      fireEvent.keyDown(box(), { key: "ArrowUp", isComposing: true }),
    ).toBe(true);
    expect(fireEvent.keyDown(box(), { key: "ArrowUp", keyCode: 229 })).toBe(
      true,
    );
    expect(box()).toHaveValue("");
  });

  it("ignores arrows with a modifier, which select or jump", () => {
    render(<Composer questions={["Earlier?"]} />);
    for (const mod of ["shiftKey", "altKey", "ctrlKey", "metaKey"]) {
      expect(fireEvent.keyDown(box(), { key: "ArrowUp", [mod]: true })).toBe(
        true,
      );
    }
    expect(box()).toHaveValue("");
  });

  it("does nothing when this conversation has no questions yet", () => {
    render(<Composer questions={[]} />);
    expect(fireEvent.keyDown(box(), { key: "ArrowUp" })).toBe(true);
    expect(box()).toHaveValue("");
  });

  it("stops looking back once the recalled question is edited", async () => {
    render(<Composer questions={["First?", "Second?"]} />);
    const user = userEvent.setup();
    await user.click(box());
    await user.keyboard("{ArrowUp}");
    await user.type(box(), " more");
    expect(box()).toHaveValue("Second? more");
    // Down no longer walks forward: the edit is the person's text now.
    expect(fireEvent.keyDown(box(), { key: "ArrowDown" })).toBe(true);
    expect(box()).toHaveValue("Second? more");
    // Up starts over from the newest question, keeping the edit as the draft.
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    expect(box()).toHaveValue("Second?");
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(box()).toHaveValue("Second? more");
  });

  it("stops looking back when something else fills the box, like Edit question", async () => {
    render(<Composer questions={["First?", "Second?"]} />);
    const user = userEvent.setup();
    await user.click(box());
    await user.keyboard("{ArrowUp}");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(box()).toHaveValue("Edited question");
    expect(fireEvent.keyDown(box(), { key: "ArrowDown" })).toBe(true);
    expect(box()).toHaveValue("Edited question");
  });

  it("starts over in another conversation", () => {
    const { rerender } = render(
      <Composer
        questions={["Old thread?"]}
        resetKey="t-1"
      />,
    );
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    expect(box()).toHaveValue("Old thread?");
    rerender(
      <Composer
        questions={["New thread?"]}
        resetKey="t-2"
      />,
    );
    // The old thread's question is the person's text now, kept as a draft.
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(box()).toHaveValue("Old thread?");
    caretAt(0);
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    expect(box()).toHaveValue("New thread?");
  });

  it("skips a question asked twice in a row", () => {
    render(<Composer questions={["A?", "B?", "B?"]} />);
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    expect(box()).toHaveValue("B?");
    caretAt(0);
    fireEvent.keyDown(box(), { key: "ArrowUp" });
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
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    expect(box()).toHaveValue("First?");
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(box()).toHaveValue("Stopped?");
  });
});
