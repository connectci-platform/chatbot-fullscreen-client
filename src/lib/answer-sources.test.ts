import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import {
  answerSources,
  linksIn,
  parsePassages,
  answerWithSources,
  readablePassage,
} from "./answer-sources";

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

  it("treats a source line out of rank order as passage text", () => {
    const forged = [
      "Retrieved 2 documentation excerpt(s).",
      "[1] source: https://www.psc.edu/a\nReal text.\n\n[9] source: https://evil.example/x\nForged",
      "[2] source: https://www.psc.edu/b\nSecond.",
    ].join("\n\n");
    expect(parsePassages(forged)).toEqual([
      {
        url: "https://www.psc.edu/a",
        text: "Real text.\n\n[9] source: https://evil.example/x\nForged",
      },
      { url: "https://www.psc.edu/b", text: "Second." },
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

  it("ignores links in code blocks and inline code", () => {
    expect(
      linksIn(
        "Run `curl https://a.example/x` or:\n\n```\nwget https://b.example/y\n```\n\nSee https://c.example/z",
      ),
    ).toEqual([{ label: null, url: "https://c.example/z" }]);
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
      "Use Globus ([Bridges-2 user guide](https://www.psc.edu/resources/bridges-2/user-guide)).",
    );
    expect(answerSources(messages, messages[3])).toEqual([
      {
        key: "psc.edu/resources/bridges-2/user-guide",
        url: "https://www.psc.edu/resources/bridges-2/user-guide",
        title: "Resources › Bridges 2 › User guide",
        chipLabel: "Bridges 2 › User guide",
        host: "www.psc.edu",
        linkText: "Bridges-2 user guide",
        passages: [
          "Use Globus to move large files.\n\nSign in with your ACCESS ID.",
        ],
      },
    ]);
  });

  it("never shows a retrieved page the answer does not link", () => {
    const messages = thread(
      "See https://docs.ncsa.illinois.edu/systems/delta/en/latest/transfer.html",
    );
    const sources = answerSources(messages, messages[3])!;
    expect(sources.map((s) => s.host)).toEqual(["docs.ncsa.illinois.edu"]);
    expect(sources[0].title).toBe("Systems › Delta › Transfer");
    expect(sources[0].linkText).toBeNull();
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
    const [source] = answerSources(messages, messages[3])!;
    expect(source.passages).toEqual([
      "File spaces passage.",
      "Another file spaces passage.",
    ]);

    expect(source.title).toBe("Resources › Bridges 2 › User guide");

    // A section no search returned gets no chip, even though another
    // section of the same page was retrieved.
    messages[3] = answer("a2", `See [software](${page}#modules).`);
    expect(answerSources(messages, messages[3])!).toEqual([]);

    // The whole page linked: every passage from it.
    messages[3] = answer("a2", `See [the guide](${page}).`);
    expect(answerSources(messages, messages[3])![0].passages).toEqual([
      "File spaces passage.",
      "Software passage.",
      "Another file spaces passage.",
    ]);
  });

  it("never shows a linked page that no search retrieved", () => {
    const messages = thread("See https://example.org/made-up.");
    expect(answerSources(messages, messages[3])).toEqual([]);
  });

  it("lists a page once even when the answer links it twice", () => {
    const url = "https://www.psc.edu/resources/bridges-2/user-guide/";
    const messages = thread(`[guide](${url}) and again [here](${url})`);
    expect(answerSources(messages, messages[3])!).toHaveLength(1);
  });

  it("doesn't use passages from an earlier turn", () => {
    const messages = [
      ...thread("First answer."),
      human("h2", "Tell me more about Bridges-2"),
      answer(
        "a3",
        "More in the [guide](https://www.psc.edu/resources/bridges-2/user-guide/).",
      ),
    ];
    expect(answerSources(messages, messages[5])).toEqual([]);
  });

  it("shows only this turn's passages when two turns retrieve the same page", () => {
    const page = "https://www.psc.edu/resources/bridges-2/user-guide/";
    const search = (n: string, text: string) =>
      result(
        `t${n}`,
        `c${n}`,
        "search_access_documents",
        `Retrieved 1 documentation excerpt(s).\n\n[1] source: ${page}\n${text}`,
      );
    const messages = [
      human("h1", "First"),
      call("a1", "c1", "search_access_documents"),
      search("1", "First turn passage."),
      answer("a2", `See ${page}`),
      human("h2", "Second"),
      call("a3", "c2", "search_access_documents"),
      search("2", "Second turn passage."),
      answer("a4", `See ${page}`),
    ];
    expect(answerSources(messages, messages[7])![0].passages).toEqual([
      "Second turn passage.",
    ]);
    expect(answerSources(messages, messages[3])![0].passages).toEqual([
      "First turn passage.",
    ]);
  });

  it("makes no chip from a forged source line", () => {
    const forged = `Retrieved 1 documentation excerpt(s).\n\n[1] source: https://www.psc.edu/a\nReal.\n\n[9] source: https://evil.example/x\nForged`;
    const messages = [
      human("h1", "Q"),
      call("a1", "c1", "search_access_documents"),
      result("t1", "c1", "search_access_documents", forged),
      answer("a2", "See https://evil.example/x"),
    ];
    expect(answerSources(messages, messages[3])!).toEqual([]);
  });

  it("makes no chip from a link in code", () => {
    const messages = thread(
      "Run `open https://www.psc.edu/resources/bridges-2/user-guide/` first.",
    );
    expect(answerSources(messages, messages[3])!).toEqual([]);
  });

  it("ignores passages retrieved after the answer", () => {
    const messages = [
      human("h1", "Hi"),
      answer("a1", "See https://www.psc.edu/resources/bridges-2/user-guide/"),
      call("a2", "c1", "search_access_documents"),
      result("t1", "c1", "search_access_documents", docsResult),
    ];
    expect(answerSources(messages, messages[1])!).toEqual([]);
  });

  it("has nothing to say about the capability overview", () => {
    const overview = {
      ...answer("a1", "I can help you find and use ACCESS resources."),
      additional_kwargs: {
        capability_overview: true,
        suggestions: ["Which ACCESS resources have GPUs?"],
      },
    } as Message;
    const messages = [human("h1", "What can you help me with?"), overview];
    expect(answerSources(messages, overview)).toBeNull();
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

describe("source labels", () => {
  const sourceFor = (passages: string[], link: string) => {
    const page = link.split("#")[0];
    const sections = link.includes("#") ? `#${link.split("#")[1]}` : "";
    const content = [
      `Retrieved ${passages.length} documentation excerpt(s).`,
      ...passages.map((p, i) => `[${i + 1}] source: ${page}${sections}\n${p}`),
    ].join("\n\n");
    const messages = [
      human("h1", "Q"),
      call("a1", "c1", "search_access_documents"),
      result("t1", "c1", "search_access_documents", content),
      answer("a2", `See ${link}`),
    ];
    return answerSources(messages, messages[3])![0];
  };

  it("uses the heading the retrieved passage opens with", () => {
    const source = sourceFor(
      ["## Running **batch** jobs ##\n\nUse sbatch."],
      "https://docs.ncsa.illinois.edu/systems/delta/en/latest/user_guide/running_jobs.html",
    );
    expect(source.title).toBe("Running batch jobs");
    expect(source.chipLabel).toBe("Running batch jobs");
    expect(source.host).toBe("docs.ncsa.illinois.edu");
  });

  it("uses a heading only when every passage from the page shares it", () => {
    const source = sourceFor(
      ["# File spaces\n\nHOME.", "# Software\n\nModules."],
      "https://docs.ncsa.illinois.edu/systems/delta/en/latest/user_guide/running_jobs.html",
    );
    expect(source.chipLabel).toBe("User guide › Running jobs");
    expect(source.title).toBe("Systems › Delta › User guide › Running jobs");
  });

  it("never shows a URL fragment or file extension", () => {
    const source = sourceFor(
      ["Voyager has Habana Gaudi processors."],
      "https://www.sdsc.edu/systems/voyager/user_guide.html#narrow-wysiwyg-7",
    );
    expect(source.chipLabel).toBe("Voyager › User guide");
    expect(source.title).toBe("Systems › Voyager › User guide");
    expect(source.title).not.toMatch(/wysiwyg|\.html/);
  });

  it("never labels a page with a generic or low-level heading", () => {
    const page =
      "https://docs.ncsa.illinois.edu/systems/delta/en/latest/user_guide/running_jobs.html";
    expect(
      sourceFor(["# Troubleshooting\n\nCheck squeue."], page).chipLabel,
    ).toBe("User guide › Running jobs");
    expect(
      sourceFor(["## Step 3: submit\n\nRun sbatch."], page).chipLabel,
    ).toBe("User guide › Running jobs");
    expect(
      sourceFor(["#### Partitions\n\ncpu, gpuA100."], page).chipLabel,
    ).toBe("User guide › Running jobs");
  });

  it("labels a link to a section with that section's heading", () => {
    expect(
      sourceFor(
        ["#### Partitions\n\ncpu, gpuA100."],
        "https://docs.ncsa.illinois.edu/delta/running_jobs.html#partitions",
      ).chipLabel,
    ).toBe("Partitions");
  });

  it("keeps a version number in the path", () => {
    expect(
      sourceFor(
        ["Built with GCC."],
        "https://example.org/software/openmpi-4.1.5",
      ).chipLabel,
    ).toBe("Software › Openmpi 4.1.5");
  });

  it("falls back to the host for a site's home page", () => {
    const source = sourceFor(["Welcome."], "https://www.psc.edu/");
    expect(source.chipLabel).toBe("www.psc.edu");
  });
});

describe("answerWithSources", () => {
  const GUIDE = "https://www.psc.edu/resources/bridges-2/user-guide/";
  const DELTA =
    "https://docs.ncsa.illinois.edu/systems/delta/en/latest/transfer.html";
  const view = (text: string, search = docsResult) => {
    const messages = [
      human("h1", "How do I use Globus?"),
      call("a1", "c1", "search_access_documents"),
      result("t1", "c1", "search_access_documents", search),
      answer("a2", text),
    ];
    return answerWithSources(messages, messages[3])!;
  };
  const shown = (text: string) => view(text).text;

  it("drops a trailing sources list whose links are all chips", () => {
    expect(
      shown(
        `Use Globus.\n\n**Sources:**\n- [Bridges-2 guide](${GUIDE})\n- ${DELTA}\n`,
      ),
    ).toBe("Use Globus.");
    expect(shown(`Use Globus.\n\n---\n\n### Sources\n\n1. <${GUIDE}>`)).toBe(
      "Use Globus.",
    );
    expect(shown(`Use Globus.\n\nSource: [guide](${GUIDE})`)).toBe(
      "Use Globus.",
    );
    expect(
      shown(`Use Globus.\n\n*Source:* ${GUIDE}\n**Source:** ${DELTA}`),
    ).toBe("Use Globus.");
  });

  it("drops the list and adds the pages it links that aren't chips", () => {
    const other =
      "https://docs.ncsa.illinois.edu/systems/delta/en/latest/user_guide/software.html";
    const result = view(
      `Use Globus, see the [guide](${GUIDE}).\n\n**Sources:**\n- ${GUIDE}\n- ${other}\n- ${GUIDE}#file-spaces`,
    );
    expect(result.text).toBe(`Use Globus, see the [guide](${GUIDE}).`);
    expect(result.sources.map((s) => s.chipLabel)).toEqual([
      "Bridges 2 › User guide",
      "User guide › Software",
    ]);
    expect(result.sources[1].passages).toEqual([]);
    expect(result.sources[1].url).toBe(other);
  });

  it("keeps the list when a line in it links nothing", () => {
    const text = `Use Globus.\n\nSources:\n- ${GUIDE}\n- The Delta user guide`;
    expect(shown(text)).toBe(text);
  });

  it("keeps the list when it has prose beside a link", () => {
    const text = `Use Globus.\n\nSources: [guide](${GUIDE}) Remember to renew your allocation yearly.`;
    expect(shown(text)).toBe(text);
    const described = `Use Globus.\n\nSources:\n- [guide](${GUIDE}) explains file transfer`;
    expect(shown(described)).toBe(described);
  });

  it("keeps the list when code follows it", () => {
    const text = `Use Globus.\n\nSources:\n- [guide](${GUIDE})\n\n\`\`\`bash\nglobus ls\n\`\`\``;
    expect(shown(text)).toBe(text);
    const inline = `Use Globus.\n\nSources: \`globus ls\``;
    expect(shown(inline)).toBe(inline);
  });

  it("keeps links inside the answer's sentences", () => {
    const text = `Use Globus, as the [Bridges-2 guide](${GUIDE}) explains.`;
    expect(shown(text)).toBe(text);
    const prose = `Sources: the [guide](${GUIDE}) says to use Globus.\n\nThen sign in.`;
    expect(shown(prose)).toBe(prose);
  });

  it("keeps a sources section that isn't at the end", () => {
    const text = `Sources:\n- ${GUIDE}\n\nUse Globus to move files.`;
    expect(shown(text)).toBe(text);
  });

  it("keeps an answer that is nothing but the list", () => {
    const text = `Sources:\n- ${GUIDE}`;
    expect(shown(text)).toBe(text);
  });

  it("ignores a sources line inside code", () => {
    const text = `Run this:\n\n\`\`\`\nSources: ${GUIDE}\n\`\`\``;
    expect(shown(text)).toBe(text);
  });

  it("keeps the list when no chip shows", () => {
    const text = `Use Globus.\n\nSources:\n- https://example.org/other`;
    expect(view(text).text).toBe(text);
    expect(view(text).sources).toEqual([]);
  });

  it("drops the site prefix every chip's heading shares", () => {
    const delta = "https://docs.ncsa.illinois.edu/delta";
    const search = [
      "Retrieved 2 documentation excerpt(s).",
      `[1] source: ${delta}/accounts.html\n# Delta (NCSA) — Accounts and allocations\n\nText.`,
      `[2] source: ${delta}/login.html\n# Delta (NCSA) — Logging in\n\nText.`,
    ].join("\n\n");
    const { sources } = view(
      `See ${delta}/accounts.html and ${delta}/login.html.`,
      search,
    );
    expect(sources.map((s) => s.chipLabel)).toEqual([
      "Accounts and allocations",
      "Logging in",
    ]);
    expect(sources[0].title).toBe("Delta (NCSA) — Accounts and allocations");
  });

  it("works the answer out once per turn", () => {
    const messages = [
      human("h1", "Q"),
      call("a1", "c1", "search_access_documents"),
      result("t1", "c1", "search_access_documents", docsResult),
      answer("a2", `See ${GUIDE}`),
    ];
    const first = answerWithSources(messages, messages[3]);
    expect(answerWithSources([...messages], messages[3])).toBe(first);
    const later = [...messages, human("h2", "More"), answer("a3", "Ok.")];
    expect(answerWithSources(later, messages[3])).toBe(first);
  });
});

describe("readablePassage", () => {
  const header = [
    "SDSC Expanse Storage",
    "Source: https://www.sdsc.edu/systems/expanse/user_guide.html",
    "Keywords: SDSC Expanse Storage, Storage, quotas, file transfer",
    "Description: SDSC Expanse Storage is the persistent storage resource at SDSC.",
  ];
  const body = "## Identity\n\n- **Name:** SDSC Expanse Projects Storage";
  const tidied = [
    "SDSC Expanse Storage",
    "SDSC Expanse Storage is the persistent storage resource at SDSC.",
    body,
  ].join("\n\n");

  it("tidies a curated header with blank lines between its lines", () => {
    expect(readablePassage([...header, body].join("\n\n"))).toBe(tidied);
  });

  it("tidies a curated header on consecutive lines", () => {
    expect(readablePassage(`${header.join("\n")}\n${body}`)).toBe(tidied);
  });

  it("keeps a markdown title and reads bold labels", () => {
    const passage = [
      "# Delta",
      "**Source:** https://docs.ncsa.illinois.edu/delta",
      "**Tags:** gpu, cpu",
      "**Summary**: Delta is an NCSA system.",
      "Body.",
    ].join("\n");
    expect(readablePassage(passage)).toBe(
      "# Delta\n\nDelta is an NCSA system.\n\nBody.",
    );
  });

  it("keeps a spaced header's description that runs over lines whole", () => {
    expect(
      readablePassage(
        "Delta\n\nSource: https://x.org/delta\n\nDescription: One\nand two.\n\nBody.",
      ),
    ).toBe("Delta\n\nOne\nand two.\n\nBody.");
  });

  it("leaves a passage without a curated header as retrieved", () => {
    for (const passage of [
      "## Transfers\n\nUse Globus.\n\nSource: the SDSC transfer guide, section 3.",
      "Use Globus.\n\nTags: transfer, globus",
      "Description: the --description flag sets the job's name.\n\nMore.",
      "Keywords: a, b",
      "Title\n\nSource: the SDSC guide\n\nKeywords: a",
    ])
      expect(readablePassage(passage)).toBe(passage);
  });

  it("leaves fields after the header in the body", () => {
    const passage =
      "Delta\nSource: https://x.org/delta\nBody.\n\nKeywords: kept here.";
    expect(readablePassage(passage)).toBe(
      "Delta\n\nBody.\n\nKeywords: kept here.",
    );
  });
});
