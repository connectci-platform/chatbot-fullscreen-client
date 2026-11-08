import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Message } from "@langchain/langgraph-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStreamContext } from "@/providers/Stream";
import {
  ArtifactContent,
  ArtifactProvider,
  ArtifactTitle,
  useArtifactOpen,
} from "./artifact";
import { AnswerSources } from "./answer-sources";

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
  const [open] = useArtifactOpen();
  return (
    <>
      <p>{open ? "panel open" : "panel closed"}</p>
      <ArtifactTitle />
      <ArtifactContent />
    </>
  );
}

function show(answerText: string, streaming = false) {
  const { messages, answer } = threadWith(answerText);
  vi.mocked(useStreamContext).mockReturnValue({ messages } as never);
  render(
    <ArtifactProvider>
      <Slots />
      <AnswerSources
        message={answer}
        streaming={streaming}
      />
    </ArtifactProvider>,
  );
}

describe("AnswerSources", () => {
  beforeEach(() => vi.mocked(useStreamContext).mockReset());

  it("lists only the retrieved pages the answer links", () => {
    show(`Use Globus, see the [Bridges-2 user guide](${GUIDE}).`);

    const list = screen.getByRole("list", { name: "Sources" });
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("Bridges-2 user guide");
    expect(items[0].textContent).toContain("www.psc.edu");
    expect(screen.queryByText(/NCSA Delta/)).toBeNull();
    expect(screen.getByText("panel closed")).toBeTruthy();
  });

  it("opens the passage and a link to the page when a source is selected", () => {
    show(`See the [Bridges-2 user guide](${GUIDE}).`);

    fireEvent.click(
      screen.getByRole("button", { name: /Bridges-2 user guide/ }),
    );

    expect(screen.getByText("panel open")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Bridges-2 user guide" }),
    ).toBeTruthy();
    expect(screen.getByText("Use Globus to move large files.")).toBeTruthy();
    const open = screen.getByRole("link", { name: /Open page/ });
    expect(open.getAttribute("href")).toBe(GUIDE);
    expect(open.getAttribute("target")).toBe("_blank");
  });

  it("says when an answer that searched the documentation cites none of it", () => {
    show("Globus is a file transfer service.");

    expect(screen.queryByRole("list", { name: "Sources" })).toBeNull();
    expect(
      screen.getByText("This answer doesn't cite a documentation source."),
    ).toBeTruthy();
  });

  it("waits until the answer has finished", () => {
    show(`See the [guide](${GUIDE}).`, true);

    expect(screen.queryByRole("list", { name: "Sources" })).toBeNull();
    expect(screen.queryByText(/doesn't cite/)).toBeNull();
  });
});
