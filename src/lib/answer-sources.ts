import type { Message } from "@langchain/langgraph-sdk";
import { isCapabilityOverview } from "./capability-suggestions";

const DOCS_TOOL = "search_access_documents";

export interface Passage {
  url: string;
  text: string;
}

export interface Link {
  /** The link text the answer used, or null for a bare URL. */
  label: string | null;
  url: string;
}

export interface AnswerSource {
  /** The page, plus the section when the answer linked one. */
  key: string;
  /** The link as the answer wrote it. */
  url: string;
  /**
   * Never from the answer's wording, which could describe a page wrongly:
   * the heading the retrieved passages open with, or else a readable form
   * of the URL's path ("Bridges 2 › User guide").
   */
  title: string;
  /** The heading, or else the last two parts of the path, for the chip. */
  chipLabel: string;
  host: string;
  /** The answer's link text, or null for a bare URL. */
  linkText: string | null;
  /**
   * Excerpts the documentation search returned from this page, verbatim.
   * Empty for a page only the model's own sources list links: its chip opens
   * the page, since there is no passage to show.
   */
  passages: string[];
}

function textOf(content: Message["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join(" ");
}

// One header per excerpt, as access-agent's _format_chunks writes them:
// "[<rank>] source: <url>" on its own line, excerpts separated by a blank line.
const PASSAGE_HEADER = /(?:^|\n\n)\[(\d+)\] source: ([^\n]+)\n/g;

/**
 * The excerpts a search_access_documents result holds, with their pages.
 * Ranks run 1, 2, 3..., so a source line out of that order is text inside an
 * excerpt, not a new excerpt: a document can't claim another page's URL.
 */
export function parsePassages(content: string): Passage[] {
  const headers: RegExpExecArray[] = [];
  for (const match of content.matchAll(PASSAGE_HEADER)) {
    if (Number(match[1]) === headers.length + 1) headers.push(match);
  }
  const passages: Passage[] = [];
  headers.forEach((header, i) => {
    const start = header.index + header[0].length;
    const end = headers[i + 1]?.index ?? content.length;
    const url = header[2];
    const text = content.slice(start, end).trim();
    if (pageKey(url) && text) passages.push({ url, text });
  });
  return passages;
}

const MARKDOWN_LINK =
  /\[([^\]]*)\]\(<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\)/g;
