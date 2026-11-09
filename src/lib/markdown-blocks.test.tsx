import { render } from "@testing-library/react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { describe, expect, it } from "vitest";
import { markdownBlocks } from "./markdown-blocks";

const remark = [remarkGfm, remarkMath];
const rehype = [rehypeKatex];

/** The HTML for markdown parsed as one text, or block by block. */
function html(parts: string[]) {
  const { container, unmount } = render(
    <div>
      {parts.map((part, i) => (
        <ReactMarkdown
          key={i}
          remarkPlugins={remark}
          rehypePlugins={rehype}
        >
          {part}
        </ReactMarkdown>
      ))}
    </div>,
  );
  // ReactMarkdown puts a newline text node between top-level blocks, which
  // doesn't render; only that may differ.
  const out = container.innerHTML.replace(/>\n</g, "><");
  unmount();
  return out;
}

describe("markdownBlocks", () => {
  it("splits at blank lines between top-level blocks", () => {
    expect(markdownBlocks("# Title\n\nOne.\n\n## Two\n\nThree.")).toEqual([
      "# Title\n",
      "One.\n",
      "## Two\n",
      "Three.",
    ]);
  });

  it("joins back into the text it came from", () => {
    const text = "A.\n\n\nB.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nC.";
    expect(markdownBlocks(text).join("\n")).toBe(text);
  });

  it("keeps fenced code and $$ math whole, blank lines and all", () => {
    const code = "```bash\nmodule load cuda\n\nsbatch job.sh\n```";
    const math = "$$\na = b\n\nc = d\n$$";
    expect(markdownBlocks(`Run:\n\n${code}\n\nThen:\n\n${math}`)).toEqual([
      "Run:\n",
      `${code}\n`,
      "Then:\n",
      math,
    ]);
    // Still open while streaming: the rest is code, not new blocks.
    expect(markdownBlocks("```\nA\n\nB")).toEqual(["```\nA\n\nB"]);
  });

  it("keeps a loose list and its indented continuations together", () => {
    const list = "- One\n\n- Two\n\n  More about two.\n\n1. Three";
    expect(markdownBlocks(list)).toEqual([list]);
  });

  it("doesn't split text whose parts refer to each other", () => {
    for (const text of [
      "See [the guide][g].\n\n[g]: https://example.org",
      "A claim.[^1]\n\n[^1]: The note.",
      "<!-- a\n\nb -->\n\nText.",
    ])
      expect(markdownBlocks(text)).toEqual([text]);
  });

  it("renders the same block by block as parsed whole", () => {
    for (const md of [
      "# Guide\n\nIntro with **bold**, `code` and $x^2$.\n\n## Delta\n\n- one\n- two\n\n  continued\n\n1. first\n2. second\n\nAfter the list.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```bash\nls\n\npwd\n```\n\n> quote\n\n---\n\nEnd.",
      "Text\n\n$$\na = b\n\nc\n$$\n\nafter",
      "Para\n\n    indented code\n\n    more code\n\nnext",
      "* a\n\n* b\n\n***\n\nSetext\n===\n\nlast",
    ]) {
      expect(markdownBlocks(md).length).toBeGreaterThan(1);
      expect(html(markdownBlocks(md))).toBe(html([md]));
    }
  });
});
