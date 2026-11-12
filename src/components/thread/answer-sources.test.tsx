import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Message } from "@langchain/langgraph-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerSource } from "@/lib/answer-sources";
import { useStreamContext } from "@/providers/Stream";
import {
  ArtifactContent,
  ArtifactProvider,
  ArtifactTitle,
  useArtifactOpen,
} from "./artifact";
import { AnswerSources, SourceDetails } from "./answer-sources";

vi.mock("@/providers/Stream", () => ({ useStreamContext: vi.fn() }));

const GUIDE = "https://www.psc.edu/resources/bridges-2/user-guide/";

const docsResult = [
  'Retrieved 2 documentation excerpt(s) for "globus". Synthesize an answer from these excerpts and cite the source URLs.',
  `[1] source: ${GUIDE}\nUse Globus to move large files.`,
  "[2] source: https://docs.ncsa.illinois.edu/delta/transfer.html\nDelta's collection is NCSA Delta.",
].join("\n\n");

function threadWith(answerText: string): {
  messages: Message[];
  answer: Message;
} {
  const answer: Message = { id: "a2", type: "ai", content: answerText };
  return {
    answer,
    messages: [
      { id: "h1", type: "human", content: "How do I use Globus?" },
      {
        id: "a1",
        type: "ai",
        content: "",
        tool_calls: [{ id: "c1", name: "search_access_documents", args: {} }],
      },
      {
        id: "t1",
        type: "tool",
        tool_call_id: "c1",
        name: "search_access_documents",
        content: docsResult,
      },
      answer,
    ],
  };
}

function Slots() {
  const [open, close] = useArtifactOpen();
  return (
    <>
      <p>{open ? "panel open" : "panel closed"}</p>
      <button
        type="button"
        onClick={close}
      >
        Close panel
      </button>
      <ArtifactTitle />
      <ArtifactContent />
    </>
  );
}

function show(answerText: string, streaming = false) {
  const tree = (messages: Message[], answer: Message | null) => {
    vi.mocked(useStreamContext).mockReturnValue({ messages } as never);
    return (
      <ArtifactProvider>
        <Slots />
        {answer && (
          <AnswerSources
            message={answer}
            streaming={streaming}
          />
        )}
      </ArtifactProvider>
    );
  };
  const { messages, answer } = threadWith(answerText);
  const view = render(tree(messages, answer));
  return {
    /** Re-renders with a different answer, or none (a regenerate). */
    replaceAnswer(text: string | null) {
      if (text === null) {
        view.rerender(tree(messages.slice(0, -1), null));
        return;
      }
      const next = threadWith(text);
      view.rerender(tree(next.messages, next.answer));
    },
  };
}

const source = (passages: string[]): AnswerSource => ({
  key: "psc.edu/resources/bridges-2/user-guide",
  url: GUIDE,
  title: "Resources › Bridges 2 › User guide",
  chipLabel: "Bridges 2 › User guide",
  host: "www.psc.edu",
  linkText: null,
  passages,
});

const chip = () =>
  within(screen.getByRole("list", { name: "Sources" })).getByRole("button");

