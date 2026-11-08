import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import { answerSources, linksIn, parsePassages } from "./answer-sources";

// Mirrors access-agent's _format_chunks in src/agent/tools/access_documents.py.
const docsResult = [
  'Retrieved 3 documentation excerpt(s) for "how do I use globus". Synthesize an answer from these excerpts and cite the source URLs. If none are actually relevant to the question, say so plainly.',
  "[1] source: https://www.psc.edu/resources/bridges-2/user-guide/\nUse Globus to move large files.\n\nSign in with your ACCESS ID.",
  "[2] source: https://docs.ncsa.illinois.edu/systems/delta/en/latest/transfer.html\nDelta's Globus collection is NCSA Delta.",
  "[3] source: (no source URL)\nAn excerpt with no page.",
].join("\n\n");

const human = (id: string, text: string): Message => ({
  id,
  type: "human",
  content: text,
});

const call = (id: string, toolCallId: string, name: string): Message => ({
  id,
  type: "ai",
  content: "",
  tool_calls: [{ id: toolCallId, name, args: {} }],
});

const result = (
  id: string,
  toolCallId: string,
  name: string,
  content: string,
): Message => ({ id, type: "tool", tool_call_id: toolCallId, name, content });

const answer = (id: string, text: string): Message => ({
  id,
  type: "ai",
  content: text,
});

describe("parsePassages", () => {
  it("reads each excerpt with the page it came from, verbatim", () => {
    expect(parsePassages(docsResult)).toEqual([
      {
        url: "https://www.psc.edu/resources/bridges-2/user-guide/",
        text: "Use Globus to move large files.\n\nSign in with your ACCESS ID.",
      },
      {
        url: "https://docs.ncsa.illinois.edu/systems/delta/en/latest/transfer.html",
        text: "Delta's Globus collection is NCSA Delta.",
      },
    ]);
  });

  it("reads results after a scope note", () => {
    const scoped =
      "(Note: documentation could not be scoped to the requested resource; showing general ACCESS results.)\n\n" +
      docsResult;
    expect(parsePassages(scoped)).toHaveLength(2);
  });

  it("finds nothing in an empty search, an error or the XDMoD summary", () => {
    expect(
      parsePassages(
        "Documentation search returned no excerpts for that query.",
      ),
    ).toEqual([]);
    expect(parsePassages('{"error": "Documentation search failed"}')).toEqual(
      [],
    );
  });
});

describe("linksIn", () => {
  it("finds markdown links and bare URLs in the order they appear", () => {
    expect(
      linksIn(
        "See the [Bridges-2 guide](https://www.psc.edu/resources/bridges-2/user-guide/) or https://example.org/a.html.",
      ),
    ).toEqual([
      {
        label: "Bridges-2 guide",
        url: "https://www.psc.edu/resources/bridges-2/user-guide/",
      },
      { label: null, url: "https://example.org/a.html" },
    ]);
  });

  it("ignores links that are not web pages", () => {
    expect(linksIn("[mail](mailto:help@access-ci.org)")).toEqual([]);
  });
});

