import type { Message } from "@langchain/langgraph-sdk";
import { toolResult, type Json } from "./tool-result";

const COMPARE_TOOL = "compare_resources";

/**
 * One resource as Resource Documentation describes it. A null field means the
 * documentation doesn't cover it, never that the resource lacks it.
 */
export interface ComparedResource {
  id: string;
  name: string;
  organization: string | null;
  status: string | null;
  mfaRequired: boolean | null;
  accountRequired: boolean | null;
  ondemandUrl: string | null;
  sshHosts: string[] | null;
  transferMethods: string[] | null;
  queues: ComparedQueue[] | null;
  waitTimes: WaitTimes | null;
  filesystems: { name: string; summary: string | null }[] | null;
  softwareUrl: string | null;
  citationUrl: string | null;
  /** False when only the listing could be read, not the resource's page. */
  detailsAvailable: boolean;
}

export interface ComparedQueue {
  name: string;
  summary: string | null;
  maxWallTimeHours: number | null;
}

export interface WaitTimes {
  asOf: string;
  queues: {
    queue: string;
    averageWaitHours: number | null;
    jobCount: number | null;
  }[];
}

/** A name the tool couldn't settle on one resource. */
export interface UnresolvedName {
  name: string;
  /** The resources it could mean; empty when it matched none. */
  matches: string[];
}

export interface ResourceComparisonView {
  /** The answer's newest compare_resources call; changes with a new one. */
  key: string;
  resources: ComparedResource[];
  unresolved: UnresolvedName[];
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

const flag = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const objects = (value: unknown): Json[] | null =>
  Array.isArray(value)
    ? value.filter((v): v is Json => !!v && typeof v === "object")
    : null;

function texts(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(text).filter((v): v is string => v !== null);
}

function waitTimes(value: unknown): WaitTimes | null {
  if (!value || typeof value !== "object") return null;
  const { as_of, queues } = value as Json;
  const asOf = text(as_of);
  const rows = objects(queues);
  if (!asOf || !rows || rows.length === 0) return null;
  return {
    asOf,
    queues: rows.flatMap((row) => {
      const queue = text(row.queue);
      return queue
        ? [
            {
              queue,
              averageWaitHours: count(row.average_wait_hours),
              jobCount: count(row.job_count),
            },
          ]
        : [];
    }),
  };
}

function toResource(item: Json): ComparedResource | null {
  const id = text(item.id);
  const name = text(item.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    organization: text(item.organization),
    status: text(item.status),
    mfaRequired: flag(item.mfa_required),
    accountRequired: flag(item.account_required),
    ondemandUrl: text(item.ondemand_url),
    sshHosts: texts(item.ssh_hosts),
    transferMethods: texts(item.transfer_methods),
    queues:
      objects(item.queues)?.flatMap((q) => {
        const queueName = text(q.name);
        return queueName
          ? [
              {
                name: queueName,
                summary: text(q.summary),
                maxWallTimeHours: count(q.max_wall_time_hours),
              },
            ]
          : [];
      }) ?? null,
    waitTimes: waitTimes(item.wait_times),
    filesystems:
      objects(item.filesystems)?.flatMap((f) => {
        const fsName = text(f.name);
        return fsName ? [{ name: fsName, summary: text(f.summary) }] : [];
      }) ?? null,
    softwareUrl: text(item.software_url),
    citationUrl: text(item.citation_url),
    detailsAvailable: item.details_available !== false,
  };
}

function toUnresolved(entry: Json): UnresolvedName | null {
  const name = text(entry.resource);
  if (!name) return null;
  return {
    name,
    matches: (objects(entry.matches) ?? [])
      .map((m) => text(m.name))
      .filter((v): v is string => v !== null),
  };
}

/**
 * One table from every good comparison in a turn: compare_resources takes up
 * to three resources, so a broad question makes several calls. Resources keep
 * the order they were first compared in; a later result for the same one
 * replaces its data. Null when the turn compared no resource.
 */
function mergeTurn(results: [string, Json][]): ResourceComparisonView | null {
  const resources = new Map<string, ComparedResource>();
  const unresolved = new Map<string, UnresolvedName>();
  let key: string | null = null;
  for (const [callId, result] of results) {
    key = callId;
    for (const item of objects(result.items) ?? []) {
      const resource = toResource(item);
      if (resource) resources.set(resource.id, resource);
    }
    for (const entry of objects(result.unresolved) ?? []) {
      const name = toUnresolved(entry);
      if (name) unresolved.set(name.name.toLowerCase(), name);
    }
  }
  if (!key || resources.size === 0) return null;
  return {
    key,
    resources: [...resources.values()],
    unresolved: [...unresolved.values()],
  };
}

interface Turn {
  /** The turn's last AI message, which offers to reopen the table. */
  answer: string | null;
  callIds: string[];
  view: ResourceComparisonView | null;
}

/** Each turn (a human message to the next) and the table it made, in order. */
function turns(messages: Message[]): Turn[] {
  const out: Turn[] = [];
  let answer: string | null = null;
  let results: [string, Json][] = [];
  let callIds: string[] = [];
  const flush = () => {
    out.push({ answer, callIds, view: mergeTurn(results) });
    answer = null;
    results = [];
    callIds = [];
  };
  for (const m of messages) {
    if (m.type === "human") {
      flush();
      continue;
    }
    if (m.type === "ai" && m.id) answer = m.id;
    if (m.type === "tool" && m.name === COMPARE_TOOL) {
      callIds.push(m.tool_call_id);
      const result = toolResult(m);
      if (result) results.push([m.tool_call_id, result]);
    }
  }
  flush();
  return out;
}

/**
 * The newest turn's resource table, read from tool results the conversation
 * already holds, so it comes back when a thread is reopened.
 */
export function latestResourceComparison(
  messages: Message[],
): ResourceComparisonView | null {
  const all = turns(messages);
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].view) return all[i].view;
  }
  return null;
}

/** The table of the turn holding the call with this key, or null. */
export function resourceComparisonFor(
  messages: Message[],
  key: string,
): ResourceComparisonView | null {
  return turns(messages).find((t) => t.callIds.includes(key))?.view ?? null;
}

/** Each answer's table key, by the turn's last AI message. */
export function resourceComparisonsByMessage(
  messages: Message[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const turn of turns(messages)) {
    if (turn.answer && turn.view) out.set(turn.answer, turn.view.key);
  }
  return out;
}