const BARE_URL = /https?:\/\/[^\s<>()[\]"'`]+/g;

const CODE = /(```|~~~)[\s\S]*?(?:\1|$)|`[^`\n]*`/g;

const blank = (match: string) => match.replace(/[^\n]/g, " ");

/**
 * The web links an answer contains, in the order they appear. Links in code
 * are commands or examples, not citations.
 */
export function linksIn(answer: string): Link[] {
  const text = answer.replace(CODE, blank);
  const found: { index: number; link: Link }[] = [];
  const rest = text.replace(MARKDOWN_LINK, (match, label, url, index) => {
    found.push({ index, link: { label: label.trim() || null, url } });
    return blank(match);
  });
  for (const match of rest.matchAll(BARE_URL)) {
    const url = match[0].replace(/[.,;:!?*_~]+$/, "");
    found.push({ index: match.index, link: { label: null, url } });
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.link);
}

/**
 * What identifies a page for matching an answer's link to a retrieved one:
 * scheme, "www.", fragment and trailing slash don't change the page.
 */
function pageKey(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname.replace(/^www\./, "");
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${host}${path}${parsed.search}`;
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function fragmentOf(url: string): string {
  return new URL(url).hash;
}

/** What a chip is keyed by: the page, plus the section the link names. */
function sourceKey(url: string): string | null {
  const page = pageKey(url);
  return page && `${page}${fragmentOf(url)}`;
}

/**
 * Path segments that say nothing about the page: a language, a docs build
 * ("latest", "stable"), a version, or a directory index.
 */
const NOISE_SEGMENT =
  /^(?:en|latest|stable|current|v?\d+(?:\.\d+)*|index|default)$/i;

/** Extensions of web pages and documents, not of versions ("openmpi-4.1.5"). */
const WEB_EXTENSION = /\.(?:html?|php|aspx?|md|pdf|txt)$/i;

/**
 * The URL's path as words: "user_guide/running_jobs.html" becomes
 * ["User guide", "Running jobs"]. The fragment is left out; anchors are
 * often generated ids like "narrow-wysiwyg-7" that mean nothing to a reader.
 */
function pathWords(url: URL): string[] {
  return url.pathname
    .split("/")
    .map((segment) =>
      decode(segment)
        .replace(WEB_EXTENSION, "")
        .replace(/[-_\s]+/g, " ")
        .trim(),
    )
    .filter((words) => words && !NOISE_SEGMENT.test(words))
    .map((words) => words[0].toUpperCase() + words.slice(1));
}

const HEADING_LINE = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/** Headings that name a kind of section, not a page or a topic. */
const GENERIC_HEADING =
  /^(?:overview|introduction|intro|notes?|examples?|example \d+|step \d+.*|summary|contents|table of contents|troubleshooting|faqs?|usage|background|details|more information|references|see also|prerequisites|next steps)$/i;

/** The heading a passage opens with, as plain text, and its level. */
function headingOf(passage: string): { level: number; text: string } | null {
  const first = passage.trimStart().split("\n", 1)[0];
  const match = first.match(HEADING_LINE);
  if (!match) return null;
  const text = match[2]
    .replace(MARKDOWN_LINK, "$1")
    .replace(/[*_`]+/g, "")
    .trim();
  return text ? { level: match[1].length, text } : null;
}

/**
 * The heading to label a link with, or null for the path label. Every
 * passage behind the link must open with the same heading, since one
 * section's heading would mislabel the whole page. A link to a section
 * takes its section's heading; a link to the whole page only a page-level
 * (H1 or H2) one. Generic headings like "Overview" or "Step 3" never label
 * a link.
 */
function headingLabel(section: boolean, passages: string[]): string | null {
  if (!passages.length) return null;
  const headings = passages.map(headingOf);
  const first = headings[0];
  if (!first || GENERIC_HEADING.test(first.text)) return null;
  if (!section && first.level > 2) return null;
  const shared = headings.every(
    (h) => h?.text === first.text && h.level === first.level,
  );
  return shared ? first.text : null;
}

/** The turn this message belongs to: everything after the last human message. */
function turnBefore(messages: Message[], index: number): Message[] {
  let start = index;
  while (start > 0 && messages[start - 1].type !== "human") start--;
  return messages.slice(start, index);
}

/**
 * The sources behind an answer, read from the conversation it is part of so
 * they come back when a thread is reopened. A source is a page the answer
 * links AND a documentation search in the same turn returned, shown with
 * the passages that search returned. Retrieved pages the answer doesn't link
 * are left out, because nothing says the answer used them, and links no
 * search returned are left out, because there is no passage to check them
 * against. Returns null for messages that aren't a written answer.
 */
export function answerSources(
  messages: Message[],
  message: Message,
): AnswerSource[] | null {
  if (message.type !== "ai" || message.tool_calls?.length) return null;
  // The capability overview is fixed text about the assistant, not a claim
  // that needs a documentation source.
  if (isCapabilityOverview(message)) return null;
  const text = textOf(message.content);
  if (!text.trim()) return null;

  const index = messages.findIndex((m) => m === message || m.id === message.id);
  if (index < 0) return null;

  const turn = turnBefore(messages, index);
  const retrieved = new Map<string, Passage[]>();
  for (const m of turn) {
    if (m.type !== "tool" || m.name !== DOCS_TOOL) continue;
    for (const passage of parsePassages(textOf(m.content))) {
      const key = pageKey(passage.url)!;
      const page = retrieved.get(key) ?? [];
      if (!page.some((p) => p.text === passage.text)) page.push(passage);
      retrieved.set(key, page);
    }
  }

  const sources: AnswerSource[] = [];
  const seen = new Set<string>();
  for (const link of linksIn(text)) {
    const page = pageKey(link.url);
    const key = sourceKey(link.url);
    if (!page || !key || seen.has(key)) continue;
    const fragment = fragmentOf(link.url);
    // A link to a section is backed only by passages from that section;
    // a link to the whole page by every passage from it.
    const passages = (retrieved.get(page) ?? [])
      .filter((p) => !fragment || fragmentOf(p.url) === fragment)
      .map((p) => p.text);
    if (!passages.length) continue;
    seen.add(key);
    sources.push(sourceFor(link, key, passages));
  }
  return sources;
}

function sourceFor(link: Link, key: string, passages: string[]): AnswerSource {
  const url = new URL(link.url);
  const heading = headingLabel(!!url.hash, passages);
  const words = pathWords(url);
  const linkText =
    link.label && !/^https?:\/\//.test(link.label) ? link.label : null;
  return {
    key,
    url: link.url,
    title: heading ?? (words.join(" › ") || url.hostname),
    chipLabel: heading ?? (words.slice(-2).join(" › ") || url.hostname),
    host: url.hostname,
    linkText,
    passages,
  };
}

/**
 * A line that opens a sources section: a "Sources" heading, or a bold or
 * plain "Source:" / "Sources:" label, with whatever follows it on the line.
 */
function sourcesLabel(line: string): string | null {
  const match = line
    .trim()
    .match(
      /^(#{1,6}\s+)?(\*\*|__|\*|_)?sources?(?![a-z])\s*(:)?\s*\2\s*(:)?\s*(.*)$/i,
    );
  if (!match) return null;
  const [, heading, emphasis, colon, trailingColon, rest] = match;
  if (!heading && !emphasis && !colon && !trailingColon) return null;
  return rest;
}

/**
 * Whether a line is nothing but links: an optional list marker, then one
 * or more links or bare URLs, with at most punctuation between them. Any
 * other text, or code, is content that a chip can't stand in for.
 */
function isLinkLine(line: string): boolean {
  if (line.replace(CODE, "") !== line) return false;
  const residue = line
    .replace(MARKDOWN_LINK, "\uE000")
    .replace(/<https?:\/\/[^\s>]+>/g, "\uE000")
    .replace(BARE_URL, "\uE000")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
  return residue.includes("\uE000") && !/[^\uE000\s,;.:|*_()–—-]/.test(residue);
}

/**
 * Splits off the sources list the model wrote at the end of an answer, so
 * the answer has one list: the chips. A section is a "Sources" label line
 * followed only by lines that each link something; a line that links
 * nothing (a citation the chips can't stand in for), or prose after the
 * list, means it isn't one and the text is left alone. Pages the list links
 * that aren't chips come back as extra chips, so nothing is lost. Links
 * inside the answer's sentences are never touched.
 */
export function splitSourcesSection(
  text: string,
  sources: AnswerSource[],
): { text: string; extra: AnswerSource[] } {
  const unchanged = { text, extra: [] };
  if (!sources.length) return unchanged;
  // Code is blanked to find the label, so a "Sources:" line inside code
  // can't start a section; the list itself is read as written, so code in
  // it is content that keeps the section.
  const blanked = text.replace(CODE, blank).split("\n");
  const lines = text.split("\n");
  let start = -1;
  let sectionLinks: Link[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    if (sourcesLabel(blanked[i]) === null) continue;
    // Each "Source:" line in a run of them counts by the links after it.
    const body = lines
      .slice(i)
      .map((l) => sourcesLabel(l) ?? l)
      .filter((l) => l.trim());
    if (!body.length || !body.every(isLinkLine)) break;
    start = i;
    sectionLinks = body.flatMap(linksIn);
  }
  if (start < 0) return unchanged;
  const kept = lines
    .slice(0, start)
    .join("\n")
    .replace(/(?:\n\s*(?:[-*_]\s*){3,})?\s*$/, "");
  if (!kept.trim()) return unchanged;

  // One chip per page: a chip for any section of it already covers it.
  const pages = new Set(sources.map((s) => pageKey(s.url)));
  const extra: AnswerSource[] = [];
  for (const link of sectionLinks) {
    const page = pageKey(link.url);
    const key = sourceKey(link.url);
    if (!page || !key || pages.has(page)) continue;
    pages.add(page);
    extra.push(sourceFor(link, key, []));
  }
  return { text: kept, extra };
}

/** What separates a site or resource name from the rest of a heading. */
const PREFIX_END = / [—–|-] |: | › /g;

/**
 * Chip labels without the prefix their headings share, such as "Delta
 * (NCSA) — ", which would otherwise fill every chip before the part that
 * tells them apart. Needs two headings to tell what is shared; the full
 * heading stays in the title.
 */
function distinctLabels(sources: AnswerSource[]): AnswerSource[] {
  const headings = sources
    .filter(
      (s) => headingLabel(!!fragmentOf(s.url), s.passages) === s.chipLabel,
    )
    .map((s) => s.chipLabel);
  if (headings.length < 2) return sources;
  const ends = [...headings[0].matchAll(PREFIX_END)].map(
    (m) => m.index + m[0].length,
  );
  const prefix = ends
    .map((end) => headings[0].slice(0, end))
    .reverse()
    .find((p) => headings.every((h) => h.startsWith(p) && h.length > p.length));
  if (!prefix) return sources;
  return sources.map((s) =>
    s.chipLabel.startsWith(prefix) && s.chipLabel.length > prefix.length
      ? { ...s, chipLabel: s.chipLabel.slice(prefix.length) }
      : s,
  );
}

type AnswerView = { text: string; sources: AnswerSource[] };

const views = new WeakMap<
  Message,
  { text: string; turn: Message[]; view: AnswerView | null }
>();

/**
 * The answer as shown once it has finished: its text without a sources
 * list the chips replace, and the chips. Null for messages that aren't a
 * written answer. Worked out once per answer and turn: the message and the
 * chips under it both ask, on every streamed token.
 */
export function answerWithSources(
  messages: Message[],
  message: Message,
): AnswerView | null {
  const index = messages.findIndex((m) => m === message || m.id === message.id);
  const turn = index < 0 ? [] : turnBefore(messages, index);
  const text = textOf(message.content);
  const cached = views.get(message);
  // The text is compared too, in case a streamed message is updated in place.
  if (
    cached &&
    cached.text === text &&
    cached.turn.length === turn.length &&
    cached.turn.every((m, i) => m === turn[i])
  ) {
    return cached.view;
  }
  const linked = answerSources(messages, message);
  let view: AnswerView | null = null;
  if (linked) {
    const split = splitSourcesSection(text, linked);
    view = {
      text: split.text,
      sources: distinctLabels([...linked, ...split.extra]),
    };
  }
  views.set(message, { text, turn, view });
  return view;
}
