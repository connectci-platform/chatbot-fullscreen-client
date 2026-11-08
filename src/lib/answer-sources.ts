import type { Message } from "@langchain/langgraph-sdk";

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
  /** The link as the answer wrote it. */
  url: string;
  label: string;
  host: string;
  /** Excerpts the documentation search returned from this page, verbatim. */
  passages: string[];
}

export interface AnswerSourcesResult {
  sources: AnswerSource[];
  /**
   * True when the answer links none of the documentation it could have cited:
   * it searched the documentation, or used no tools at all. An answer drawn
   * only from live data tools is not flagged; there is no document to cite.
   */
  citesNoSource: boolean;
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
const PASSAGE_HEADER = /(?:^|\n\n)\[\d+\] source: ([^\n]+)\n/g;

/** The excerpts a search_access_documents result holds, with their pages. */
export function parsePassages(content: string): Passage[] {
  const headers = [...content.matchAll(PASSAGE_HEADER)];
  const passages: Passage[] = [];
  headers.forEach((header, i) => {
    const start = header.index + header[0].length;
    const end = headers[i + 1]?.index ?? content.length;
    const url = header[1];
    const text = content.slice(start, end).trim();
    if (pageKey(url) && text) passages.push({ url, text });
  });
  return passages;
}

const MARKDOWN_LINK =
  /\[([^\]]*)\]\(<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\)/g;
const BARE_URL = /https?:\/\/[^\s<>()[\]"'`]+/g;

/** The web links an answer contains, in the order they appear. */
export function linksIn(text: string): Link[] {
  const found: { index: number; link: Link }[] = [];
  const rest = text.replace(MARKDOWN_LINK, (match, label, url, index) => {
    found.push({ index, link: { label: label.trim() || null, url } });
    return " ".repeat(match.length);
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

/** Link text, or for a bare URL its path; the host is shown beside it. */
function displayLabel(link: Link): string {
  if (link.label && !/^https?:\/\//.test(link.label)) return link.label;
  const url = new URL(link.url);
  return url.pathname.replace(/\/+$/, "") || url.hostname;
}

function fragmentOf(url: string): string {
  return new URL(url).hash;
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
 * links AND a documentation search in the conversation returned, shown with
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
  const text = textOf(message.content);
  if (!text.trim()) return null;

  const index = messages.findIndex((m) => m === message || m.id === message.id);
  if (index < 0) return null;

  const retrieved = new Map<string, Passage[]>();
  for (const m of messages.slice(0, index)) {
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
    const key = pageKey(link.url);
    if (!key || seen.has(key)) continue;
    const page = retrieved.get(key);
    if (!page) continue;
    seen.add(key);
    // A link to a section the search returned passages from is backed by
    // those passages, not by other sections of the same page.
    const fragment = fragmentOf(link.url);
    const section = fragment
      ? page.filter((p) => fragmentOf(p.url) === fragment)
      : [];
    const passages = (section.length ? section : page).map((p) => p.text);
    sources.push({
      url: link.url,
      label: displayLabel(link),
      host: new URL(link.url).hostname,
      passages,
    });
  }

  const tools = turnBefore(messages, index).filter((m) => m.type === "tool");
  const searchedDocs = tools.some((m) => m.name === DOCS_TOOL);
  return {
    sources,
    citesNoSource: !sources.length && (searchedDocs || !tools.length),
  };
}