describe("AnswerSources", () => {
  beforeEach(() => vi.mocked(useStreamContext).mockReset());

  it("lists only the retrieved pages the answer links", () => {
    show(`Use Globus, see the [Bridges-2 user guide](${GUIDE}).`);

    const list = screen.getByRole("list", { name: "Sources" });
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("Bridges 2 › User guide");
    expect(items[0].textContent).toContain("www.psc.edu");
    expect(items[0].getAttribute("title")).toBe(
      "Resources › Bridges 2 › User guide",
    );
    expect(items[0].textContent).not.toContain("Bridges-2 user guide");
    expect(screen.queryByText(/NCSA Delta/)).toBeNull();
    expect(screen.getByText("panel closed")).toBeTruthy();
  });

  it("renders the panel title as a styled level-2 heading", () => {
    show(`See the [Bridges-2 user guide](${GUIDE}).`);

    fireEvent.click(chip());

    const heading = screen.getByRole("heading", { level: 2, name: "Source" });
    expect(heading.className).toContain("text-brand-dark");
    expect(heading.className).toContain("text-xl");
    expect(heading.className).toContain("font-bold");
  });

  it("opens the passage and a link to the page when a source is selected", () => {
    show(`See the [Bridges-2 user guide](${GUIDE}).`);

    fireEvent.click(chip());

    expect(screen.getByText("panel open")).toBeTruthy();
    // Named as the chip is, with the fuller name it was shortened from.
    expect(chip().textContent).toContain("Bridges 2 › User guide");
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Bridges 2 › User guide",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Resources › Bridges 2 › User guide", {
        selector: "p",
      }),
    ).toBeTruthy();
    expect(screen.getAllByText("www.psc.edu").length).toBeGreaterThan(0);
    expect(screen.getByText("Linked as: Bridges-2 user guide")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: /Bridges-2 user guide/ }),
    ).toBeNull();
    expect(screen.getByText("Use Globus to move large files.")).toBeTruthy();
    const open = screen.getByRole("link", { name: /Open page/ });
    expect(open.getAttribute("href")).toBe(GUIDE);
    expect(open.getAttribute("target")).toBe("_blank");
  });

  it("tells assistive tech which panel a chip opens, and moves focus there and back", () => {
    show(`See the [guide](${GUIDE}).`);
    const button = chip();
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);

    expect(button.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(
      button.getAttribute("aria-controls")!,
    );
    expect(panel).toBeTruthy();
    expect(panel!.contains(document.activeElement)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));

    expect(screen.getByText("panel closed")).toBeTruthy();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("closes the panel when the answer it came from is regenerated", () => {
    const view = show(`See the [guide](${GUIDE}).`);
    fireEvent.click(chip());
    expect(screen.getByText("panel open")).toBeTruthy();

    view.replaceAnswer(null);

    expect(screen.getByText("panel closed")).toBeTruthy();
  });

  it("closes the panel when the answer no longer cites that source", () => {
    const view = show(`See the [guide](${GUIDE}).`);
    fireEvent.click(chip());

    view.replaceAnswer(
      "See https://docs.ncsa.illinois.edu/delta/transfer.html instead.",
    );

    expect(screen.getByText("panel closed")).toBeTruthy();
    expect(screen.queryByText("Use Globus to move large files.")).toBeNull();
  });

  it("shows nothing when the answer links none of the documentation", () => {
    show("Globus is a file transfer service.");

    expect(screen.queryByRole("list", { name: "Sources" })).toBeNull();
    expect(screen.queryByText(/documentation/i)).toBeNull();
  });

  it("shows nothing for an answer from memory", () => {
    const answer: Message = {
      id: "a9",
      type: "ai",
      content: `Bridges-2 has four file spaces. $HOME is small and backed up, $PROJECT on Ocean holds your group's data and is not backed up, and $LOCAL is node-local scratch. See ${GUIDE}.`,
    };
    vi.mocked(useStreamContext).mockReturnValue({
      messages: [{ id: "h9", type: "human", content: "Tell me more" }, answer],
    } as never);
    const { container } = render(
      <ArtifactProvider>
        <AnswerSources
          message={answer}
          streaming={false}
        />
      </ArtifactProvider>,
    );
    expect(container.textContent).toBe("");
  });

  it("renders a passage's markdown under the panel's own headings", () => {
    const { container } = render(
      <SourceDetails
        source={source([
          '# Storage\n\n## File spaces\n\n**$HOME** is backed up. See [Globus](https://www.globus.org/).\n\n<img src=x onerror="alert(1)"><script>alert(1)</script>\n\n![Ocean layout](https://images.example/ocean.png)',
        ])}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "Excerpt" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 4, name: "Storage" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 5, name: "File spaces" }),
    ).toBeTruthy();
    expect(screen.getByText("$HOME").tagName).toBe("STRONG");

    const link = screen.getByRole("link", { name: "Globus" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.textContent).toContain("Globus (www.globus.org)");

    expect(container.querySelector("img, script")).toBeNull();
    const image = screen.getByRole("link", { name: /Image: Ocean layout/ });
    expect(image.getAttribute("href")).toBe("https://images.example/ocean.png");
    expect(image.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows dollar signs in a passage as written, not as math", () => {
    const passage =
      "Bridges-2 has $HOME on Jet, $PROJECT on Ocean, and `$LOCAL` per node.";
    const { container } = render(<SourceDetails source={source([passage])} />);
    const quote = container.querySelector("blockquote")!;
    expect(quote.textContent).toBe(passage.replace(/`/g, ""));
    expect(quote.querySelector(".katex")).toBeNull();
  });

  it("waits until the answer has finished", () => {
    show(`See the [guide](${GUIDE}).`, true);

    expect(screen.queryByRole("list", { name: "Sources" })).toBeNull();
  });
});
