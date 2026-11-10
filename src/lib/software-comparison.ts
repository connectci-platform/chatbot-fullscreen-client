import type { Message } from "@langchain/langgraph-sdk";
import { latestRegistration } from "./registration";
import { latestXdmodItems } from "./xdmod-table";

const COMPARE_TOOL = "compare_software_availability";
const VERSION_TOOLS = new Set(["get_software_details", "search_software"]);

/**
 * One cell of the grid. Only "listed" says the software is there. The two gaps
 * say what the index didn't tell us, never that the software is unavailable.
 */
export type ComparisonCell =
  | { status: "listed"; versions: string[] }
  | { status: "not_listed" }
  | { status: "not_indexed" }
  | { status: "lookup_failed" };

type Gap = Exclude<ComparisonCell["status"], "listed">;

export interface ComparisonResource {
  name: string;
  /**
   * Whether the index has a software list for this resource. "unknown" when
   * an older server gave no coverage and nothing was found to infer from.
   */
  coverage: "indexed" | "not_indexed" | "lookup_failed" | "unknown";
}

const SERVER_STATUSES = new Set<string>([
  "listed",
  "not_listed",
  "not_indexed",
  "lookup_failed",
]);

export interface ComparisonRow {
  software: string;
  /** The software's documentation, when a details result gave one. */
  documentation?: string;
  /** One per resource, in the same order as `resources`. */
  cells: ComparisonCell[];
}

export interface SoftwareComparisonView {
  /** The tool call this grid came from; changes when there's a new one. */
  key: string;
  resources: ComparisonResource[];
  rows: ComparisonRow[];
  /** Requested software the index found nowhere. */
  notFound: string[];
}

type Json = Record<string, unknown>;

function contentText(content: Message["content"]): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content
    .map((block) =>
      block && typeof block === "object" && "text" in block
        ? String((block as { text: unknown }).text)
        : "",
    )
    .join("");
  return text || null;
}

/** The tool's JSON body, or null for a failed, refused or unreadable call. */
function toolResult(message: Message): Json | null {
  if (message.type !== "tool") return null;
  if ((message as { status?: string }).status === "error") return null;
  const text = contentText(message.content);
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const result = parsed as Json;
    return result.status === "error" ? null : result;
  } catch {
    return null;
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function nameKey(value: string): string {
  return value.trim().toLowerCase();
}

/** "anvil.purdue.access-ci.org" and "Bridges2" read as "anvil", "bridges2". */
function resourceKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(".")[0]
    .replace(/[^a-z0-9]/g, "");
}

function sameResource(requested: string, found: string): boolean {
  const r = resourceKey(requested);
  const f = resourceKey(found);
  return r !== "" && (f === r || f.startsWith(r) || r.startsWith(f));
}

interface SoftwareFacts {
  versions: Record<string, string[]>;
  documentation?: string;
}

