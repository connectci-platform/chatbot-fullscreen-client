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
   * Taken from the URL, never from the answer's wording: "host › path ›
   * section". The model's link text could describe a page wrongly.
   */
  title: string;
  /** The last two parts of the title, for the chip. */
  chipLabel: string;
  host: string;
  /** The answer's link text, or null for a bare URL. */
  linkText: string | null;
  /** Excerpts the documentation search returned from this page, verbatim. */
  passages: string[];
}

export interface AnswerSourcesResult {
  sources: AnswerSource[];
  /**
   * Why the answer shows no source, when that is worth saying:
   * "unlinked" when the turn searched the documentation and the answer links
   * none of what it retrieved; "not-retrieved" when the turn used no tools
   * and the answer makes substantive claims (from the model's own memory,
   * the main accuracy risk), whether or not it links pages. Otherwise null:
   * short conversational replies, and answers drawn only from live data
   * tools, which have no document to cite.
   */
  noSource: "unlinked" | "not-retrieved" | null;
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

/** "host", then each path segment, then the section. */
function crumbs(url: URL): string[] {
  const path = url.pathname.split("/").filter(Boolean).map(decode);
  const section = url.hash ? [decode(url.hash.slice(1))] : [];
  return [url.hostname, ...path, ...section];
}

function fragmentOf(url: string): string {
  return new URL(url).hash;
}

/**
 * Prose length at which an answer stops being a conversational reply (a
 * greeting, a thank-you, a one-line clarifying question) and starts making
 * claims a reader may want to check: about two sentences.
 */
const SUBSTANTIVE_LENGTH = 160;

/** The answer's prose: link text kept, URLs dropped, whitespace collapsed. */
function proseLength(text: string): number {
  return text
    .replace(MARKDOWN_LINK, "$1")
    .replace(BARE_URL, "")
    .replace(/\s+/g, " ")
    .trim().length;
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
): AnswerSourcesResult | null {
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
    const fragment = page ? fragmentOf(link.url) : "";
    const key = `${page}${fragment}`;
    if (!page || seen.has(key)) continue;
    // A link to a section is backed only by passages from that section;
    // a link to the whole page by every passage from it.
    const passages = (retrieved.get(page) ?? [])
      .filter((p) => !fragment || fragmentOf(p.url) === fragment)
      .map((p) => p.text);
    if (!passages.length) continue;
    seen.add(key);
    const url = new URL(link.url);
    const parts = crumbs(url);
    const linkText =
      link.label && !/^https?:\/\//.test(link.label) ? link.label : null;
    sources.push({
      key,
      url: link.url,
      title: parts.join(" › "),
      chipLabel:
        parts.slice(Math.max(1, parts.length - 2)).join(" › ") || url.hostname,
      host: url.hostname,
      linkText,
      passages,
    });
  }

  const tools = turn.filter((m) => m.type === "tool");
  const searchedDocs = tools.some((m) => m.name === DOCS_TOOL);
  const fromMemory = !tools.length && proseLength(text) >= SUBSTANTIVE_LENGTH;
  let noSource: AnswerSourcesResult["noSource"] = null;
  if (!sources.length && searchedDocs) noSource = "unlinked";
  else if (!sources.length && fromMemory) noSource = "not-retrieved";
  return { sources, noSource };
}
