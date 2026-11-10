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
      "Text\n\n<?php\n\necho 1;\n?>\n\nAfter",
      "<!DOCTYPE html>\n\n<html>",
      "<![CDATA[\n\nx\n\n]]>\n\nafter",
      "Use [docs].\n\n> [docs]: https://x.org\n\nEnd",
      "Use [docs].\n\n- [docs]: https://x.org\n\nEnd",
    ])
      expect(markdownBlocks(text)).toEqual([text]);
  });

  it("closes a fence only on a bare fence of its own kind, at least as long", () => {
    for (const text of [
      "```\n```text\nx\n\ny\n```\n\nafter",
      "````md\n```py\nx\n\ny\n```\n````\n\nend",
      "```\n~~~\n\nz\n```\n\nok",
    ])
      expect(markdownBlocks(text)[0]).toContain("\n\n");
    expect(markdownBlocks("````\nx\n\ny\n````\n\nend")).toEqual([
      "````\nx\n\ny\n````\n",
      "end",
    ]);
  });

  it("doesn't take inline code with triple backticks for a fence", () => {
    expect(markdownBlocks("```npm i``` first.\n\nThen this.")).toEqual([
      "```npm i``` first.\n",
      "Then this.",
    ]);
  });

  it("keeps $$ math opened with content on its line whole", () => {
    const math = "$$ \\begin{aligned}\na &= b\n\nc &= d\n\\end{aligned} $$";
    expect(markdownBlocks(`Text\n\n${math}\n\nAfter`)).toEqual([
      "Text\n",
      `${math}\n\nAfter`,
    ]);
    // On one line it's inline math, which ends there.
    expect(markdownBlocks("$$x$$\n\nAfter")).toEqual(["$$x$$\n", "After"]);
  });

  it("splits around footnote markers that aren't definitions", () => {
    expect(markdownBlocks("Use `[^a-z]` here.\n\nNext.")).toEqual([
      "Use `[^a-z]` here.\n",
      "Next.",
    ]);
    expect(markdownBlocks("```\n[^1]: in code\n```\n\nNext.")).toHaveLength(2);
  });

  it("reads CRLF text the same way", () => {
    expect(markdownBlocks("```\r\na\r\n\r\nb\r\n```\r\n\r\nc")).toEqual([
      "```\r\na\r\n\r\nb\r\n```\r\n\r",
      "c",
    ]);
  });

  it("renders the same block by block as parsed whole", () => {
    for (const md of [
      "# Guide\n\nIntro with **bold**, `code` and $x^2$.\n\n## Delta\n\n- one\n- two\n\n  continued\n\n1. first\n2. second\n\nAfter the list.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```bash\nls\n\npwd\n```\n\n> quote\n\n---\n\nEnd.",
      "Text\n\n$$\na = b\n\nc\n$$\n\nafter",
      "Para\n\n    indented code\n\n    more code\n\nnext",
      "* a\n\n* b\n\n***\n\nSetext\n===\n\nlast",
      "```\n```text\nx\n\ny\n```\n\nafter",
      "```npm i``` first.\n\n```py\na = 1\n\nb = 2\n```\n\ndone",
      "Text\n\n$$ \\begin{aligned}\na &= b\n\nc &= d\n\\end{aligned} $$\n\nAfter",
      "Use `[^a-z]` here.\n\nNext.",
      "a\r\n\r\n````ts\r\nx\n\ny\r\n````\r\n\r\nb",
    ]) {
      expect(markdownBlocks(md).length).toBeGreaterThan(1);
      expect(html(markdownBlocks(md))).toBe(html([md]));
    }
  });
});