function cleanVersions(value: unknown): string[] {
  const seen = new Set<string>();
  for (const v of strings(value)) {
    const trimmed = v.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/**
 * Versions per resource from details and search results already in the
 * conversation, keyed by exact software name. The newest result wins.
 */
function softwareFacts(messages: Message[]): Map<string, SoftwareFacts> {
  const facts = new Map<string, SoftwareFacts>();
  for (const message of messages) {
    if (!VERSION_TOOLS.has(message.name ?? "")) continue;
    const result = toolResult(message);
    if (!result) continue;
    const items =
      message.name === "search_software"
        ? Array.isArray(result.items)
          ? result.items
          : []
        : [result.details];
    for (const item of items as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const { name, versions_by_resource, documentation } = item as Json;
      if (typeof name !== "string") continue;
      const versions: Record<string, string[]> = {};
      if (versions_by_resource && typeof versions_by_resource === "object") {
        for (const [rp, list] of Object.entries(versions_by_resource)) {
          versions[nameKey(rp)] = cleanVersions(list);
        }
      }
      const previous = facts.get(nameKey(name));
      facts.set(nameKey(name), {
        versions: { ...previous?.versions, ...versions },
        documentation:
          typeof documentation === "string" && documentation
            ? documentation
            : previous?.documentation,
      });
    }
  }
  return facts;
}

function toView(
  key: string,
  result: Json,
  messages: Message[],
): SoftwareComparisonView | null {
  if (!Array.isArray(result.comparison)) return null;
  const found = strings(result.all_resources_found);
  const requested = strings(result.requested_resources);

  // Servers since md-3023-gaps check coverage themselves and say so; older
  // ones leave it to inference. Inference never overrides the server.
  const fromServer = Array.isArray(result.resources_not_indexed);
  const notIndexed = new Set(strings(result.resources_not_indexed));
  const lookupFailed = new Set(strings(result.resources_lookup_failed));

  const resources: ComparisonResource[] = found.map((name) => ({
    name,
    coverage: "indexed",
  }));
  for (const name of requested) {
    if (found.some((f) => sameResource(name, f))) continue;
    if (resources.some((r) => resourceKey(r.name) === resourceKey(name))) {
      continue;
    }
    let coverage: ComparisonResource["coverage"];
    if (fromServer) {
      coverage = notIndexed.has(name)
        ? "not_indexed"
        : lookupFailed.has(name)
          ? "lookup_failed"
          : "indexed";
    } else {
      // A requested resource can only be called unindexed when the index
      // did answer for other resources. With no results, nothing is known.
      coverage = found.length > 0 ? "not_indexed" : "unknown";
    }
    resources.push({ name, coverage });
  }

  const facts = softwareFacts(messages);
  const rows: ComparisonRow[] = [];
  const notFound: string[] = [];
  for (const entry of result.comparison as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const {
      software,
      found: isFound,
      available_on,
      resource_status,
      versions_by_resource,
    } = entry as Json;
    if (typeof software !== "string") continue;
    if (isFound !== true) notFound.push(software);
    const listed = new Set(strings(available_on));
    const statuses =
      resource_status && typeof resource_status === "object"
        ? (resource_status as Json)
        : {};
    const known = facts.get(nameKey(software));
    // Servers since D8-3033 send versions with the comparison. Older ones
    // don't, so versions from other lookups in the conversation fill in.
    const compared: Record<string, string[]> = {};
    if (versions_by_resource && typeof versions_by_resource === "object") {
      for (const [rp, list] of Object.entries(versions_by_resource as Json)) {
        compared[nameKey(rp)] = cleanVersions(list);
      }
    }
    rows.push({
      software,
      documentation: known?.documentation,
      cells: resources.map((resource): ComparisonCell => {
        const stated = statuses[resource.name];
        let status: ComparisonCell["status"];
        if (typeof stated === "string" && SERVER_STATUSES.has(stated)) {
          status = stated as ComparisonCell["status"];
        } else if (
          resource.coverage === "not_indexed" ||
          resource.coverage === "lookup_failed"
        ) {
          status = resource.coverage;
        } else {
          status = listed.has(resource.name) ? "listed" : "not_listed";
        }
        if (status !== "listed") return { status: status as Gap };
        return {
          status: "listed",
          versions:
            compared[nameKey(resource.name)] ??
            known?.versions[nameKey(resource.name)] ??
            [],
        };
      }),
    });
  }
  return { key, resources, rows, notFound };
}

/**
 * The newest software comparison in the conversation, read from tool results
 * it already holds, so the grid comes back when a thread is reopened. A
 * failed or refused call adds no grid; the last good one stays.
 */
export function latestComparison(
  messages: Message[],
): SoftwareComparisonView | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.type !== "tool" || message.name !== COMPARE_TOOL) continue;
    const result = toolResult(message);
    if (!result) continue;
    const view = toView(message.tool_call_id, result, messages);
    if (view) return view;
  }
  return null;
}

/** The software comparison from the tool result with this key, or null. */
export function comparisonFor(
  messages: Message[],
  key: string,
): SoftwareComparisonView | null {
  const message = messages.find(
    (m) =>
      m.type === "tool" && m.name === COMPARE_TOOL && m.tool_call_id === key,
  );
  const result = message && toolResult(message);
  return result ? toView(key, result, messages) : null;
}

/**
 * The newest good comparison of each answer (the messages after a human
 * message up to the next one), by the turn's last AI message, so the answer
 * can offer to reopen it once the panel is closed.
 */
export function comparisonsByMessage(messages: Message[]): Map<string, string> {
  const out = new Map<string, string>();
  let key: string | null = null;
  let answer: string | null = null;
  const flush = () => {
    if (key && answer) out.set(answer, key);
    key = null;
    answer = null;
  };
  for (const m of messages) {
    if (m.type === "human") {
      flush();
      continue;
    }
    if (m.type === "ai" && m.id) answer = m.id;
    if (m.type === "tool" && m.name === COMPARE_TOOL) {
      const result = toolResult(m);
      if (result && toView(m.tool_call_id, result, messages)) {
        key = m.tool_call_id;
      }
    }
  }
  flush();
  return out;
}

function toolIndex(messages: Message[], toolCallId: string): number {
  return messages.findIndex(
    (m) => m.type === "tool" && m.tool_call_id === toolCallId,
  );
}

export type PanelStep = "registration" | "comparison" | "chart";

/**
 * Which panel should hold the shared side panel: the newest step in the
 * conversation that still has something to show, by where its tool result
 * sits in the messages.
 */
export function newestPanelStep(messages: Message[]): PanelStep | null {
  const at = (key: string | undefined) =>
    key === undefined ? -Infinity : toolIndex(messages, key);
  const steps: [PanelStep, number][] = [
    ["registration", at(latestRegistration(messages)?.key)],
    ["comparison", at(latestComparison(messages)?.key)],
    // The XDMoD panel's step: a turn can hold several charts and data
    // tables; its newest result counts.
    [
      "chart",
      Math.max(-Infinity, ...latestXdmodItems(messages).map((v) => at(v.key))),
    ],
  ];
  let newest: PanelStep | null = null;
  let newestIndex = -Infinity;
  for (const [step, index] of steps) {
    if (index > newestIndex) {
      newest = step;
      newestIndex = index;
    }
  }
  return newest;
}
