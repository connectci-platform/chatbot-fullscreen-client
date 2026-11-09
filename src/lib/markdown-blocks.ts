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
 * reference definitions, footnotes, or an HTML block that can hold blank
 * lines (a comment, <pre>) isn't split at all, since those reach across
 * blocks.
 */
export function markdownBlocks(text: string): string[] {
  if (REACHES_ACROSS.test(text) || text.includes("[^")) return [text];

  const lines = text.split("\n");
  const blocks: string[] = [];
  let start = 0;
  let fence: string | null = null;
  let math = false;
  let blank = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      if (line.trimStart().startsWith(fence) && /^ {0,3}\S/.test(line)) {
        fence = null;
      }
      blank = false;
      continue;
    }
    if (math) {
      if (line.trim() === "$$") math = false;
      blank = false;
      continue;
    }
    if (!line.trim()) {
      blank = true;
      continue;
    }
    if (blank && i > start && /^\S/.test(line) && !LIST_ITEM.test(line)) {
      blocks.push(lines.slice(start, i).join("\n"));
      start = i;
    }
    blank = false;
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (opening) fence = opening[1];
    else if (line.trim() === "$$") math = true;
  }
  blocks.push(lines.slice(start).join("\n"));
  return blocks;
}

const REACHES_ACROSS =
  /^ {0,3}(?:\[[^\]]+\]:|<(?:!--|(?:pre|script|style|textarea)\b))/im;

const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
