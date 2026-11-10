/**
 * Splits markdown into top-level blocks that render the same on their own
 * as they do together, so a streaming answer only re-parses its last block
 * on each token instead of the whole answer.
 *
 * A split is made only at a blank line, outside fenced code and $$ math,
 * where the next line starts at the margin and doesn't start a list item:
 * there, CommonMark has already ended the block before it, and an indented
 * line (a list item's continuation, indented code) or a list item (the rest
 * of a loose list) would mean something else on its own. Text with link
 * reference definitions, footnote definitions, or an HTML block that can
 * hold blank lines (a comment, <pre>, <?...?>, <!DOCTYPE>, CDATA) isn't
 * split at all, since those reach across blocks.
 */
export function markdownBlocks(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[] = [];
  let start = 0;
  /** The open code fence or $$ math block, until its closing line. */
  let fence: Fence | null = null;
  let blank = false;

  for (let i = 0; i < lines.length; i++) {
    // CRLF text: the \r would otherwise end every line's content.
    const line = lines[i].replace(/\r$/, "");
    if (fence) {
      if (closes(fence, line)) fence = null;
      blank = false;
      continue;
    }
    if (!line.trim()) {
      blank = true;
      continue;
    }
    // Outside code: "[^1]: x" in a code block defines nothing.
    if (REACHES_ACROSS.test(line)) return [text];
    if (blank && i > start && /^\S/.test(line) && !LIST_ITEM.test(line)) {
      blocks.push(lines.slice(start, i).join("\n"));
      start = i;
    }
    blank = false;
    fence = openingFence(line);
  }
  blocks.push(lines.slice(start).join("\n"));
  return blocks;
}

type Fence = { char: string; length: number };

/** The code fence or $$ math block a line opens, if it opens one. */
function openingFence(line: string): Fence | null {
  const code = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  // A backtick fence's info string can't hold a backtick: "```npm i```" is
  // inline code.
  if (code && !(code[1][0] === "`" && code[2].includes("`"))) {
    return { char: code[1][0], length: code[1].length };
  }
  // $$ with anything after it but another $ opens math, as remark-math reads
  // it; "$$x$$" on one line is inline math.
  const math = line.match(/^ {0,3}(\${2,})[^$]*$/);
  return math ? { char: "$", length: math[1].length } : null;
}

/** Only the fence's own character, at least as many, and nothing else. */
function closes(fence: Fence, line: string): boolean {
  const close = line.match(/^ {0,3}(`{3,}|~{3,}|\${2,})\s*$/);
  return (
    !!close && close[1][0] === fence.char && close[1].length >= fence.length
  );
}

/**
 * A line that reaches across blocks: a link reference or footnote
 * definition (also inside a blockquote or list item), or the start of an
 * HTML block that runs past blank lines (types 1 to 5 in CommonMark).
 */
const REACHES_ACROSS =
  /^[ \t>]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?\[[^\]]+\]:|^ {0,3}<(?:!--|\?|![A-Za-z]|!\[CDATA\[|(?:pre|script|style|textarea)\b)/i;

const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
