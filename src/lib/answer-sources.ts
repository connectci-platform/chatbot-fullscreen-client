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
  /** Excerpts the documentation search returned from this page, verbatim. */
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
        .replace(/\.[a-z0-9]{1,5}$/i, "")
        .replace(/[-_\s]+/g, " ")
        .trim(),
    )
    .filter((words) => words && !NOISE_SEGMENT.test(words))
    .map((words) => words[0].toUpperCase() + words.slice(1));
}

const HEADING_LINE = /^#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/** The heading a passage opens with, as plain text, or null. */
function headingOf(passage: string): string | null {
  const first = passage.trimStart().split("\n", 1)[0];
  const match = first.match(HEADING_LINE);
  if (!match) return null;
  const text = match[1]
    .replace(MARKDOWN_LINK, "$1")
    .replace(/[*_`]+/g, "")
    .trim();
  return text || null;
}

/**
 * The heading the passages behind a link share: the section's heading for a
 * link to a section, the page's when every passage from it opens with the
 * same one. Null when they differ, since one section's heading would
 * mislabel the whole page.
 */
function sharedHeading(passages: string[]): string | null {
  const headings = new Set(passages.map(headingOf));
  const [only] = headings;
  return headings.size === 1 ? only : null;
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
    const url = new URL(link.url);
    const heading = sharedHeading(passages);
    const words = pathWords(url);
    const linkText =
      link.label && !/^https?:\/\//.test(link.label) ? link.label : null;
    sources.push({
      key,
      url: link.url,
      title: heading ?? (words.join(" › ") || url.hostname),
      chipLabel: heading ?? (words.slice(-2).join(" › ") || url.hostname),
      host: url.hostname,
      linkText,
      passages,
    });
  }
  return sources;
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
 * The answer without the sources list the model wrote at its end, when the
 * chips already show every page that list links: one list per answer. The
 * list is kept when it links anything that isn't a chip, or has a line that
 * links nothing (a citation the chips can't stand in for). Links inside the
 * answer's sentences are never touched.
 */
export function withoutSourcesSection(
  text: string,
  sources: AnswerSource[],
): string {
  if (!sources.length) return text;
  const chips = new Set(sources.map((s) => s.key));
  // Code is blanked so a "Sources:" line inside it can't start a section.
  const lines = text.replace(CODE, blank).split("\n");
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const rest = sourcesLabel(lines[i]);
    if (rest === null) continue;
    const body = [rest, ...lines.slice(i + 1)].filter((l) => l.trim());
    const links = body.map(linksIn);
    const covered =
      links.length > 0 &&
      links.every((found) => found.length > 0) &&
      links.flat().every((l) => chips.has(sourceKey(l.url) ?? ""));
    if (!covered) break;
    start = i;
  }
  if (start < 0) return text;
  const kept = text
    .split("\n")
    .slice(0, start)
    .join("\n")
    .replace(/(?:\n\s*(?:[-*_]\s*){3,})?\s*$/, "");
  return kept.trim() ? kept : text;
}