describe("answerSources", () => {
  const thread = (text: string): Message[] => [
    human("h1", "How do I use Globus?"),
    call("a1", "c1", "search_access_documents"),
    result("t1", "c1", "search_access_documents", docsResult),
    answer("a2", text),
  ];

  it("shows a page the answer links, with the passages retrieved from it", () => {
    const messages = thread(
      "Use Globus ([Bridges-2 user guide](https://www.psc.edu/resources/bridges-2/user-guide#globus)).",
    );
    expect(answerSources(messages, messages[3])).toEqual({
      sources: [
        {
          url: "https://www.psc.edu/resources/bridges-2/user-guide#globus",
          label: "Bridges-2 user guide",
          host: "www.psc.edu",
          passages: [
            "Use Globus to move large files.\n\nSign in with your ACCESS ID.",
          ],
        },
      ],
      citesNoSource: false,
    });
  });

  it("never shows a retrieved page the answer does not link", () => {
    const messages = thread(
      "See https://docs.ncsa.illinois.edu/systems/delta/en/latest/transfer.html",
    );
    const sources = answerSources(messages, messages[3])!.sources;
    expect(sources.map((s) => s.host)).toEqual(["docs.ncsa.illinois.edu"]);
    expect(sources[0].label).toBe("/systems/delta/en/latest/transfer.html");
  });

  it("shows only the passages from the section the answer links, when it has them", () => {
    const page = "https://www.psc.edu/resources/bridges-2/user-guide/";
    const sections = [
      "Retrieved 3 documentation excerpt(s).",
      `[1] source: ${page}#file-spaces\nFile spaces passage.`,
      `[2] source: ${page}#software\nSoftware passage.`,
      `[3] source: ${page}#file-spaces\nAnother file spaces passage.`,
    ].join("\n\n");
    const messages = [
      human("h1", "Where do I put data?"),
      call("a1", "c1", "search_access_documents"),
      result("t1", "c1", "search_access_documents", sections),
      answer("a2", `See ${page}#file-spaces and [software](${page}#modules).`),
    ];
    const [source] = answerSources(messages, messages[3])!.sources;
    expect(source.passages).toEqual([
      "File spaces passage.",
      "Another file spaces passage.",
    ]);

    // A section no search returned: every passage from the page is shown.
    messages[3] = answer("a2", `See [software](${page}#modules).`);
    expect(answerSources(messages, messages[3])!.sources[0].passages).toEqual([
      "File spaces passage.",
      "Software passage.",
      "Another file spaces passage.",
    ]);
  });

  it("never shows a linked page that no search retrieved", () => {
    const messages = thread("See https://example.org/made-up.");
    expect(answerSources(messages, messages[3])).toEqual({
      sources: [],
      citesNoSource: true,
    });
  });

  it("lists a page once even when the answer links it twice", () => {
    const url = "https://www.psc.edu/resources/bridges-2/user-guide/";
    const messages = thread(`[guide](${url}) and again [here](${url})`);
    expect(answerSources(messages, messages[3])!.sources).toHaveLength(1);
  });

  it("uses passages from earlier in the conversation", () => {
    const messages = [
      ...thread("First answer."),
      human("h2", "Tell me more about Bridges-2"),
      answer(
        "a3",
        "More in the [guide](https://www.psc.edu/resources/bridges-2/user-guide/).",
      ),
    ];
    const sources = answerSources(messages, messages[5])!;
    expect(sources.sources).toHaveLength(1);
    expect(sources.citesNoSource).toBe(false);
  });

  it("ignores passages retrieved after the answer", () => {
    const messages = [
      human("h1", "Hi"),
      answer("a1", "See https://www.psc.edu/resources/bridges-2/user-guide/"),
      call("a2", "c1", "search_access_documents"),
      result("t1", "c1", "search_access_documents", docsResult),
    ];
    expect(answerSources(messages, messages[1])!.sources).toEqual([]);
  });

  it("does not flag an answer drawn from live tool data", () => {
    const messages = [
      human("h1", "Is GROMACS on Delta?"),
      call("a1", "c1", "search_software"),
      result("t1", "c1", "search_software", '{"items": []}'),
      answer("a2", "Yes, GROMACS is on Delta."),
    ];
    expect(answerSources(messages, messages[3])).toEqual({
      sources: [],
      citesNoSource: false,
    });
  });

  it("flags an answer that used no tools at all", () => {
    const messages = [
      human("h1", "What is ACCESS?"),
      answer("a1", "ACCESS is an NSF program."),
    ];
    expect(answerSources(messages, messages[1])!.citesNoSource).toBe(true);
  });

  it("has nothing to say about a message that calls a tool", () => {
    const messages = thread("x");
    expect(answerSources(messages, messages[1])).toBeNull();
  });

  it("has nothing to say about a message with no text", () => {
    const messages = thread("");
    expect(answerSources(messages, messages[3])).toBeNull();
  });
});
